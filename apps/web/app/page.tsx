import VaultAppShell from "@/components/layout/VaultAppShell";
import { CommandCentreCockpit } from "@/components/command-centre/CommandCentreCockpit";
import { getCommandCentreCockpit } from "@/lib/command-centre/getCommandCentreCockpit";

export const dynamic = "force-dynamic";

export default async function Home() {
  const cockpit = await getCommandCentreCockpit();

  return (
    <VaultAppShell
      searchPlaceholder="Search Vault OS..."
      notificationCount={cockpit.attention.length}
      systemStatusLabel={`Vault source status: ${cockpit.systemStatus}`}
    >
      <CommandCentreCockpit data={cockpit} />
    </VaultAppShell>
  );
}
