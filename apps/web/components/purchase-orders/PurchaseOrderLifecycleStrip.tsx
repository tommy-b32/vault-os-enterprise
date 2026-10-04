const stages = [
  "Approval",
  "Payment",
  "Shipping",
  "Receiving",
  "Inventory Posted",
  "Closed",
] as const;

export type PurchaseOrderStatus =
  | "draft"
  | "approved"
  | "ordered"
  | "part_paid"
  | "paid"
  | "shipped"
  | "received"
  | "closed"
  | "cancelled";

type StageState = "complete" | "current" | "upcoming";

export type PaymentEvidence =
  | "unpaid"
  | "part_paid"
  | "paid";

export type InventoryPostingEvidence =
  | "not_applicable"
  | "unposted"
  | "partially_posted"
  | "posted"
  | "blocked";

export type PurchaseOrderLifecycleEvidence = {
  payment: PaymentEvidence;
  shipped: boolean;
  fullyReceived: boolean;
  inventoryPosting: InventoryPostingEvidence;
};

export type LifecycleStage = {
  name: (typeof stages)[number];
  state: StageState;
  detail?: string;
};

const upcoming = (
  name: (typeof stages)[number],
  detail?: string,
): LifecycleStage => ({
  name,
  state: "upcoming",
  detail,
});

const complete = (
  name: (typeof stages)[number],
  detail?: string,
): LifecycleStage => ({
  name,
  state: "complete",
  detail,
});

const current = (
  name: (typeof stages)[number],
  detail?: string,
): LifecycleStage => ({
  name,
  state: "current",
  detail,
});

export function derivePurchaseOrderLifecycle(
  status: PurchaseOrderStatus,
  evidence: PurchaseOrderLifecycleEvidence,
): LifecycleStage[] {
  if (status === "closed") {
    return stages.map((name) => complete(name));
  }

  if (status === "cancelled") {
    return [];
  }

  const approval =
    status === "draft"
      ? current("Approval")
      : complete("Approval");

  if (status === "draft") {
    return [
      approval,
      ...stages
        .slice(1)
        .map((name) => upcoming(name)),
    ];
  }

  if (status === "approved") {
    return [
      approval,
      upcoming("Payment", "Awaiting order placement"),
      upcoming("Shipping"),
      upcoming("Receiving"),
      upcoming("Inventory Posted"),
      upcoming("Closed"),
    ];
  }

  const payment =
    evidence.payment === "paid"
      ? complete("Payment", "Settled")
      : current(
          "Payment",
          evidence.payment === "part_paid"
            ? "Part paid"
            : "Unpaid",
        );

  const shipping = evidence.shipped
    ? complete("Shipping")
    : evidence.payment === "paid"
      ? current("Shipping")
      : upcoming("Shipping");

  const receiving = evidence.fullyReceived
    ? complete("Receiving")
    : evidence.shipped
      ? current("Receiving")
      : upcoming("Receiving");

  const inventory = !evidence.fullyReceived
    ? upcoming("Inventory Posted")
    : evidence.inventoryPosting === "posted"
      ? complete(
          "Inventory Posted",
          "Posted",
        )
      : evidence.inventoryPosting ===
          "not_applicable"
        ? complete(
            "Inventory Posted",
            "Not applicable",
          )
        : current(
            "Inventory Posted",
            evidence.inventoryPosting ===
            "partially_posted"
              ? "Partially posted"
              : evidence.inventoryPosting ===
                  "blocked"
                ? "Blocked"
                : "Not posted",
          );

  const closed =
    evidence.fullyReceived &&
    evidence.payment === "paid" &&
    ["posted", "not_applicable"].includes(
      evidence.inventoryPosting,
    )
      ? current("Closed")
      : upcoming("Closed");

  return [
    approval,
    payment,
    shipping,
    receiving,
    inventory,
    closed,
  ];
}

export function PurchaseOrderLifecycleStrip({
  status,
  evidence,
}: {
  status: PurchaseOrderStatus;
  evidence: PurchaseOrderLifecycleEvidence;
}) {
  if (status === "cancelled") {
    return (
      <section
        className="purchase-order-lifecycle"
        aria-label="Purchase order lifecycle"
      >
        <p className="vault-eyebrow">
          PURCHASING · LIFECYCLE
        </p>

        <strong>Cancelled</strong>

        <p>
          This purchase order is no longer progressing
          through the operational lifecycle.
        </p>
      </section>
    );
  }

  const lifecycle =
    derivePurchaseOrderLifecycle(
      status,
      evidence,
    );

  return (
    <section
      className="purchase-order-lifecycle"
      aria-label="Purchase order lifecycle"
    >
      <div>
        <p className="vault-eyebrow">
          PURCHASING · LIFECYCLE
        </p>

        <h2>Operational lifecycle</h2>

        <p>
          Stage progress reflects persisted payment,
          physical-receipt, and inventory-posting
          evidence.
        </p>
      </div>

      <ol>
        {lifecycle.map((stage) => (
          <li
            className={stage.state}
            key={stage.name}
          >
            <span>
              {stage.state === "complete"
                ? "Complete"
                : stage.state === "current"
                  ? "Current"
                  : "Upcoming"}
            </span>

            <strong>{stage.name}</strong>

            {stage.detail ? (
              <small>
                {stage.detail}
              </small>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}