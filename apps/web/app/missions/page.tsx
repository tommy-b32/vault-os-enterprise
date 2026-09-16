import { VaultBrainV2 } from "@/components/brain/VaultBrainV2";
import VaultAppShell from "@/components/layout/VaultAppShell";
import { getVaultBrainIntelligence } from "@/lib/brain/getVaultBrainIntelligence";

export const dynamic = "force-dynamic";

/** Vault Brain is a read-only explanation surface. */
export default async function MissionsPage() {
  const intelligence = await getVaultBrainIntelligence();

  return (
    <VaultAppShell
      searchPlaceholder="Search Executive Intelligence..."
      notificationCount={intelligence.conclusions.length}
      systemStatusLabel="Governed executive intelligence"
    >
      <VaultBrainV2 data={intelligence} />
    </VaultAppShell>
  );
}
