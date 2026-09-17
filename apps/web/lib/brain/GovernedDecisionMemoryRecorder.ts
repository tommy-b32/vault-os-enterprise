import "server-only";
import { governedDecisionMemoryHash, type GovernedDecisionMemoryProjection } from "@/lib/brain/GovernedDecisionMemory";
import { GovernedDecisionMemoryRepository } from "@/lib/brain/GovernedDecisionMemoryRepository";

/** Records completed governed state only; it never evaluates eligibility or changes inputs. */
export async function recordGovernedDecisionMemory(projection: GovernedDecisionMemoryProjection) {
  return GovernedDecisionMemoryRepository.record({ ...projection, semantic_hash: governedDecisionMemoryHash(projection) });
}
