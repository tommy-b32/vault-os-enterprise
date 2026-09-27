"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { createBlankSupplierPurchaseOrderAction } from "@/app/purchase-orders/actions";

type Supplier = { id: string; supplierName: string };

export function BlankSupplierPurchaseOrderPanel({ suppliers }: { suppliers: readonly Supplier[] }) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const create = async () => {
    if (!supplierId || pending) return;
    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true); setMessage(null);
    const result = await createBlankSupplierPurchaseOrderAction({ supplierId, idempotencyKey: idempotencyKey.current });
    setPending(false);
    if (!result.success) { setMessage(result.error); return; }
    router.push(`/purchase-orders/${result.purchaseOrderId}`);
  };

  return <section className="purchase-order-empty" aria-live="polite">
    <p className="vault-eyebrow">SUPPLIER INTAKE</p>
    <h2>Create blank supplier PO</h2>
    <p>Start a governed draft for an active supplier, then add existing catalogue products and/or new supplier products.</p>
    {suppliers.length ? <><label>Supplier<select value={supplierId} disabled={pending} onChange={(event) => { setSupplierId(event.target.value); idempotencyKey.current = null; setMessage(null); }}>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.supplierName}</option>)}</select></label><button className="vault-primary-button" type="button" disabled={pending || !supplierId} onClick={create}>{pending ? "Creating…" : "Create blank supplier PO"}</button></> : <p>No active suppliers are available.</p>}
    {message ? <p role="alert">{message}</p> : null}
  </section>;
}
