import { NextResponse } from "next/server";
import { requireAuthenticatedOperator } from "@/lib/auth/operators";
import { getCarrierTrackingUrl } from "@/lib/purchase-orders/CarrierTrackingLink";
import { SalesWorkbookRepository } from "@/lib/sales-workbook/SalesWorkbookRepository";
import { normalizeWorkbookOrderNumber, parseSalesWorkbook } from "@/lib/sales-workbook/WorkbookParser";
import { resolveGovernedSaleTimeCogs } from "@/lib/sales-workbook/BackfillProposalService";
import { supabaseAdmin } from "@/lib/supabase-admin";

type CanonicalOrder = { id: string; order_number: string; shopify_order_id: string; shopify_created_at: string; currency: string };
type CanonicalLine = { id: string; order_id: string; title: string; net_line_revenue: number | string; total_cogs_gbp: number | string | null; unit_cogs_gbp: number | string | null; cogs_status: string; cogs_history_id: string | null; cogs_snapshotted_at: string | null; financial_treatment: string | null; financial_treatment_status: string | null; financial_treatment_history_id: string | null; financial_treatment_snapshotted_at: string | null; sale_time_direct_cogs_gbp: number | string | null };
type Tracking = { order_id: string; tracking_number: string; tracking_company: string | null; tracking_url: string | null };
type ManualEvidence = { order_id: string; evidence_type: "shipping_cost" | "payment_fee"; amount_gbp: number | string };
type ShippingCost = { order_id: string; source_state: string; label_cost_gbp: number | string | null };
type PaymentCoverage = { order_id: string; coverage_state: string };
type PaymentFee = { order_id: string; fee_amount: number | string; tax_amount: number | string | null; counts_toward_profit: boolean };
type PendingFinancial = { postageSource: "shopify" | "manual" | "missing"; cardFeeSource: "shopify" | "manual" | "missing" };
type PendingOrder = PendingFinancial & { orderId: string; orderNumber: string; products: string; salePrice: string; cost: string; postage: string; cardFee: string };

const chunks = <T,>(values: readonly T[], size: number) => Array.from({ length: Math.ceil(values.length / size) }, (_, index) => values.slice(index * size, index * size + size));
const secureUrl = (value: string | null): string | null => {
  if (!value) return null;
  try { return new URL(value).protocol === "https:" ? value : null; } catch { return null; }
};
const shopifyAdminUrl = (shopifyOrderId: string): string | null => {
  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const match = /^gid:\/\/shopify\/Order\/([1-9][0-9]*)$/.exec(shopifyOrderId);
  return domain && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(domain) && match
    ? `https://${domain}/admin/orders/${match[1]}`
    : null;
};
const money = (value: unknown): string => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount) : "";
};
const pendingOrderRecords = (orders: CanonicalOrder[], lines: CanonicalLine[], financial: Map<string, { postage: number | null; cardFee: number | null; postageSource: PendingFinancial["postageSource"]; cardFeeSource: PendingFinancial["cardFeeSource"] }>): PendingOrder[] => {
  const linesByOrder = new Map<string, CanonicalLine[]>();
  for (const line of lines) linesByOrder.set(line.order_id, [...(linesByOrder.get(line.order_id) ?? []), line]);
  return orders.flatMap((order) => {
    const orderNumber = normalizeWorkbookOrderNumber(order.order_number);
    if (!orderNumber) return [];
    const orderLines = linesByOrder.get(order.id) ?? [];
    const cogs = orderLines.map(resolveGovernedSaleTimeCogs);
    const salePrices = orderLines.map(line => Number(line.net_line_revenue));
    const evidence = financial.get(order.id) ?? { postage: null, cardFee: null, postageSource: "missing" as const, cardFeeSource: "missing" as const };
    return [{ orderId: order.id, orderNumber, products: orderLines.map(line => line.title).filter(Boolean).join(" / ") || "Pending Shopify order", salePrice: order.currency === "GBP" && salePrices.every(Number.isFinite) ? money(salePrices.reduce((total, value) => total + value, 0)) : "", cost: cogs.every(item => item.cost.value !== null) ? money(cogs.reduce((total, item) => total + Number(item.cost.value), 0)) : "", postage: evidence.postage === null ? "" : money(evidence.postage), cardFee: evidence.cardFee === null ? "" : money(evidence.cardFee), postageSource: evidence.postageSource, cardFeeSource: evidence.cardFeeSource }];
  });
};

