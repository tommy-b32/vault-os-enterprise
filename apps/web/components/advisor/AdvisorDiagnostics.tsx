import type {
  AdvisorDiagnostics as AdvisorDiagnosticsData,
} from "@/lib/brain/AdvisorEngine";

import { AdvisorStat } from "./AdvisorStat";

type Props = {
  diagnostics: AdvisorDiagnosticsData;
};

export function AdvisorDiagnostics({
  diagnostics,
}: Props) {
  return (
    <section className="advisor-diagnostics">
      <header>
        <p className="vault-eyebrow">
          Vault Brain
        </p>

        <h2>Diagnostics</h2>

        <p>
          Live health of your commercial
          intelligence.
        </p>
      </header>

      <div className="advisor-stat-grid">
        <AdvisorStat
          label="Products scanned"
          value={diagnostics.productsScanned}
          highlight
        />

        <AdvisorStat
          label="Commercial data complete"
          value={
            diagnostics.commercialDataComplete
          }
        />

        <AdvisorStat
          label="Commercial data missing"
          value={
            diagnostics.commercialDataMissing
          }
        />

        <AdvisorStat
          label="Supplier assigned"
          value={
            diagnostics.supplierAssigned
          }
        />

        <AdvisorStat
          label="Restock enabled"
          value={
            diagnostics.restockEnabled
          }
        />

        <AdvisorStat
          label="Trusted for reorder"
          value={
            diagnostics.trustedForReorder
          }
        />

        <AdvisorStat
          label="Commercial trusted"
          value={
            diagnostics.commercialCostTrusted
          }
        />

        <AdvisorStat
          label="Low stock"
          value={diagnostics.lowStock}
        />

        <AdvisorStat
          label="Margin target"
          value={
            diagnostics.marginThresholdPassed
          }
        />

        <AdvisorStat
          label="Return target"
          value={
            diagnostics.returnThresholdPassed
          }
        />

        <AdvisorStat
          label="Products qualifying"
          value={
            diagnostics.productsQualifying
          }
          highlight
        />
      </div>
    </section>
  );
}