"use client";

import { useEffect, useRef, useState } from "react";

export function PurchaseOrderProductImage({ productImageUrl, productImageAlt }: { productImageUrl: string | null; productImageAlt: string }) {
  const [failed, setFailed] = useState(false), [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const available = Boolean(productImageUrl) && !failed;
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && open) close(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [open]);
  if (!available) return <span className="purchase-order-image-placeholder" aria-label="No product image">NO IMAGE</span>;
  return <span className="purchase-order-image-control"><button ref={trigger} className="purchase-order-thumbnail" type="button" aria-label={`Enlarge ${productImageAlt}`} onClick={() => setOpen(true)}><img src={productImageUrl!} alt={productImageAlt} onError={() => setFailed(true)} /></button><button className="vault-secondary-button purchase-order-enlarge" type="button" onClick={() => setOpen(true)}>Enlarge</button>{open ? <div className="purchase-order-image-backdrop" role="presentation" onMouseDown={close}><section className="purchase-order-image-modal" role="dialog" aria-modal="true" aria-label={`Image preview: ${productImageAlt}`} onMouseDown={(event) => event.stopPropagation()}><img src={productImageUrl!} alt={productImageAlt} onError={() => { setFailed(true); close(); }} /><button className="vault-secondary-button" type="button" onClick={close}>Close</button></section></div> : null}</span>;
}
