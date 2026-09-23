import { FinancialIntelligenceDashboard } from "@/components/financial-intelligence/FinancialIntelligenceDashboard";
import VaultAppShell from "@/components/layout/VaultAppShell";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { financialPeriodFromSearch, financialRangeForPeriod } from "@/lib/financial-intelligence/FinancialIntelligence";
import { FinancialIntelligenceRepository } from "@/lib/financial-intelligence/FinancialIntelligenceRepository";

export const dynamic = "force-dynamic";

export default async function FinancialIntelligencePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  await requireAuthenticatedOperator();
  const period = financialPeriodFromSearch((await searchParams).period);
  try {
    const snapshot = await FinancialIntelligenceRepository.getSnapshot(financialRangeForPeriod(period));
    return <VaultAppShell searchPlaceholder="Search Financial Intelligence..." systemStatusLabel={snapshot.reconciliationPassed ? "Financial evidence reconciled" : "Financial evidence requires attention"}><FinancialIntelligenceDashboard period={period} snapshot={snapshot} /></VaultAppShell>;
  } catch {
    return <VaultAppShell searchPlaceholder="Search Financial Intelligence..." systemStatusLabel="Financial intelligence unavailable"><main className="financial-intelligence-page"><p className="vault-eyebrow">FINANCIAL INTELLIGENCE</p><h1>Financial Intelligence unavailable</h1><p>Verified financial facts could not be loaded. No revenue is shown while verification is unavailable.</p></main></VaultAppShell>;
  }
}
