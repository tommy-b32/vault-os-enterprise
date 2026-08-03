import {
  PurchasingWallet,
  type PurchasingWalletData,
} from "@/components/commercial/PurchasingWallet";

import {
  SupplierPurchasing,
  type SupplierPurchasingData,
} from "@/components/commercial/SupplierPurchasing";
import { CashLedger } from "@/components/commercial/CashLedger";
import type { CashLedgerSnapshot } from "@/lib/business/CashLedgerRepository";

type CommercialWorkspaceProps = {
  wallet: PurchasingWalletData;
  suppliers: SupplierPurchasingData[];
  cashLedger: CashLedgerSnapshot | null;
  cashLedgerError: string | null;
  canCreateCashTransactions: boolean;
};

export function CommercialWorkspace({
  wallet,
  suppliers,
  cashLedger,
  cashLedgerError,
  canCreateCashTransactions,
}: CommercialWorkspaceProps) {
  return (
    <div className="commercial-workspace">
      <PurchasingWallet wallet={wallet} />

      <CashLedger canCreateTransactions={canCreateCashTransactions} errorMessage={cashLedgerError} snapshot={cashLedger} />

      <SupplierPurchasing suppliers={suppliers} />
    </div>
  );
}