export async function GET() {
  try {
    await requireAuthenticatedOperator();
    const { workbook, bytes } = await SalesWorkbookRepository.readCurrentWorkbookBytes();
    const parsed = parseSalesWorkbook(bytes);
    if (!parsed.valid) return NextResponse.json({ error: "Workbook Sales sheet layout is invalid", validation: parsed }, { status: 422 });

    const orderNumbers = [...new Set(parsed.rows.flatMap((row) => row.orderNumber ? [row.orderNumber] : []))];
    const orders = (await Promise.all(chunks(orderNumbers, 100).map(async (batch) => {
      const { data, error } = await supabaseAdmin.from("vault_shopify_orders").select("id,order_number,shopify_order_id,shopify_created_at,currency").eq("source", "shopify").in("order_number", batch);
      if (error) throw error;
      return (data ?? []) as CanonicalOrder[];
    }))).flat();
    const tracking = (await Promise.all(chunks(orders.map((order) => order.id), 100).map(async (ids) => {
      if (!ids.length) return [] as Tracking[];
      const { data, error } = await supabaseAdmin.rpc("get_shopify_fulfillment_tracking_for_orders", { p_order_ids: ids });
      if (error) throw error;
      return (data ?? []) as Tracking[];
    }))).flat();
    const trackingByOrder = new Map<string, Array<{ number: string; url: string | null }>>();
    for (const item of tracking) {
      const values = trackingByOrder.get(item.order_id) ?? [];
      const url = secureUrl(item.tracking_url) ?? getCarrierTrackingUrl(item.tracking_company, item.tracking_number);
      if (!values.some((value) => value.number === item.tracking_number && value.url === url)) values.push({ number: item.tracking_number, url });
      trackingByOrder.set(item.order_id, values);
    }
    const existingOrderNumbers = new Set(orderNumbers);
    const { data: syncedOrders, error: syncedOrdersError } = await supabaseAdmin.from("vault_shopify_orders").select("id,order_number,shopify_order_id,shopify_created_at,currency").eq("source", "shopify").order("shopify_created_at", { ascending: false });
    if (syncedOrdersError) throw syncedOrdersError;
    const pendingOrders = ((syncedOrders ?? []) as CanonicalOrder[]).filter(order => {
      const orderNumber = normalizeWorkbookOrderNumber(order.order_number);
      return orderNumber !== null && !existingOrderNumbers.has(orderNumber);
    });
    const pendingLines = (await Promise.all(chunks(pendingOrders.map(order => order.id), 100).map(async (ids) => {
      if (!ids.length) return [] as CanonicalLine[];
      const { data, error } = await supabaseAdmin.from("vault_shopify_order_lines").select("id,order_id,title,net_line_revenue,total_cogs_gbp,unit_cogs_gbp,cogs_status,cogs_history_id,cogs_snapshotted_at,financial_treatment,financial_treatment_status,financial_treatment_history_id,financial_treatment_snapshotted_at,sale_time_direct_cogs_gbp").in("order_id", ids).order("id", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CanonicalLine[];
    }))).flat();
    const pendingIds = pendingOrders.map(order => order.id);
    const [shipping, coverage, fees, manual] = await Promise.all([
      supabaseAdmin.from("vault_shopify_shipping_costs").select("order_id,source_state,label_cost_gbp").in("order_id", pendingIds),
      supabaseAdmin.from("vault_shopify_payment_fee_coverage").select("order_id,coverage_state").in("order_id", pendingIds),
      supabaseAdmin.from("vault_shopify_payment_fee_records").select("order_id,fee_amount,tax_amount,counts_toward_profit").in("order_id", pendingIds),
      supabaseAdmin.from("vault_shopify_manual_financial_evidence").select("order_id,evidence_type,amount_gbp").in("order_id", pendingIds),
    ]);
    if (shipping.error || coverage.error || fees.error || manual.error) throw new Error("Pending financial evidence unavailable");
    const financial = new Map<string, { postage: number | null; cardFee: number | null; postageSource: PendingFinancial["postageSource"]; cardFeeSource: PendingFinancial["cardFeeSource"] }>();
    for (const order of pendingOrders) {
      const shippingRow = (shipping.data ?? []).find(row => row.order_id === order.id) as ShippingCost | undefined;
      const coverageRow = (coverage.data ?? []).find(row => row.order_id === order.id) as PaymentCoverage | undefined;
      const manualRows = (manual.data ?? []).filter(row => row.order_id === order.id) as ManualEvidence[];
      const manualShipping = manualRows.find(row => row.evidence_type === "shipping_cost");
      const manualFee = manualRows.find(row => row.evidence_type === "payment_fee");
      const shopifyPostage = shippingRow?.source_state === "covered" && Number.isFinite(Number(shippingRow.label_cost_gbp)) ? Number(shippingRow.label_cost_gbp) : null;
      const shopifyFee = coverageRow?.coverage_state === "covered" ? (fees.data ?? []).filter(row => row.order_id === order.id && row.counts_toward_profit).reduce((total, row) => total + Number(row.fee_amount) + Number(row.tax_amount ?? 0), 0) : null;
      financial.set(order.id, { postage: shopifyPostage ?? (manualShipping ? Number(manualShipping.amount_gbp) : null), cardFee: shopifyFee ?? (manualFee ? Number(manualFee.amount_gbp) : null), postageSource: shopifyPostage !== null ? "shopify" : manualShipping ? "manual" : "missing", cardFeeSource: shopifyFee !== null ? "shopify" : manualFee ? "manual" : "missing" });
    }
    const canonical = Object.fromEntries(orders.map((order) => [order.order_number, {
      shopifyAdminUrl: shopifyAdminUrl(order.shopify_order_id),
      tracking: trackingByOrder.get(order.id) ?? [],
    }]));
    return NextResponse.json({ workbook: { filename: workbook.filename, version: workbook.current_version }, sheet: { name: "Sales", headers: parsed.headers, rowCount: parsed.rowCount, columnOwnership: parsed.columnOwnership, rows: parsed.rows }, pendingOrders: pendingOrderRecords(pendingOrders, pendingLines, financial), canonical });
  } catch {
    return NextResponse.json({ error: "Sales workbook is unavailable" }, { status: 400 });
  }
}
