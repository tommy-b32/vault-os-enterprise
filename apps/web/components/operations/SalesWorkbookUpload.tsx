"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type CanonicalOrderLinks = { shopifyAdminUrl: string | null; tracking: Array<{ number: string; url: string | null }> };
type CorrectionPreview = { proposalId: string; original: unknown; corrected: unknown; readinessBefore: string; readinessAfter: string };
type InlineFinancialType = "sale_price" | "cogs" | "postage" | "card_fee";
type InlineEdit = { row: ViewerRow; type: InlineFinancialType };
type StagedEdit = { row: ViewerRow; type: InlineFinancialType; value: string; reason: string };
const inlineFinancialTypes: Partial<Record<number, InlineFinancialType>> = { 1: "sale_price", 3: "cogs", 4: "postage", 5: "card_fee" };

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

const profitNumber = (value: string) => monetaryValue(value);
const inLondonRange = (date: string, range: "week" | "month" | "year", now = new Date()) => {
  const timestamp = workbookDate(date);
  if (timestamp === null) return false;
  const value = new Date(timestamp), localNow = new Date(now.toLocaleString("en-US", { timeZone: "Europe/London" }));
  if (range === "year") return value.getFullYear() === localNow.getFullYear();
  if (range === "month") return value.getFullYear() === localNow.getFullYear() && value.getMonth() === localNow.getMonth();
  const monday = new Date(localNow); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 7);
  return value >= monday && value < sunday;
};
export const profitSummary = (rows: ViewerRow[], range: "week" | "month" | "year", now = new Date()) => {
  const scoped = rows.filter((row) => inLondonRange(row.date, range, now));
  const resolved = scoped.map((row) => profitNumber(row.profit));
  return { total: resolved.filter((value): value is number => value !== null).reduce((sum, value) => sum + value, 0), incomplete: resolved.filter((value) => value === null).length, count: scoped.length };
};

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
  .sales-workbook-table{width:100%;min-width:1760px;table-layout:fixed;border-collapse:collapse;font-size:13px}
  .sales-workbook-table th,.sales-workbook-table td{padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.07);vertical-align:middle}
  .sales-workbook-table th{position:sticky;top:0;z-index:1;color:#9da49f;background:#101311;font-size:10px;font-weight:600;letter-spacing:.07em;text-align:left;text-transform:uppercase;white-space:nowrap}
  .sales-workbook-table tbody tr:hover{background:rgba(255,255,255,.025)}
  .sales-workbook-product{width:380px;text-align:left}.sales-workbook-money{width:100px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.sales-workbook-posted{width:100px;text-align:center;white-space:nowrap}.sales-workbook-tracking{width:180px;text-align:left}.sales-workbook-date{width:105px;text-align:center;white-space:nowrap;font-variant-numeric:tabular-nums}.sales-workbook-order-number{width:105px;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  .sales-workbook-product,.sales-workbook-tracking{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .sales-workbook-inline-cell{width:100%;padding:3px 5px;color:inherit;background:transparent;border:1px solid transparent;border-radius:4px;font:inherit;text-align:right;cursor:pointer}.sales-workbook-inline-cell:hover,.sales-workbook-inline-cell:focus-visible{border-color:rgba(214,189,119,.7);background:rgba(214,189,119,.08);outline:none}.sales-workbook-inline-cell--missing{color:#caa65b;font-style:italic}.sales-workbook-inline-value{width:100%;box-sizing:border-box;padding:3px 5px;color:#eee;background:#090b09;border:1px solid rgba(214,189,119,.7);border-radius:4px;font:inherit;text-align:right;outline:none;appearance:textfield}.sales-workbook-inline-value::-webkit-outer-spin-button,.sales-workbook-inline-value::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}.sales-workbook-tracking a{color:#d6bd77;text-decoration:underline;text-underline-offset:2px}.sales-workbook-inline-popover{position:fixed;z-index:30;width:min(340px,calc(100vw - 16px));padding:12px;border:1px solid rgba(214,189,119,.55);border-radius:8px;background:#101311;box-shadow:0 12px 30px rgba(0,0,0,.45)}.sales-workbook-inline-popover strong{display:block;margin-bottom:8px;font-size:12px}.sales-workbook-inline-popover input{width:100%;box-sizing:border-box;height:34px;padding:0 8px;background:#090b09;color:#eee;border:1px solid rgba(255,255,255,.18);border-radius:5px}.sales-workbook-inline-popover-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.sales-workbook-inline-popover button{padding:7px 10px}.sales-workbook-inline-popover span{display:block;margin-top:8px;color:#929994;font-size:12px}.sales-workbook-inline-feedback{margin:10px 0 0;color:#c7ccc8;font-size:12px}
  .sales-workbook-actions{width:210px;white-space:nowrap}.sales-workbook-actions a,.sales-workbook-actions button{margin:2px 5px 2px 0;color:#d6bd77;background:transparent;border:1px solid rgba(214,189,119,.45);border-radius:5px;padding:5px 7px;font:inherit;font-size:12px;text-decoration:none;cursor:pointer}.sales-workbook-actions button:disabled{opacity:.5;cursor:wait}.sales-workbook-profit-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 16px}.sales-workbook-profit-card{padding:14px;border:1px solid rgba(214,189,119,.35);border-radius:8px;background:#121510}.sales-workbook-profit-card span{display:block;color:#9da49f;font-size:10px;letter-spacing:.07em}.sales-workbook-profit-card strong{display:block;margin-top:6px;font-size:20px}.sales-workbook-profit-card small{display:block;margin-top:5px;color:#caa65b}.sales-workbook-edit{margin-top:14px;padding:14px;border:1px solid rgba(214,189,119,.4);border-radius:8px;background:#101311}.sales-workbook-edit label{display:grid;gap:5px;margin:8px 0;color:#c7ccc8;font-size:12px}.sales-workbook-edit input,.sales-workbook-edit select{height:36px;max-width:360px;padding:0 8px;background:#090b09;color:#eee;border:1px solid rgba(255,255,255,.18);border-radius:5px}.sales-workbook-edit-actions{display:flex;gap:8px;margin-top:10px}.sales-workbook-edit button{padding:7px 10px}
  .sales-workbook-inline-cell--changed{border-color:rgba(214,189,119,.9)!important;background:rgba(214,189,119,.18)!important;color:#f0d887}
  .sales-workbook-pagination{display:flex;align-items:center;gap:10px;margin-top:14px;color:#929994;font-size:12px}.sales-workbook-pagination button{min-width:82px}
  @media(max-width:700px){.sales-workbook-viewer{padding:14px}.sales-workbook-toolbar input{flex-basis:100%}.sales-workbook-count{margin-left:0;flex-basis:100%}.sales-workbook-profit-cards{grid-template-columns:1fr}}
`;

export function SalesWorkbookUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [stored, setStored] = useState<Stored | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<SalesWorkbookSourceRow[] | null>(null);
  const [canonical, setCanonical] = useState<Record<string, CanonicalOrderLinks>>({});
  const [query, setQuery] = useState("");
  const [payout, setPayout] = useState("All");
  const [size, setSize] = useState(50);
  const [page, setPage] = useState(1);
  const [correctionPreview, setCorrectionPreview] = useState<CorrectionPreview | null>(null);
  const [inlineEdit, setInlineEdit] = useState<InlineEdit | null>(null);
  const [stagedEdits, setStagedEdits] = useState<Record<string, StagedEdit>>({});
  const [batchPreview, setBatchPreview] = useState<{ batchId: string; corrections: Array<{ orderNumber: string; type: string; original: unknown; corrected: unknown }> } | null>(null);
  const activeCellRef = useRef<HTMLInputElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null);
  const editKey = (row: ViewerRow, type: InlineFinancialType) => `${row.orderNumber}:${type}`;

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

  async function view(silent = false) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/sales-workbook/view");
      const payload = await response.json();
      if (!response.ok) throw new Error();
      setRows(payload.sheet.rows);
      setCanonical(payload.canonical ?? {});
      setStored((current) => current ?? {
        id: "",
        filename: payload.workbook.filename,
        currentVersion: payload.workbook.version,
        uploadedAt: "",
      });
    } catch {
      if (!silent) setMessage("Sales workbook view is unavailable.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!rows) return;
    const timer = window.setInterval(() => { void view(true); }, 30_000);
    return () => window.clearInterval(timer);
  }, [rows]);

  useEffect(() => {
    if (!inlineEdit) { setPopoverPosition(null); return; }
    const updatePopoverPosition = () => {
      const rect = activeCellRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(340, window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const top = rect.bottom + 8 + 180 > window.innerHeight ? Math.max(8, rect.top - 180) : rect.bottom + 8;
      setPopoverPosition({ top, left });
    };
    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);
    return () => { window.removeEventListener("resize", updatePopoverPosition); window.removeEventListener("scroll", updatePopoverPosition, true); };
  }, [inlineEdit]);
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (!Object.keys(stagedEdits).length) return; event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [stagedEdits]);

  async function createCorrectionProposal(row: ViewerRow, type: string, value: string, reason: string) {
    if (!row.orderNumber || !reason.trim()) { setMessage("A correction reason is required."); return; }
    if ((["sale_price", "cogs", "postage", "card_fee"] as string[]).includes(type) && !value.trim()) { setMessage("A financial value is required."); return; }
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/sales-workbook/corrections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderNumber: row.orderNumber, type, value, reason }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Correction proposal failed");
      setCorrectionPreview(payload);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Correction proposal failed."); } finally { setBusy(false); }
  }
  async function proposeInlineCorrection() {
    if (!inlineEdit) return;
    const staged=stagedEdits[editKey(inlineEdit.row,inlineEdit.type)];
    await createCorrectionProposal(inlineEdit.row, inlineEdit.type, staged?.value??"", staged?.reason??"");
  }

  async function applyCorrection() {
    if (!correctionPreview) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/sales-workbook/corrections", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "apply", proposalId: correctionPreview.proposalId }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Correction could not be applied");
      const successMessage = `Correction activated in workbook version ${payload.newWorkbookVersion}.`; setCorrectionPreview(null); await view(true); setMessage(successMessage);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Correction could not be applied."); } finally { setBusy(false); }
  }
  async function reviewBatch() { const corrections=Object.values(stagedEdits); if (!corrections.length) return; if (corrections.some(edit=>!edit.reason.trim()||!edit.value.trim())) { setMessage("Each changed order needs a correction reason and each financial cell needs a value."); return; } setBusy(true); setMessage(null); try { const response=await fetch("/api/sales-workbook/corrections",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"review-batch",corrections:corrections.map(edit=>({orderNumber:edit.row.orderNumber,type:edit.type,value:edit.value,reason:edit.reason}))})}); const payload=await response.json(); if(!response.ok)throw new Error(payload.error??"Batch review failed"); setBatchPreview(payload); } catch(error) { setMessage(error instanceof Error?error.message:"Batch review failed."); } finally { setBusy(false); } }
  async function applyBatch() { if(!batchPreview)return; setBusy(true); setMessage(null); try { const response=await fetch("/api/sales-workbook/corrections",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"apply-batch",batchId:batchPreview.batchId})}); const payload=await response.json(); if(!response.ok)throw new Error(payload.error??"Batch could not be applied"); setStagedEdits({}); setBatchPreview(null); setInlineEdit(null); await view(true); setMessage(`Batch activated in workbook version ${payload.newWorkbookVersion}.`); } catch(error) { setMessage(error instanceof Error?error.message:"Batch could not be applied."); } finally { setBusy(false); } }
  const discardChanges=()=>{ if(!Object.keys(stagedEdits).length||window.confirm("Discard all unsaved Sales Workbook changes?")){setStagedEdits({});setBatchPreview(null);setInlineEdit(null);setMessage(null);} };

  const groupedRows = useMemo(() => groupSalesRows(rows ?? []), [rows]);
  const visibleRows = sortViewerRows(filterViewerRows(groupedRows, query, payout));
  const pages = Math.max(1, Math.ceil(visibleRows.length / size));
  const shown = visibleRows.slice((page - 1) * size, page * size);
  const payouts = ["All", ...new Set(groupedRows.map((row) => row.posted).filter(Boolean))];
  const summaries = { week: profitSummary(groupedRows, "week"), month: profitSummary(groupedRows, "month"), year: profitSummary(groupedRows, "year") };
  const startInlineEdit = (row: ViewerRow, type: InlineFinancialType, value: string) => {
    if (!row.orderNumber || row.rawRows.length !== 1) { setMessage("Inline editing is available only for a single mapped Sales line; use Edit for a grouped order."); return; }
    const key=editKey(row,type),existing=stagedEdits[key]; setCorrectionPreview(null); setInlineEdit({ row, type }); setStagedEdits(current=>existing?current:{...current,[key]:{row,type,value:monetaryValue(value)?.toString()??"",reason:""}}); setMessage(null);
  };

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
      <button disabled={busy} onClick={() => { void view(); }} type="button">{busy ? "Loading…" : "View Sales"}</button>
    </> : <form onSubmit={submit}>
      <p>Upload only a Stock Costings-style XLSX workbook. Accepted type: .xlsx · Maximum size: 20 MB.</p>
      <input accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" />
      <button disabled={busy} type="submit">{busy ? "Uploading…" : "Upload Workbook"}</button>
    </form>}
    {rows ? <section className="sales-workbook-viewer">
      <style>{salesWorkbookViewerStyles}</style>
      <div className="sales-workbook-profit-cards">{(["week", "month", "year"] as const).map((range) => { const summary = summaries[range]; return <article className="sales-workbook-profit-card" key={range}><span>PROFIT THIS {range.toUpperCase()}</span><strong>{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(summary.total)}</strong><small>{summary.incomplete ? `${summary.incomplete} incomplete order${summary.incomplete === 1 ? "" : "s"} excluded from subtotal` : `${summary.count} order${summary.count === 1 ? "" : "s"} covered`}</small></article>; })}</div>
      <div className="sales-workbook-toolbar">
        <input onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search product, tracking or order" />
        <select onChange={(event) => { setPayout(event.target.value); setPage(1); }} value={payout}>{payouts.map((value) => <option key={value}>{value}</option>)}</select>
        <select onChange={(event) => { setSize(Number(event.target.value)); setPage(1); }} value={size}>{[25, 50, 100].map((value) => <option key={value}>{value}</option>)}</select>
        <span className="sales-workbook-count">{visibleRows.length} orders · {rows.length} underlying sales rows</span>
      </div>
      <div className="sales-workbook-table-wrap">
        <table className="sales-workbook-table">
          <colgroup>{viewerColumnClasses.map((className, index) => index === 2 ? null : <col className={className} key={index} />)}</colgroup>
          <thead><tr>{viewerColumnLabels.map((value, index) => index === 2 ? null : <th className={viewerColumnClasses[index]} key={value}>{value}</th>)}<th className="sales-workbook-actions">Actions</th></tr></thead>
          <tbody>{shown.map((row) => <tr key={`${row.orderNumber ?? "manual"}-${row.rowNumber}`}>
            {[row.products, row.salePrice, row.cost, row.unitCogs, row.postage, row.cardFee, row.profit, row.posted, row.tracking, row.date, row.orderNumber ?? ""].map((value, index) => {
              if (index === 2) return null;
              const financialType = inlineFinancialTypes[index];
              const trustedTracking = index === 8 && row.orderNumber ? canonical[row.orderNumber]?.tracking ?? [] : [];
              if (financialType) {
                const key=editKey(row,financialType),staged=stagedEdits[key],isEditingCell=inlineEdit?.row.rowNumber===row.rowNumber&&inlineEdit.type===financialType;
                return <td className={viewerColumnClasses[index]} key={index} title={row.rawRows.length === 1 ? "Click to edit" : "Use Edit for grouped orders"}>{isEditingCell ? <input aria-label={`Corrected ${financialType.replace("_", " ")}`} autoFocus className="sales-workbook-inline-value" inputMode="decimal" onChange={(event)=>{setBatchPreview(null);setStagedEdits(current=>({...current,[key]:{...(current[key]??{row,type:financialType,reason:""}),value:event.target.value}}));}} onFocus={(event)=>event.currentTarget.select()} onKeyDown={(event)=>{if(event.key==="Escape"){event.preventDefault();setInlineEdit(null);}if(event.key==="Enter"||event.key==="Tab")setInlineEdit(null);}} ref={activeCellRef} type="text" value={staged?.value??monetaryValue(value)?.toString()??""} /> : <button className={`sales-workbook-inline-cell${staged?" sales-workbook-inline-cell--changed":value===""?" sales-workbook-inline-cell--missing":""}`} onClick={()=>startInlineEdit(row,financialType,staged?.value??value)} type="button">{staged?.value??(value===""?"Missing":value)}</button>}</td>;
              }
              if (index === 8 && trustedTracking.length) return <td className={viewerColumnClasses[index]} key={index} title={value}>{trustedTracking.map((tracking, trackingIndex) => tracking.url ? <span key={`${tracking.number}-${trackingIndex}`}><a href={tracking.url} target="_blank" rel="noopener noreferrer">{tracking.number}</a>{trackingIndex < trustedTracking.length - 1 ? " / " : ""}</span> : <span key={`${tracking.number}-${trackingIndex}`}>{tracking.number}{trackingIndex < trustedTracking.length - 1 ? " / " : ""}</span>)}</td>;
              return <td className={viewerColumnClasses[index]} key={index} title={index === 0 || index === 8 ? value : undefined}>{value}</td>;
            })}
            <td className="sales-workbook-actions">{row.orderNumber && canonical[row.orderNumber]?.shopifyAdminUrl ? <a href={canonical[row.orderNumber].shopifyAdminUrl ?? undefined} target="_blank" rel="noopener noreferrer">View in Shopify ↗</a> : null}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {inlineEdit && popoverPosition ? <section aria-label="Inline financial correction" className="sales-workbook-inline-popover" role="dialog" style={popoverPosition}><strong>Reason for order {inlineEdit.row.orderNumber}</strong><input aria-label="Correction reason" placeholder="One reason for this order (required)" value={stagedEdits[editKey(inlineEdit.row,inlineEdit.type)]?.reason??""} onChange={(event)=>{const reason=event.target.value;setBatchPreview(null);setStagedEdits(current=>Object.fromEntries(Object.entries(current).map(([key,edit])=>edit.row.orderNumber===inlineEdit.row.orderNumber?[key,{...edit,reason}]:[key,edit])));}}/><span>Changes are staged until Review Changes.</span><div className="sales-workbook-inline-popover-actions"><button onClick={()=>setInlineEdit(null)} type="button">Done</button></div></section> : null}
      {Object.keys(stagedEdits).length ? <section className="sales-workbook-edit"><strong>{Object.keys(stagedEdits).length} unsaved change{Object.keys(stagedEdits).length===1?"":"s"}</strong><div className="sales-workbook-edit-actions"><button disabled={busy} onClick={()=>void reviewBatch()} type="button">{busy?"Reviewing…":"Review Changes"}</button><button disabled={busy} onClick={discardChanges} type="button">Discard Changes</button></div>{batchPreview?<><h3>Review staged changes</h3>{Object.values(stagedEdits).map(edit=><p key={editKey(edit.row,edit.type)}>Order {edit.row.orderNumber}: {edit.type} → {edit.value}</p>)}<button disabled={busy} onClick={()=>void applyBatch()} type="button">{busy?"Saving…":"Confirm & Save"}</button></>:null}</section>:null}
      <div className="sales-workbook-pagination">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} type="button">Previous</button>
        <span>Page {page} of {pages}</span>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)} type="button">Next</button>
      </div>
    </section> : null}
    {message ? <p role="alert">{message}</p> : null}
  </section>;
}
