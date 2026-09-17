import { VaultBrainV2 } from "@/components/brain/VaultBrainV2";
import { GovernedDecisionMemoryFirstCaptureControl } from "@/components/brain/GovernedDecisionMemoryFirstCaptureControl";
import VaultAppShell from "@/components/layout/VaultAppShell";
import { getCurrentOperator } from "@/lib/auth/operators";
import { getVaultBrainIntelligence } from "@/lib/brain/getVaultBrainIntelligence";

export const dynamic = "force-dynamic";

/** Vault Brain is a read-only explanation surface. */
export default async function MissionsPage() {
  const [intelligence, operator] = await Promise.all([
    getVaultBrainIntelligence(),
    getCurrentOperator(),
  ]);

  return (
    <VaultAppShell
      searchPlaceholder="Search Executive Intelligence..."
      notificationCount={intelligence.conclusions.length}
      systemStatusLabel="Governed executive intelligence"
    >
      <VaultBrainV2 data={intelligence} />
      {operator?.role === "owner" ? <GovernedDecisionMemoryFirstCaptureControl /> : null}
    </VaultAppShell>
  );
}
