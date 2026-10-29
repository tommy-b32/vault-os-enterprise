import VaultAppShell from "@/components/layout/VaultAppShell";
import { HistoricalLineCogsWorkflow } from "@/components/operations/HistoricalLineCogsWorkflow";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";

export default async function HistoricalCogsPage() {
  await requireAuthenticatedOperator();
  return <VaultAppShell systemStatusLabel="Governed historical COGS"><HistoricalLineCogsWorkflow /></VaultAppShell>;
}
