"use client";

import { useEffect, useMemo, useState } from "react";

type Stored = {
  id: string;
  filename: string;
  currentVersion: number;
  uploadedAt: string;
  lastModifiedAt?: string;
};

export type SalesWorkbookSourceRow = {
  values: string[];
  orderNumber: string | null;
  dateOfSale?: string;
  rowNumber?: number;
};

export type ViewerRow = {
  products: string;
  salePrice: string;
  cost: string;
  unitCogs: string;
  postage: string;
  cardFee: string;
  profit: string;
  posted: string;
  tracking: string;
  date: string;
  orderNumber: string | null;
  rowNumber: number;
  rawRows: SalesWorkbookSourceRow[];
};

const workbookDate = (value: string): number | null => {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(value.trim());
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const rawYear = Number(match[3]);
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date.getTime()
    : null;
};

const monetaryValue = (value: string): number | null => {
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const sumCurrency = (values: string[]): string => {
  const parsed = values.map(monetaryValue);
  if (!parsed.every((value): value is number => value !== null)) return "";

  const total = parsed.reduce((sum, value) => sum + value, 0);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(total);
};

const aggregateProducts = (rows: SalesWorkbookSourceRow[]): string => {
  const counts = new Map<string, number>();
  for (const label of rows.map((row) => row.values[0]).filter(Boolean)) {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => (count > 1 ? `${label} x${count}` : label))
    .join(" / ");
};

const normalizedGroupKey = (row: SalesWorkbookSourceRow, index: number): string => {
  const orderNumber = row.orderNumber?.trim();
  return orderNumber ? `order:${orderNumber}` : `manual:${row.rowNumber ?? index}`;
};

const numericShopifyOrderNumber = (value: string | null): number | null => {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

/** Builds the read-only order-level view without changing parsed workbook rows. */
export const groupSalesRows = (source: SalesWorkbookSourceRow[]): ViewerRow[] => {
  const groups = new Map<string, SalesWorkbookSourceRow[]>();

  source.forEach((row, index) => {
    const key = normalizedGroupKey(row, index);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  return [...groups.values()].map((rows) => {
    const datedRows = rows
      .map((row) => {
        const display = row.dateOfSale ?? row.values[10] ?? "";
        return { display, timestamp: workbookDate(display) };
      })
      .filter((date) => date.timestamp !== null);
    const distinctDates = new Set(datedRows.map((date) => date.timestamp));
    const tracking = [...new Set(rows.map((row) => row.values[8]).filter(Boolean))];
    const allComplete = rows.every((row) => row.values[7] === "Complete");
    const posted = allComplete ? "Complete" : rows.some((row) => row.values[7]) ? "Partial" : "";

    return {
      products: aggregateProducts(rows),
      salePrice: sumCurrency(rows.map((row) => row.values[1])),
      cost: sumCurrency(rows.map((row) => row.values[2])),
      unitCogs: sumCurrency(rows.map((row) => row.values[3])),
      postage: sumCurrency(rows.map((row) => row.values[4])),
      cardFee: sumCurrency(rows.map((row) => row.values[5])),
      profit: sumCurrency(rows.map((row) => row.values[6])),
      posted,
      tracking: tracking.join(" / "),
      date: distinctDates.size === 1 ? datedRows[0].display : "",
      orderNumber: rows[0].orderNumber?.trim() || null,
      rowNumber: Math.max(...rows.map((row) => row.rowNumber ?? 0)),
      rawRows: rows,
    };
  });
};

/** Sorts numbered Shopify orders first; manual rows then retain date-based ordering. */
export const sortViewerRows = (rows: ViewerRow[]): ViewerRow[] =>
  [...rows].sort((left, right) => {
    const leftOrder = numericShopifyOrderNumber(left.orderNumber);
    const rightOrder = numericShopifyOrderNumber(right.orderNumber);
    if (leftOrder !== null && rightOrder !== null) {
      return rightOrder - leftOrder || right.rowNumber - left.rowNumber;
    }
    if (leftOrder !== null) return -1;
    if (rightOrder !== null) return 1;

    const leftDate = workbookDate(left.date);
    const rightDate = workbookDate(right.date);
    if (leftDate !== null && rightDate !== null) {
      return rightDate - leftDate || right.rowNumber - left.rowNumber;
    }
    if (leftDate !== null) return -1;
    if (rightDate !== null) return 1;
    return right.rowNumber - left.rowNumber;
  });

export const filterViewerRows = (rows: ViewerRow[], query: string, posted: string): ViewerRow[] =>
  rows.filter((row) =>
    (posted === "All" || row.posted === posted)
    && (!query || [row.products, row.tracking, row.orderNumber]
      .some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase()))),
  );

const viewerColumnClasses = [
  "sales-workbook-product",
  "sales-workbook-money",
  "sales-workbook-money",
  "sales-workbook-money",
  "sales-workbook-money",
  "sales-workbook-money",
  "sales-workbook-money",
  "sales-workbook-posted",
  "sales-workbook-tracking",
  "sales-workbook-date",
  "sales-workbook-order-number",
];

const viewerColumnLabels = [
  "Product", "Sale Price", "Cost", "Unit COGS", "Postage fee", "Card Fee", "Profit", "Posted", "Tracking", "Date of sale", "Order number",
];

const salesWorkbookViewerStyles = `
  .sales-workbook-viewer{margin-top:22px;padding:18px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:#0d100e}
  .sales-workbook-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 14px}
  .sales-workbook-toolbar input,.sales-workbook-toolbar select{height:38px;padding:0 11px;color:#eee;background:#101311;border:1px solid rgba(255,255,255,.12);border-radius:7px}
  .sales-workbook-toolbar input{min-width:230px;flex:1 1 260px}.sales-workbook-toolbar select{min-width:112px}
  .sales-workbook-count{margin-left:auto;color:#929994;font-size:12px;white-space:nowrap}
  .sales-workbook-table-wrap{overflow-x:auto;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:#0d100e}
  .sales-workbook-table{width:100%;min-width:1570px;table-layout:fixed;border-collapse:collapse;font-size:13px}
  .sales-workbook-table th,.sales-workbook-table td{padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.07);vertical-align:middle}
  .sales-workbook-table th{position:sticky;top:0;z-index:1;color:#9da49f;background:#101311;font-size:10px;font-weight:600;letter-spacing:.07em;text-align:left;text-transform:uppercase;white-space:nowrap}
  .sales-workbook-table tbody tr:hover{background:rgba(255,255,255,.025)}
  .sales-workbook-product{width:380px;text-align:left}.sales-workbook-money{width:100px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.sales-workbook-posted{width:100px;text-align:center;white-space:nowrap}.sales-workbook-tracking{width:180px;text-align:left}.sales-workbook-date{width:105px;text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums}.sales-workbook-order-number{width:105px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .sales-workbook-product,.sales-workbook-tracking{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sales-workbook-pagination{display:flex;align-items:center;gap:10px;margin-top:14px;color:#929994;font-size:12px}.sales-workbook-pagination button{min-width:82px}
  @media(max-width:700px){.sales-workbook-viewer{padding:14px}.sales-workbook-toolbar input{flex-basis:100%}.sales-workbook-count{margin-left:0;flex-basis:100%}}
`;

export function SalesWorkbookUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [stored, setStored] = useState<Stored | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<SalesWorkbookSourceRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [payout, setPayout] = useState("All");
  const [size, setSize] = useState(50);
  const [page, setPage] = useState(1);

  useEffect(() => {
    void fetch("/api/sales-workbook")
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error();
        setStored(payload.workbook);
      })
      .catch(() => setMessage("Workbook status is unavailable. Please try again."))
      .finally(() => setChecking(false));
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setMessage("Choose an .xlsx workbook to continue.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append("workbook", file);
      const response = await fetch("/api/sales-workbook", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(response.status === 409
          ? "A managed workbook already exists."
          : response.status === 400
            ? "That file is not a valid workbook upload."
            : "Workbook upload failed. Please try again.");
        return;
      }
      setStored(payload.workbook);
    } catch {
      setMessage("Workbook upload failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function view() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/sales-workbook/view");
      const payload = await response.json();
      if (!response.ok) throw new Error();
      setRows(payload.sheet.rows);
      setStored((current) => current ?? {
        id: "",
        filename: payload.workbook.filename,
        currentVersion: payload.workbook.version,
        uploadedAt: "",
      });
    } catch {
      setMessage("Sales workbook view is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  const groupedRows = useMemo(() => groupSalesRows(rows ?? []), [rows]);
  const visibleRows = sortViewerRows(filterViewerRows(groupedRows, query, payout));
  const pages = Math.max(1, Math.ceil(visibleRows.length / size));
  const shown = visibleRows.slice((page - 1) * size, page * size);
  const payouts = ["All", ...new Set(groupedRows.map((row) => row.posted).filter(Boolean))];

  if (checking) {
    return <section className="order-unavailable"><p>Checking managed workbook…</p></section>;
  }

  return <section className="order-unavailable">
    <h2>{stored ? "Stored securely" : "Upload the first workbook"}</h2>
    {stored ? <>
      <dl>
        <dt>Filename</dt><dd>{stored.filename}</dd>
        <dt>Current version</dt><dd>{stored.currentVersion}</dd>
        <dt>Status</dt><dd>Stored securely</dd>
      </dl>
      <button disabled={busy} onClick={view} type="button">{busy ? "Loading…" : "View Sales"}</button>
    </> : <form onSubmit={submit}>
      <p>Upload only a Stock Costings-style XLSX workbook. Accepted type: .xlsx · Maximum size: 20 MB.</p>
      <input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" />
      <button disabled={busy} type="submit">{busy ? "Uploading…" : "Upload Workbook"}</button>
    </form>}
    {rows ? <section className="sales-workbook-viewer">
      <style>{salesWorkbookViewerStyles}</style>
      <div className="sales-workbook-toolbar">
        <input onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search product, tracking or order" />
        <select onChange={(event) => { setPayout(event.target.value); setPage(1); }} value={payout}>{payouts.map((value) => <option key={value}>{value}</option>)}</select>
        <select onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }} value={size}>{[25, 50, 100].map((value) => <option key={value}>{value}</option>)}</select>
        <span className="sales-workbook-count">{visibleRows.length} orders · {rows.length} underlying sales rows</span>
      </div>
      <div className="sales-workbook-table-wrap">
        <table className="sales-workbook-table">
          <colgroup>{viewerColumnClasses.map((className, index) => <col className={className} key={index} />)}</colgroup>
          <thead><tr>{viewerColumnLabels.map((value, index) => <th className={viewerColumnClasses[index]} key={value}>{value}</th>)}</tr></thead>
          <tbody>{shown.map((row) => <tr key={`${row.orderNumber ?? "manual"}-${row.rowNumber}`}>
            {[row.products, row.salePrice, row.cost, row.unitCogs, row.postage, row.cardFee, row.profit, row.posted, row.tracking, row.date, row.orderNumber ?? ""].map((value, index) => <td className={viewerColumnClasses[index]} key={index} title={index === 0 || index === 8 ? value : undefined}>{value}</td>)}
          </tr>)}</tbody>
        </table>
      </div>
      <div className="sales-workbook-pagination">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} type="button">Previous</button>
        <span>Page {page} of {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)} type="button">Next</button>
      </div>
    </section> : null}
    {message ? <p role="alert">{message}</p> : null}
  </section>;
}
