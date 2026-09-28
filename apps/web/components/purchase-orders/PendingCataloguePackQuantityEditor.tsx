"use client";

import { useState, useTransition } from "react";
import { updatePendingCataloguePackQuantityAction } from "@/app/purchase-orders/actions";

export function PendingCataloguePackQuantityEditor({
  purchaseOrderId,
  purchaseOrderLineId,
  currentPackCount,
}: {
  purchaseOrderId: string;
  purchaseOrderLineId: string;
  currentPackCount: number;
}) {
  const [packCount, setPackCount] = useState(currentPackCount);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  const changed = packCount !== currentPackCount;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.35rem" }}>
      <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
        <input
          aria-label="Pack quantity"
          min={1}
          step={1}
          type="number"
          value={packCount}
          disabled={pending}
          onChange={(event) => setPackCount(Number(event.target.value))}
          style={{ width: "4.5rem" }}
        />
        <button
          type="button"
          disabled={pending || !changed || !Number.isSafeInteger(packCount) || packCount <= 0}
          onClick={() => {
            setMessage("");
            startTransition(async () => {
              const result = await updatePendingCataloguePackQuantityAction({
                purchaseOrderId,
                purchaseOrderLineId,
                packCount,
                idempotencyKey: crypto.randomUUID(),
              });
              setMessage(result.success ? `Updated to ${result.packCount} pack${result.packCount === 1 ? "" : "s"}.` : result.message);
            });
          }}
        >
          {pending ? "Saving…" : "Update"}
        </button>
      </div>
      {message ? <small role="status">{message}</small> : null}
    </div>
  );
}
