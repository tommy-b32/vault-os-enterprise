import "server-only";

import { getBackfillProposal } from "./BackfillProposalService";
import { prepareSalesWorkbookBackfill } from "./BackfillWriter";
import { parseSalesWorkbook } from "./WorkbookParser";
import { SalesWorkbookRepository, sha256 } from "./SalesWorkbookRepository";
import { SalesWorkbookConflictError } from "./types";

const MAX_AFFECTED_ORDERS = 25;

type WorkerDependencies={repository:typeof SalesWorkbookRepository;getBackfillProposal:typeof getBackfillProposal;parseSalesWorkbook:typeof parseSalesWorkbook;prepareSalesWorkbookBackfill:typeof prepareSalesWorkbookBackfill};
const productionDependencies:WorkerDependencies={repository:SalesWorkbookRepository,getBackfillProposal,parseSalesWorkbook,prepareSalesWorkbookBackfill};

export async function runOrderReadyWorkbookWorker(orderNumbers: Iterable<string>,dependencies:WorkerDependencies=productionDependencies) {
  const {repository,getBackfillProposal,parseSalesWorkbook,prepareSalesWorkbookBackfill}=dependencies;
  const affectedOrderNumbers = [...new Set([...orderNumbers].map(value => String(value).trim()).filter(Boolean))];
  if (!affectedOrderNumbers.length || affectedOrderNumbers.length > MAX_AFFECTED_ORDERS) throw new Error("Invalid affected Sales workbook order scope");
  const current = await repository.getCurrentWorkbook();
  if (!current) return { workbookAvailable: false, ordersWritten: 0, rowsWritten: 0, writtenOrderNumbers: [] as string[], deferredOrderNumbers: affectedOrderNumbers, deferredReasons: Object.fromEntries(affectedOrderNumbers.map(orderNumber => [orderNumber, ["WORKBOOK_UNAVAILABLE"]])) };
  const pending = await repository.findPendingWorkbookVersion(current.id);
  if (pending) {
    const pendingBytes = await repository.readWorkbookBytes(pending.storage_path);
    if (sha256(pendingBytes) !== pending.content_hash) throw new Error("Pending workbook hash verification failed");
    await repository.activatePendingWorkbookVersion({ current, version: pending, operatorId: current.uploaded_by_operator_id });
    // A retry may carry a different newly-ingested order. Once the earlier
    // pending version is safely active, evaluate this bounded event normally.
    return runOrderReadyWorkbookWorker(affectedOrderNumbers,dependencies);
  }
  const { workbook, bytes } = await repository.readCurrentWorkbookBytes();
  if (workbook.id !== current.id || workbook.current_version !== current.current_version || workbook.content_hash !== current.content_hash || sha256(new Uint8Array(bytes)) !== current.content_hash) throw new SalesWorkbookConflictError(current);
  const parsed = parseSalesWorkbook(Uint8Array.from(new Uint8Array(bytes)).buffer);
  if (!parsed.valid) throw new Error("Sales workbook layout is invalid");
  const proposal = await getBackfillProposal({ affectedOrderNumbers, existingWorkbookOrderNumbers: parsed.rows.flatMap(row => row.orderNumber ? [row.orderNumber] : []) });
  const prepared = prepareSalesWorkbookBackfill(bytes, proposal);
  if (!prepared.ordersWritten) {
    const deferredReasons = Object.fromEntries(proposal.proposals
      .filter(candidate => candidate.classification !== "ready")
      .map(candidate => [candidate.orderNumber, candidate.issues.map(issue => `EVIDENCE_${issue.toUpperCase()}`)]));
    return { workbookAvailable: true, sourceWorkbookVersion: current.current_version, newWorkbookVersion: current.current_version, ...prepared,
      deferredOrderNumbers: Object.keys(deferredReasons), deferredReasons };
  }
  const version = await repository.writePendingBackfillWorkbook({ bytes: prepared.bytes, operatorId: current.uploaded_by_operator_id, current });
  if (version.workbook_id !== current.id || version.version !== current.current_version + 1 || version.activation_status !== "pending" || sha256(prepared.bytes) !== version.content_hash) throw new Error("Pending workbook version verification failed");
  const persistedBytes = await repository.readWorkbookBytes(version.storage_path);
  if (sha256(persistedBytes) !== version.content_hash) throw new Error("Pending workbook hash verification failed");
  const activated = await repository.activatePendingWorkbookVersion({ current, version, operatorId: current.uploaded_by_operator_id });
  return { workbookAvailable: true, sourceWorkbookVersion: current.current_version, newWorkbookVersion: activated.current_version, ...prepared,
    deferredOrderNumbers: [], deferredReasons: {} as Record<string, string[]> };
}
