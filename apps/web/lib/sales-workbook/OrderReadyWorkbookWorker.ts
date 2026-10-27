import "server-only";

import { getBackfillProposal } from "./BackfillProposalService";
import { prepareSalesWorkbookBackfill } from "./BackfillWriter";
import { parseSalesWorkbook } from "./WorkbookParser";
import { SalesWorkbookRepository, sha256 } from "./SalesWorkbookRepository";
import { SalesWorkbookConflictError, SalesWorkbookSizeLimitError } from "./types";

const MAX_AFFECTED_ORDERS = 25;

export type SalesWorkbookWorkerFailureStage = "WORKBOOK_READ" | "PROPOSAL_RPC" | "XLSX_PROCESSING" | "PENDING_WRITE" | "VERIFICATION" | "ACTIVATION";

export class SalesWorkbookWorkerFailure extends Error {
  constructor(public readonly stage: SalesWorkbookWorkerFailureStage) {
    super(`Sales workbook worker failed during ${stage}`);
    this.name = "SalesWorkbookWorkerFailure";
  }
}

async function atStage<T>(stage: SalesWorkbookWorkerFailureStage, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof SalesWorkbookConflictError || error instanceof SalesWorkbookSizeLimitError || error instanceof SalesWorkbookWorkerFailure) throw error;
    throw new SalesWorkbookWorkerFailure(stage);
  }
}

function processAtStage<T>(stage: SalesWorkbookWorkerFailureStage, operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof SalesWorkbookConflictError || error instanceof SalesWorkbookSizeLimitError || error instanceof SalesWorkbookWorkerFailure) throw error;
    throw new SalesWorkbookWorkerFailure(stage);
  }
}

type WorkerDependencies={repository:typeof SalesWorkbookRepository;getBackfillProposal:typeof getBackfillProposal;parseSalesWorkbook:typeof parseSalesWorkbook;prepareSalesWorkbookBackfill:typeof prepareSalesWorkbookBackfill};
const productionDependencies:WorkerDependencies={repository:SalesWorkbookRepository,getBackfillProposal,parseSalesWorkbook,prepareSalesWorkbookBackfill};

export async function runOrderReadyWorkbookWorker(orderNumbers: Iterable<string>,dependencies:WorkerDependencies=productionDependencies) {
  const {repository,getBackfillProposal,parseSalesWorkbook,prepareSalesWorkbookBackfill}=dependencies;
  const affectedOrderNumbers = [...new Set([...orderNumbers].map(value => String(value).trim()).filter(Boolean))];
  if (!affectedOrderNumbers.length || affectedOrderNumbers.length > MAX_AFFECTED_ORDERS) throw new Error("Invalid affected Sales workbook order scope");
  const current = await atStage("WORKBOOK_READ", () => repository.getCurrentWorkbook());
  if (!current) return { workbookAvailable: false, ordersWritten: 0, rowsWritten: 0, writtenOrderNumbers: [] as string[], deferredOrderNumbers: affectedOrderNumbers, deferredReasons: Object.fromEntries(affectedOrderNumbers.map(orderNumber => [orderNumber, ["WORKBOOK_UNAVAILABLE"]])) };
  const pending = await atStage("WORKBOOK_READ", () => repository.findPendingWorkbookVersion(current.id));
  if (pending) {
    const pendingBytes = await atStage("WORKBOOK_READ", () => repository.readWorkbookBytes(pending.storage_path));
    processAtStage("VERIFICATION", () => { if (sha256(pendingBytes) !== pending.content_hash) throw new Error("Pending workbook hash verification failed"); });
    await atStage("ACTIVATION", () => repository.activatePendingWorkbookVersion({ current, version: pending, operatorId: current.uploaded_by_operator_id }));
    // A retry may carry a different newly-ingested order. Once the earlier
    // pending version is safely active, evaluate this bounded event normally.
    return runOrderReadyWorkbookWorker(affectedOrderNumbers,dependencies);
  }
  const { workbook, bytes } = await atStage("WORKBOOK_READ", () => repository.readCurrentWorkbookBytes());
  if (workbook.id !== current.id || workbook.current_version !== current.current_version || workbook.content_hash !== current.content_hash || sha256(new Uint8Array(bytes)) !== current.content_hash) throw new SalesWorkbookConflictError(current);
  const parsed = processAtStage("XLSX_PROCESSING", () => parseSalesWorkbook(Uint8Array.from(new Uint8Array(bytes)).buffer));
  if (!parsed.valid) throw new SalesWorkbookWorkerFailure("XLSX_PROCESSING");
  const proposal = await atStage("PROPOSAL_RPC", () => getBackfillProposal({ affectedOrderNumbers, existingWorkbookOrderNumbers: parsed.rows.flatMap(row => row.orderNumber ? [row.orderNumber] : []) }));
  const prepared = processAtStage("XLSX_PROCESSING", () => prepareSalesWorkbookBackfill(bytes, proposal));
  if (!prepared.ordersWritten) {
    const deferredReasons = Object.fromEntries(proposal.proposals
      .filter(candidate => candidate.classification !== "ready")
      .map(candidate => [candidate.orderNumber, candidate.issues.map(issue => `EVIDENCE_${issue.toUpperCase()}`)]));
    return { workbookAvailable: true, sourceWorkbookVersion: current.current_version, newWorkbookVersion: current.current_version, ...prepared,
      deferredOrderNumbers: Object.keys(deferredReasons), deferredReasons };
  }
  const version = await atStage("PENDING_WRITE", () => repository.writePendingBackfillWorkbook({ bytes: prepared.bytes, operatorId: current.uploaded_by_operator_id, current }));
  processAtStage("VERIFICATION", () => { if (version.workbook_id !== current.id || version.version !== current.current_version + 1 || version.activation_status !== "pending" || sha256(prepared.bytes) !== version.content_hash) throw new Error("Pending workbook version verification failed"); });
  const persistedBytes = await atStage("VERIFICATION", () => repository.readWorkbookBytes(version.storage_path));
  processAtStage("VERIFICATION", () => { if (sha256(persistedBytes) !== version.content_hash) throw new Error("Pending workbook hash verification failed"); });
  const activated = await atStage("ACTIVATION", () => repository.activatePendingWorkbookVersion({ current, version, operatorId: current.uploaded_by_operator_id }));
  return { workbookAvailable: true, sourceWorkbookVersion: current.current_version, newWorkbookVersion: activated.current_version, ...prepared,
    deferredOrderNumbers: [], deferredReasons: {} as Record<string, string[]> };
}
