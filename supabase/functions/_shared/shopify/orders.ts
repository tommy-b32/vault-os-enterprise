import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { shopifyGraphQL } from "./graphql.ts";
import { buildFinancialEvidence, persistFinancialEvidence } from "./financial-evidence.ts";

const ORDER_PAGE_SIZE = 50;
const MAX_ORDER_PAGES = 50;

type MoneyBag = {
  shopMoney: {
    amount: string;
    currencyCode: string;
  };
};

type ShopifyRefundLine = {
  id: string;
  quantity: number;
  subtotalSet: MoneyBag;
  priceSet: MoneyBag;
  totalTaxSet: MoneyBag;
  lineItem: { id: string } | null;
  restocked: boolean;
  restockType: string;
  location: { id: string } | null;
};

type ShopifyOrderLine = {
  id: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  quantity: number;
  originalUnitPriceSet: MoneyBag;
  originalTotalSet: MoneyBag;
  discountedTotalSet: MoneyBag;
  product: { id: string } | null;
  variant: { id: string; image: { url: string } | null } | null;
  image: { url: string } | null;
  // Shopify Admin GraphQL exposes this as a non-paginated list, not a connection.
  discountAllocations: Array<{ allocatedAmountSet: MoneyBag; discountApplication: { index: number } | null }>;
};

export type ShopifyOrderNode = {
  id: string;
  checkoutToken: string | null;
  number: number;
  name: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  currencyCode: string;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string;
  subtotalPriceSet: MoneyBag | null;
  totalDiscountsSet: MoneyBag | null;
  totalShippingPriceSet: MoneyBag;
  totalTaxSet: MoneyBag | null;
  totalRefundedSet: MoneyBag;
  totalPriceSet: MoneyBag;
  currentTotalPriceSet: MoneyBag;
  email?: string | null;
  customer?: {
    id: string;
    displayName: string;
  } | null;
  test: boolean;
  tags: string[];
  discountApplications: { nodes: any[]; pageInfo: { hasNextPage: boolean } };
  lineItems: {
    nodes: ShopifyOrderLine[];
    pageInfo: { hasNextPage: boolean };
  };
  refunds: Array<{
    id: string;
    createdAt: string;
    updatedAt: string;
    processedAt: string | null;
    totalRefundedSet: MoneyBag;
    refundLineItems: {
      nodes: ShopifyRefundLine[];
      pageInfo: { hasNextPage: boolean };
    };
    transactions: { nodes: any[]; pageInfo: { hasNextPage: boolean } };
  }>;
};

