"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { InventoryFreshness } from "@/lib/inventory/InventoryFreshness";

function formatDate(value: string | null): string {
  if (!value) return "Unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

function formatDuration(value: number | null): string {
  if (value === null) return "Unavailable";
  if (value < 1_000) return `${value} ms`;
  return `${(value / 1_000).toLocaleString("en-GB", { maximumFractionDigits: 1 })} seconds`;
}

export function InventorySyncPanel({ freshness }: { freshness: InventoryFreshness }) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = refreshing ? "syncing" : freshness.syncStatus;

  async function refreshInventory() {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/inventory/refresh", { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Inventory refresh failed");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Inventory refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <section className="inventory-sync-panel" aria-live="polite">
      <div className="inventory-sync-heading">
        <div><span>Shopify Inventory Sync</span><strong className={`is-${status}`}>
          {status === "syncing" ? "Synchronising…" : status.charAt(0).toUpperCase() + status.slice(1)}
        </strong></div>
        <button disabled={refreshing || freshness.syncStatus === "syncing"} onClick={refreshInventory} type="button">
          {refreshing || freshness.syncStatus === "syncing" ? "Refreshing…" : "Refresh Inventory Only"}
        </button>
      </div>
      <p className="inventory-sync-scope">Refreshes stock for variants already known to Vault OS. Scheduled catalogue reconciliation discovers new Shopify products and variants before its inventory run.</p>
      <dl>
        <div><dt>Last successful sync</dt><dd>{formatDate(freshness.lastInventorySync)}</dd></div>
        <div><dt>Products processed</dt><dd>{freshness.productsProcessed ?? "Unavailable"}</dd></div>
        <div><dt>Products updated</dt><dd>{freshness.productsUpdated ?? "Unavailable"}</dd></div>
        <div><dt>Duration</dt><dd>{formatDuration(freshness.syncDuration)}</dd></div>
        <div><dt>Next scheduled sync</dt><dd>{freshness.nextScheduledSync ? formatDate(freshness.nextScheduledSync) : "Schedule active · exact time unavailable"}</dd></div>
        <div><dt>Shopify API</dt><dd>{freshness.shopifyApiSuccess === true ? "Successful" : freshness.shopifyApiSuccess === false ? "Failed" : "Pending"}</dd></div>
      </dl>
      {error ? <p className="inventory-sync-error">{error}</p> : null}
      {freshness.errors.map((message) => <p className="inventory-sync-error" key={message}>{message}</p>)}
      <style>{`
        .inventory-sync-panel{margin:16px 0;padding:18px 20px;border:1px solid rgba(219,177,67,.22);border-radius:11px;background:linear-gradient(145deg,#141716,#0d100f)}.inventory-sync-scope{max-width:720px;margin:10px 0 0;color:#929994;font-size:12px;line-height:1.5}
        .inventory-sync-heading{display:flex;align-items:center;justify-content:space-between;gap:16px}.inventory-sync-heading span{display:block;color:#dbae35;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em}.inventory-sync-heading strong{display:block;margin-top:4px;font-size:18px}.inventory-sync-heading strong.is-current{color:#58d27d}.inventory-sync-heading strong.is-delayed,.inventory-sync-heading strong.is-syncing{color:#e3b43e}.inventory-sync-heading strong.is-failed,.inventory-sync-error{color:#ff7474}.inventory-sync-heading button{min-height:40px;padding:0 16px;border:1px solid rgba(219,177,67,.48);border-radius:7px;color:#e7bd50;background:rgba(219,177,67,.06);font-size:13px;font-weight:700;cursor:pointer}.inventory-sync-heading button:disabled{cursor:not-allowed;opacity:.55}.inventory-sync-panel dl{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin:18px 0 0}.inventory-sync-panel dl>div{padding-left:12px;border-left:1px solid rgba(255,255,255,.08)}.inventory-sync-panel dt{color:#929994;font-size:11px}.inventory-sync-panel dd{margin:5px 0 0;color:#ecebe6;font-size:13px}.inventory-sync-error{margin:12px 0 0;font-size:12px}@media(max-width:1100px){.inventory-sync-panel dl{grid-template-columns:repeat(3,1fr)}}@media(max-width:650px){.inventory-sync-heading{align-items:stretch;flex-direction:column}.inventory-sync-panel dl{grid-template-columns:repeat(2,1fr)}}
      `}</style>
    </section>
  );
}
