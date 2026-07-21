import {
  PurchasingWallet,
  type PurchasingWalletData,
} from "@/components/commercial/PurchasingWallet";

import {
  SupplierPurchasing,
  type SupplierPurchasingData,
} from "@/components/commercial/SupplierPurchasing";

type CommercialWorkspaceProps = {
  wallet: PurchasingWalletData;
  suppliers: SupplierPurchasingData[];
};

export function CommercialWorkspace({
  wallet,
  suppliers,
}: CommercialWorkspaceProps) {
  return (
    <div className="commercial-workspace">
      <PurchasingWallet wallet={wallet} />

      <SupplierPurchasing suppliers={suppliers} />
    </div>
  );
}