type OrderConnection = {
  orders: {
    nodes: ShopifyOrderNode[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
};

type SingleOrderResponse = {
  order: ShopifyOrderNode | null;
};

const ORDER_FIELDS = `
  id
  checkoutToken
  number
  name
  createdAt
  updatedAt
  cancelledAt
  currencyCode
  displayFinancialStatus
  displayFulfillmentStatus
  subtotalPriceSet { shopMoney { amount currencyCode } }
  totalDiscountsSet { shopMoney { amount currencyCode } }
  totalShippingPriceSet { shopMoney { amount currencyCode } }
  totalTaxSet { shopMoney { amount currencyCode } }
  totalRefundedSet { shopMoney { amount currencyCode } }
  totalPriceSet { shopMoney { amount currencyCode } }
  currentTotalPriceSet { shopMoney { amount currencyCode } }
  test
  tags
  discountApplications(first: 50) { nodes { __typename index allocationMethod targetSelection targetType value { __typename ... on MoneyV2 { amount currencyCode } ... on PricingPercentageValue { percentage } } ... on AutomaticDiscountApplication { title } ... on DiscountCodeApplication { code } ... on ManualDiscountApplication { title description } ... on ScriptDiscountApplication { title } } pageInfo { hasNextPage } }
  lineItems(first: 250) {
    nodes {
      id
      title
      variantTitle
      sku
      quantity
      originalUnitPriceSet { shopMoney { amount currencyCode } }
      originalTotalSet { shopMoney { amount currencyCode } }
      discountedTotalSet(withCodeDiscounts: true) {
        shopMoney { amount currencyCode }
      }
      product { id }
      variant { id image { url } }
      image { url }
      discountAllocations { allocatedAmountSet { shopMoney { amount currencyCode } presentmentMoney { amount currencyCode } } discountApplication { index } }
    }
    pageInfo { hasNextPage }
  }
  refunds {
    id
    createdAt
    updatedAt
    processedAt
    totalRefundedSet { shopMoney { amount currencyCode } }
    refundLineItems(first: 100) {
      nodes {
        id
        quantity
        subtotalSet { shopMoney { amount currencyCode } } priceSet { shopMoney { amount currencyCode } } totalTaxSet { shopMoney { amount currencyCode } }
        lineItem { id } restocked restockType location { id }
      }
      pageInfo { hasNextPage }
    }
    transactions(first: 100) { nodes { id parentTransaction { id } kind status gateway amountSet { shopMoney { amount currencyCode } } createdAt processedAt test } pageInfo { hasNextPage } }
  }
`;

function money(value: MoneyBag | null): number {
  if (!value) {
    return 0;
  }

  const amount = Number(value.shopMoney.amount);

  if (!Number.isFinite(amount)) {
    throw new Error("Shopify returned an invalid money amount");
  }

  return amount;
}

function assertCompleteOrder(order: ShopifyOrderNode, historical = false): void {
  if (order.lineItems.pageInfo.hasNextPage) {
    throw new Error(
      `Shopify order exceeds the supported ${historical ? 50 : 250} line-item limit`,
    );
  }

  if (
    order.refunds.some(
      (refund) => refund.refundLineItems.pageInfo.hasNextPage,
    )
  ) {
    throw new Error(
      `Shopify order has a refund exceeding the supported ${historical ? 25 : 100} line-item limit`,
    );
  }

  if (order.discountApplications.pageInfo.hasNextPage ||
    order.refunds.some((refund) => refund.transactions.pageInfo.hasNextPage)) {
    throw new Error("Shopify financial evidence exceeds supported page limit");
  }
}

function getRefundsByLine(order: ShopifyOrderNode) {
  const refunded = new Map<
    string,
    { quantity: number; subtotal: number }
  >();

  for (const refund of order.refunds) {
    for (const refundLine of refund.refundLineItems.nodes) {
      if (!refundLine.lineItem) {
        continue;
      }

      const current = refunded.get(refundLine.lineItem.id) ?? {
        quantity: 0,
        subtotal: 0,
      };

      refunded.set(refundLine.lineItem.id, {
        quantity: current.quantity + refundLine.quantity,
        subtotal: current.subtotal + money(refundLine.subtotalSet),
      });
    }
  }

  return refunded;
}

export async function fetchRecentShopifyOrders(
  updatedSince: string,
  updatedBefore: string,
): Promise<ShopifyOrderNode[]> {
  return fetchShopifyOrders({
    query: `updated_at:>='${updatedSince}' updated_at:<'${updatedBefore}'`,
    sortKey: "UPDATED_AT",
  });
}

export async function fetchHistoricalShopifyOrders(
  createdFrom: string,
  createdBefore: string,
): Promise<ShopifyOrderNode[]> {
  return fetchShopifyOrders({
    query: `created_at:>='${createdFrom}' created_at:<'${createdBefore}'`,
    sortKey: "CREATED_AT",
    historical: true,
  });
}

async function fetchShopifyOrders({
  query,
  sortKey,
  historical = false,
}: {
  query: string;
  sortKey: "UPDATED_AT" | "CREATED_AT";
  historical?: boolean;
}): Promise<ShopifyOrderNode[]> {
  const orders: ShopifyOrderNode[] = [];
  let cursor: string | null = null;
  let page = 0;
  const deadline = historical ? Date.now() + 60_000 : undefined;
  const seenCursors = new Set<string>();

  if (historical) {
    const access = await shopifyGraphQL<{ currentAppInstallation: { accessScopes: Array<{ handle: string }> } }>(
      "query VaultHistoricalAccess { currentAppInstallation { accessScopes { handle } } }",
      {}, deadline,
    );
    const scopes = access.currentAppInstallation.accessScopes.map((scope) => scope.handle);
    if (!scopes.includes("read_orders") || !scopes.includes("read_all_orders")) {
      throw new Error("Historical Shopify access requires read_orders and read_all_orders on the active token");
    }
  }

  while (true) {
    const data: OrderConnection =
      await shopifyGraphQL<OrderConnection>(
        `query VaultOrders($first: Int!, $after: String, $query: String!, $sortKey: OrderSortKeys!) {
          orders(
            first: $first
            after: $after
            query: $query
            sortKey: $sortKey
          ) {
            nodes { ${historical ? ORDER_FIELDS.replace("discountApplications(first: 50)", "discountApplications(first: 25)").replace("lineItems(first: 250)", "lineItems(first: 50)").replace("refundLineItems(first: 100)", "refundLineItems(first: 25)").replace("transactions(first: 100)", "transactions(first: 25)") : ORDER_FIELDS} ${historical ? "" : "email customer { id displayName }"} }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        {
          first: historical ? 1 : ORDER_PAGE_SIZE,
          after: cursor,
          query,
          sortKey,
        },
        deadline,
      );

    data.orders.nodes.forEach((order) => assertCompleteOrder(order, historical));
    orders.push(...data.orders.nodes);
    page += 1;

    if (!data.orders.pageInfo.hasNextPage) {
      return orders;
    }

    if (page >= MAX_ORDER_PAGES || !data.orders.pageInfo.endCursor || seenCursors.has(data.orders.pageInfo.endCursor)) {
      throw new Error(
        "Shopify order pagination exceeded its safety limit",
      );
    }

    cursor = data.orders.pageInfo.endCursor;
    seenCursors.add(cursor);
  }
}

export async function fetchShopifyOrderById(
  shopifyOrderId: string,
): Promise<ShopifyOrderNode | null> {
  const id = shopifyOrderId.startsWith("gid://")
    ? shopifyOrderId
    : `gid://shopify/Order/${shopifyOrderId}`;
  const data = await shopifyGraphQL<SingleOrderResponse>(
    `query VaultOrder($id: ID!) {
      order(id: $id) { ${ORDER_FIELDS} email customer { id displayName } }
    }`,
    { id },
  );

  if (data.order) {
    assertCompleteOrder(data.order);
  }

  return data.order;
}

export async function upsertShopifyOrder(
  supabase: SupabaseClient,
  order: ShopifyOrderNode,
  options: { omitCustomerData?: boolean; demandEvidenceMode?: "prospective" | "legacy" } = {},
): Promise<{ orderId: string; linesSynced: number }> {
  assertCompleteOrder(order);

  const syncedAt = new Date().toISOString();
  const financialMode = options.demandEvidenceMode === "legacy" ? "historical" : "prospective";
  // Fail C2 capture before existing order/B7F persistence if source evidence is incomplete.
  const financialEvidence = buildFinancialEvidence(order, syncedAt, financialMode);
  const { data: savedOrder, error: orderError } = await supabase
    .from("vault_shopify_orders")
    .upsert(
      {
        source: "shopify",
        shopify_order_id: order.id,
        shopify_checkout_token: order.checkoutToken,
        order_number: String(order.number),
        order_name: order.name,
        shopify_created_at: order.createdAt,
        shopify_updated_at: order.updatedAt,
        cancelled_at: order.cancelledAt,
        currency: order.currencyCode,
        financial_status: order.displayFinancialStatus,
        fulfilment_status: order.displayFulfillmentStatus,
        subtotal: money(order.subtotalPriceSet),
        discounts: money(order.totalDiscountsSet),
        shipping: money(order.totalShippingPriceSet),
        tax: money(order.totalTaxSet),
        refunds: money(order.totalRefundedSet),
        gross_total: money(order.totalPriceSet),
        net_revenue: money(order.currentTotalPriceSet),
        ...(options.omitCustomerData ? {} : {
          shopify_customer_id: order.customer?.id ?? null,
          customer_name: order.customer?.displayName ?? null,
          customer_email: order.email ?? null,
        }),
        metadata: {
          test: order.test,
          tags: order.tags,
        },
        synced_at: syncedAt,
        updated_at: syncedAt,
      },
      { onConflict: "source,shopify_order_id" },
    )
    .select("id")
    .single();

  if (orderError || !savedOrder) {
    throw orderError ?? new Error(`Unable to save Shopify order ${order.name}`);
  }

  const refundsByLine = getRefundsByLine(order);
  const lineRows = order.lineItems.nodes.map((line) => {
    const refund = refundsByLine.get(line.id) ?? {
      quantity: 0,
      subtotal: 0,
    };
    const originalTotal = money(line.originalTotalSet);
    const discountedTotal = money(line.discountedTotalSet);

    return {
      order_id: savedOrder.id,
      source: "shopify",
      shopify_line_item_id: line.id,
      shopify_product_id: line.product?.id ?? null,
      shopify_variant_id: line.variant?.id ?? null,
      title: line.title,
      variant_title: line.variantTitle,
      sku: line.sku,
      quantity: line.quantity,
      unit_price: money(line.originalUnitPriceSet),
      discount_allocation: Math.max(0, originalTotal - discountedTotal),
      refunded_quantity: refund.quantity,
      net_line_revenue: Math.max(0, discountedTotal - refund.subtotal),
      metadata: {
        image_url: line.variant?.image?.url ?? line.image?.url ?? null,
      },
      synced_at: syncedAt,
      updated_at: syncedAt,
    };
  });

  if (lineRows.length > 0) {
    const { error: linesError } = await supabase
      .from("vault_shopify_order_lines")
      .upsert(lineRows, {
        onConflict: "source,shopify_line_item_id",
      });

    if (linesError) {
      throw linesError;
    }
  }
  await upsertShopifyDemandEvidence(supabase, order, options.demandEvidenceMode ?? "prospective", syncedAt);
  await persistFinancialEvidence(supabase, financialEvidence);

  return {
    orderId: savedOrder.id,
    linesSynced: lineRows.length,
  };
}

type CanonicalVariant = {
  product_id: string;
  source_variant_id: string | null;
  model_design: string | null;
  normalized_size: string | null;
  size_domain: string | null;
  size_system: string | null;
  identity_resolution_status: string;
};

/** B7F snapshots identity once.  Replays use ignoreDuplicates, never a current-catalogue rewrite. */
async function upsertShopifyDemandEvidence(
  supabase: SupabaseClient,
  order: ShopifyOrderNode,
  mode: "prospective" | "legacy",
  observedAt: string,
): Promise<void> {
  let effectiveMode = mode;
  if (mode === "prospective") {
    // A reconciliation can discover an old order only after B7F rolls out.  The
    // database-persisted boundary keeps that history explicitly legacy-qualified.
    const { data: governance, error: governanceError } = await supabase
      .from("vault_shopify_demand_evidence_governance")
      .select("prospective_started_at")
      .eq("singleton", true)
      .maybeSingle();
    if (governanceError || !governance) throw governanceError ?? new Error("B7F demand evidence rollout boundary is unavailable");
    if (Date.parse(order.createdAt) < Date.parse(governance.prospective_started_at)) effectiveMode = "legacy";
  }
  const variantIds = [...new Set(order.lineItems.nodes.map((line) => line.variant?.id).filter((id): id is string => Boolean(id)))];
  const variantsBySourceId = new Map<string, CanonicalVariant[]>();
  if (variantIds.length > 0) {
    const { data, error } = await supabase.from("vault_variants")
      .select("product_id,source_variant_id,model_design,normalized_size,size_domain,size_system,identity_resolution_status")
      .eq("source", "shopify").in("source_variant_id", variantIds);
    if (error) throw error;
    for (const variant of (data ?? []) as CanonicalVariant[]) {
      if (!variant.source_variant_id) continue;
      variantsBySourceId.set(variant.source_variant_id, [...(variantsBySourceId.get(variant.source_variant_id) ?? []), variant]);
    }
  }
  const evidenceRows = order.lineItems.nodes.map((line) => {
    const matches = line.variant?.id ? variantsBySourceId.get(line.variant.id) ?? [] : [];
    const variant = matches.length === 1 && matches[0].identity_resolution_status === "resolved" &&
      Boolean(variantOrNull(matches[0].model_design)) && Boolean(variantOrNull(matches[0].normalized_size)) ? matches[0] : null;
    const resolved = Boolean(variant);
    const isTest = order.test;
    return {
      source: "shopify", shopify_order_id: order.id, shopify_line_item_id: line.id,
      shopify_product_id: line.product?.id ?? null, shopify_variant_id: line.variant?.id ?? null,
      ordered_at: order.createdAt, source_updated_at: order.updatedAt, observed_at: observedAt,
      gross_ordered_units: line.quantity, is_test_order: isTest, financial_status: order.displayFinancialStatus,
      fulfilment_status: order.displayFulfillmentStatus, line_title: line.title, variant_title: line.variantTitle,
      sku: line.sku, raw_size: line.variantTitle,
      canonical_product_id: variant?.product_id ?? null,
      canonical_style_id: variant ? `${variant.product_id}::${variantOrNull(variant.model_design)}` : null,
      model_design: variantOrNull(variant?.model_design), normalized_size: variantOrNull(variant?.normalized_size),
      size_domain: variant?.size_domain ?? null, size_system: variant?.size_system ?? null,
      canonical_mapping_state: resolved ? "resolved" : matches.length > 1 ? "ambiguous" : "unresolved",
      evidence_state: isTest ? "excluded_test_order" : resolved
        ? effectiveMode === "prospective" ? "prospective_governed_resolved" : "legacy_current_mapping_qualified"
        : effectiveMode === "prospective" ? "prospective_unresolved" : "legacy_unresolved",
      identity_observed_at: observedAt,
    };
  });
  if (evidenceRows.length > 0) {
    const { error } = await supabase.from("vault_shopify_demand_line_observations")
      .upsert(evidenceRows, { onConflict: "source,shopify_line_item_id", ignoreDuplicates: true });
    if (error) throw error;
  }
  const adjustments: Array<Record<string, unknown>> = [];
  for (const line of order.lineItems.nodes) {
    if (order.cancelledAt) adjustments.push({ source: "shopify", source_event_key: `whole-order-cancellation:${order.id}:${line.id}`, adjustment_type: "whole_order_cancellation", shopify_order_id: order.id, shopify_line_item_id: line.id, shopify_refund_id: null, shopify_refund_line_item_id: null, occurred_at: order.cancelledAt, adjusted_units: line.quantity, adjusted_amount: null, source_observed_at: observedAt, metadata: { semantics: "whole_order_only" } });
  }
  for (const refund of order.refunds) for (const line of refund.refundLineItems.nodes) {
    if (!line.lineItem) continue;
    adjustments.push({ source: "shopify", source_event_key: `refund:${refund.id}:${line.id}`, adjustment_type: "refund", shopify_order_id: order.id, shopify_line_item_id: line.lineItem.id, shopify_refund_id: refund.id, shopify_refund_line_item_id: line.id, occurred_at: refund.createdAt, adjusted_units: line.quantity, adjusted_amount: money(line.subtotalSet), source_observed_at: observedAt, metadata: {} });
  }
  if (adjustments.length > 0) {
    const { error } = await supabase.from("vault_shopify_demand_lifecycle_adjustments")
      .upsert(adjustments, { onConflict: "source,source_event_key", ignoreDuplicates: true });
    if (error) throw error;
  }
}

function variantOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
