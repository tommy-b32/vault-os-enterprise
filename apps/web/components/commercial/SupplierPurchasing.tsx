export type SupplierPurchasingData = {
  id: string;
  supplier_name: string;
  default_lead_time_days: number;
  minimum_order_value: number | null;
  currency_code: string;
  notes: string | null;
};

type SupplierPurchasingProps = {
  suppliers: SupplierPurchasingData[];
};

function getSupplierRule(
  supplierName: string,
): {
  model: string;
  status: "ready" | "waiting" | "dropship";
  statusLabel: string;
  minimumOrder: string;
  guidance: string;
} {
  const name = supplierName.toLowerCase();

  if (name === "exclusive") {
    return {
      model: "Stocked supplier",
      status: "ready",
      statusLabel: "Rules configured",
      minimumOrder: "20 mixed packs",
      guidance:
        "Product costs are still required before Vault Brain can build an affordable mixed basket.",
    };
  }

  if (name === "icon") {
    return {
      model: "Stocked supplier",
      status: "waiting",
      statusLabel: "Rule incomplete",
      minimumOrder: "MOQ not confirmed",
      guidance:
        "Confirm Icon's minimum order before Vault Brain approves purchasing recommendations.",
    };
  }

  if (
    name === "tony" ||
    name.includes("footwear")
  ) {
    return {
      model: "Dropship partner",
      status: "dropship",
      statusLabel: "Dropship",
      minimumOrder: "No stock MOQ",
      guidance:
        "Tony is excluded from owned-stock purchasing and will later support customer-order fulfilment.",
    };
  }

  return {
    model: "Supplier",
    status: "waiting",
    statusLabel: "Setup required",
    minimumOrder: "Not configured",
    guidance:
      "Complete the supplier purchasing rules before Vault Brain uses this supplier.",
  };
}

export function SupplierPurchasing({
  suppliers,
}: SupplierPurchasingProps) {
  return (
    <section className="commercial-card supplier-purchasing">
      <header className="commercial-card-header">
        <div>
          <p className="vault-eyebrow">
            Supplier Purchasing
          </p>

          <h2>Supplier readiness</h2>

          <p>
            Review the ordering rules Vault Brain must
            follow before building supplier baskets.
          </p>
        </div>
      </header>

      <div className="supplier-purchasing-grid">
        {suppliers.map((supplier) => {
          const rule = getSupplierRule(
            supplier.supplier_name,
          );

          return (
            <article
              className="supplier-purchasing-card"
              key={supplier.id}
            >
              <div className="supplier-purchasing-topline">
                <div>
                  <span>{rule.model}</span>
                  <h3>{supplier.supplier_name}</h3>
                </div>

                <span
                  className={`supplier-readiness state-${rule.status}`}
                >
                  {rule.statusLabel}
                </span>
              </div>

              <div className="supplier-purchasing-metrics">
                <div>
                  <span>Minimum order</span>
                  <strong>{rule.minimumOrder}</strong>
                </div>

                <div>
                  <span>Lead time</span>
                  <strong>
                    {supplier.default_lead_time_days} days
                  </strong>
                </div>

                <div>
                  <span>Currency</span>
                  <strong>
                    {supplier.currency_code}
                  </strong>
                </div>
              </div>

              <div className="supplier-purchasing-guidance">
                <span>Vault Brain guidance</span>
                <p>{rule.guidance}</p>
              </div>

              <button
                className="supplier-review-button"
                disabled
                type="button"
              >
                {rule.status === "dropship"
                  ? "View dropship workflow"
                  : "Review basket"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}