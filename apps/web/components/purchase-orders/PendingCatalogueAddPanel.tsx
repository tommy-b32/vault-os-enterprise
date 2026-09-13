"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { addPendingCatalogueProductToDraftAction } from "@/app/purchase-orders/actions";

type SizeRow = { id: string; supplierSizeLabel: string; normalizedSize: string; orderedUnits: number };
const newRow = (): SizeRow => ({ id: crypto.randomUUID(), supplierSizeLabel: "", normalizedSize: "", orderedUnits: 0 });

export function PendingCatalogueAddPanel({ purchaseOrderId, supplierName }: { purchaseOrderId: string; supplierName: string }) {
  const router = useRouter();
  const idempotencyKey = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [workingTitle, setWorkingTitle] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [brand, setBrand] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [colourModel, setColourModel] = useState("");
  const [modelDesign, setModelDesign] = useState("");
  const [notes, setNotes] = useState("");
  const [orderedUnits, setOrderedUnits] = useState(0);
  const [unitCostGbp, setUnitCostGbp] = useState(0);
  const [sizes, setSizes] = useState<SizeRow[]>([newRow()]);
  const allocatedUnits = useMemo(() => sizes.reduce((sum, size) => sum + (Number.isSafeInteger(size.orderedUnits) ? size.orderedUnits : 0), 0), [sizes]);
  const sizesValid = sizes.length > 0 && sizes.every((size) => size.supplierSizeLabel.trim() && size.normalizedSize.trim() && Number.isSafeInteger(size.orderedUnits) && size.orderedUnits > 0)
    && new Set(sizes.map((size) => size.normalizedSize.trim())).size === sizes.length;
  const ready = workingTitle.trim() && modelDesign.trim() && Number.isSafeInteger(orderedUnits) && orderedUnits > 0
    && Number.isFinite(unitCostGbp) && unitCostGbp >= 0 && sizesValid && allocatedUnits === orderedUnits;
  const updateSize = (id: string, patch: Partial<SizeRow>) => setSizes((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  async function submit() {
    if (!ready || pending) return;
    idempotencyKey.current ??= crypto.randomUUID();
    setPending(true); setNotice(null);
    const result = await addPendingCatalogueProductToDraftAction({ purchaseOrderId, workingTitle, supplierReference, brand, productCategory, colourModel, modelDesign, notes, orderedUnits, unitCostGbp, sizes: sizes.map(({ supplierSizeLabel, normalizedSize, orderedUnits: units }) => ({ supplierSizeLabel, normalizedSize, orderedUnits: units })), idempotencyKey: idempotencyKey.current });
    setPending(false);
    if (!result.success) { setNotice(result.message); return; }
    setNotice(`Added ${workingTitle.trim()} as a pending catalogue product.`);
    idempotencyKey.current = null; setOpen(false); router.refresh();
  }
  return <section aria-live="polite" className="purchase-order-supplier-draft">
    <p className="vault-eyebrow">ADD PRODUCT</p>
    <p>Need a product that is not yet in Shopify? Add it as pending catalogue evidence for {supplierName}.</p>
    {!open ? <button className="vault-primary-button" type="button" onClick={() => { setNotice(null); setOpen(true); }}>New Product</button> : <div>
      <h3>New pending catalogue product</h3>
      <label>Working product title<input value={workingTitle} disabled={pending} onChange={(event) => setWorkingTitle(event.target.value)} /></label>
      <label>Supplier reference<input value={supplierReference} disabled={pending} onChange={(event) => setSupplierReference(event.target.value)} /></label>
      <label>Brand<input value={brand} disabled={pending} onChange={(event) => setBrand(event.target.value)} /></label>
      <label>Category<input value={productCategory} disabled={pending} onChange={(event) => setProductCategory(event.target.value)} /></label>
      <label>Colour / model<input value={colourModel} disabled={pending} onChange={(event) => setColourModel(event.target.value)} /></label>
      <label>Model / design<input value={modelDesign} disabled={pending} onChange={(event) => setModelDesign(event.target.value)} /></label>
      <label>Notes<textarea value={notes} disabled={pending} onChange={(event) => setNotes(event.target.value)} rows={2} /></label>
      <label>Total ordered units<input value={orderedUnits || ""} disabled={pending} min="1" step="1" type="number" onChange={(event) => setOrderedUnits(Number(event.target.value))} /></label>
      <label>Unit cost (GBP)<input value={unitCostGbp || ""} disabled={pending} min="0" step="0.01" type="number" onChange={(event) => setUnitCostGbp(Number(event.target.value))} /></label>
      <div className="purchase-order-preparation-lines"><strong>Exact size allocations</strong>{sizes.map((size) => <div key={size.id}>
        <label>Supplier size<input value={size.supplierSizeLabel} disabled={pending} onChange={(event) => updateSize(size.id, { supplierSizeLabel: event.target.value })} /></label>
        <label>Normalized size<input value={size.normalizedSize} disabled={pending} onChange={(event) => updateSize(size.id, { normalizedSize: event.target.value })} /></label>
        <label>Qty<input value={size.orderedUnits || ""} disabled={pending} min="1" step="1" type="number" onChange={(event) => updateSize(size.id, { orderedUnits: Number(event.target.value) })} /></label>
        {sizes.length > 1 ? <button disabled={pending} type="button" onClick={() => setSizes((rows) => rows.filter((row) => row.id !== size.id))}>Remove size</button> : null}
      </div>)}<button disabled={pending} type="button" onClick={() => setSizes((rows) => [...rows, newRow()])}>Add size</button></div>
      <p>Total ordered: {orderedUnits || 0} · Allocated: {allocatedUnits} · Remaining: {(orderedUnits || 0) - allocatedUnits}</p>
      <button className="vault-primary-button" disabled={pending || !ready} type="button" onClick={submit}>{pending ? "Adding…" : "Add New Product"}</button>
      <button className="vault-secondary-button" disabled={pending} type="button" onClick={() => setOpen(false)}>Cancel</button>
    </div>}
    {notice ? <p role="alert">{notice}</p> : null}
  </section>;
}
