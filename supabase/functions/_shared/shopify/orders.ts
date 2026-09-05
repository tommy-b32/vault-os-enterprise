import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { shopifyGraphQL } from "./graphql.ts";

const ORDER_PAGE_SIZE = 50;
const MAX_ORDER_PAGES = 50;

type MoneyBag = {
  shopMoney: {
    amount: string;
    currencyCode: string;
  };
};

type ShopifyRefundLine = {
  quantity: number;
  subtotalSet: MoneyBag;
  lineItem: { id: string } | null;
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
  variant: { id: string } | null;
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
  lineItems: {
    nodes: ShopifyOrderLine[];
    pageInfo: { hasNextPage: boolean };
  };
  refunds: Array<{
    refundLineItems: {
      nodes: ShopifyRefundLine[];
      pageInfo: { hasNextPage: boolean };
    };
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
      variant { id }
    }
    pageInfo { hasNextPage }
  }
  refunds {
    refundLineItems(first: 100) {
      nodes {
        quantity
        subtotalSet { shopMoney { amount currencyCode } }
        lineItem { id }
      }
      pageInfo { hasNextPage }
    }
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
): Promise<ShopifyOrderNode[]> {
  return fetchShopifyOrders({
    query: `updated_at:>=${updatedSince}`,
    sortKey: "UPDATED_AT",
  });
}

export async function fetchHistoricalShopifyOrders(
  createdFrom: string,
  createdBefore: string,
): Promise<ShopifyOrderNode[]> {
  return fetchShopifyOrders({
    query: `created_at:>=${createdFrom} created_at:<${createdBefore}`,
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
            nodes { ${historical ? ORDER_FIELDS.replace("lineItems(first: 250)", "lineItems(first: 50)").replace("refundLineItems(first: 100)", "refundLineItems(first: 25)") : ORDER_FIELDS} ${historical ? "" : "email customer { id displayName }"} }
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
  options: { omitCustomerData?: boolean } = {},
): Promise<{ orderId: string; linesSynced: number }> {
  assertCompleteOrder(order);

  const syncedAt = new Date().toISOString();
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
      metadata: {},
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

  return {
    orderId: savedOrder.id,
    linesSynced: lineRows.length,
  };
}
