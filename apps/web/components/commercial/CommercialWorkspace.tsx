import {
  PurchasingWallet,
  type PurchasingWalletData,
} from "@/components/commercial/PurchasingWallet";

import {
  SupplierPurchasing,
  type SupplierPurchasingData,
} from "@/components/commercial/SupplierPurchasing";
import { CashLedger } from "@/components/commercial/CashLedger";
import { SupplierCostProfiles, type SupplierCostProfileRecord } from "@/components/commercial/SupplierCostProfiles";
import type { CashLedgerSnapshot } from "@/lib/business/CashLedgerRepository";

type CommercialWorkspaceProps = {
  wallet: PurchasingWalletData;
  suppliers: SupplierPurchasingData[];
  cashLedger: CashLedgerSnapshot | null;
  cashLedgerError: string | null;
  canCreateCashTransactions: boolean;
  costProfiles: SupplierCostProfileRecord[];
};

export function CommercialWorkspace({
  wallet,
  suppliers,
  cashLedger,
  cashLedgerError,
  canCreateCashTransactions,
  costProfiles,
}: CommercialWorkspaceProps) {
  return (
    <div className="commercial-workspace">
      <PurchasingWallet wallet={wallet} />

      <CashLedger canCreateTransactions={canCreateCashTransactions} errorMessage={cashLedgerError} snapshot={cashLedger} />

      <section className="commercial-capacity-constraints" aria-label="Purchasing capacity constraints">
        <p className="vault-eyebrow">PURCHASING-CAPACITY CONSTRAINTS</p>
        <p>Available capacity is constrained by the protected reserve, committed orders, and the wallet state above.</p>
      </section>

      <details className="commercial-deferred-supplier">
        <summary><span>SUPPLIER CONFIGURATION</span><strong>Supplier minimums and cost profiles</strong></summary>
        <p>Supplier rules and cost profiles will ultimately live under Suppliers/Catalogue.</p>
        <SupplierPurchasing suppliers={suppliers} />
        <SupplierCostProfiles suppliers={suppliers} profiles={costProfiles} />
      </details>
    </div>
  );
}
