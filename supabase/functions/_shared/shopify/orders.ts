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
  email: string | null;
  customer: {
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
  email
  customer { id displayName }
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

function assertCompleteOrder(order: ShopifyOrderNode): void {
  if (order.lineItems.pageInfo.hasNextPage) {
    throw new Error(
      `Shopify order ${order.name} exceeds the supported 250 line-item limit`,
    );
  }

  if (
    order.refunds.some(
      (refund) => refund.refundLineItems.pageInfo.hasNextPage,
    )
  ) {
    throw new Error(
      `Shopify order ${order.name} has a refund exceeding the supported 100 line-item limit`,
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
  const orders: ShopifyOrderNode[] = [];
  let cursor: string | null = null;
  let page = 0;

  while (true) {
    const data: OrderConnection =
      await shopifyGraphQL<OrderConnection>(
        `query VaultRecentOrders($first: Int!, $after: String, $query: String!) {
          orders(
            first: $first
            after: $after
            query: $query
            sortKey: UPDATED_AT
          ) {
            nodes { ${ORDER_FIELDS} }
            pageInfo { hasNextPage endCursor }
          }
        }`,
        {
          first: ORDER_PAGE_SIZE,
          after: cursor,
          query: `updated_at:>=${updatedSince}`,
        },
      );

    data.orders.nodes.forEach(assertCompleteOrder);
    orders.push(...data.orders.nodes);
    page += 1;

    if (!data.orders.pageInfo.hasNextPage) {
      return orders;
    }

    if (page >= MAX_ORDER_PAGES || !data.orders.pageInfo.endCursor) {
      throw new Error(
        "Shopify order pagination exceeded its safety limit",
      );
    }

    cursor = data.orders.pageInfo.endCursor;
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
      order(id: $id) { ${ORDER_FIELDS} }
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
): Promise<{ orderId: string; linesSynced: number }> {
  assertCompleteOrder(order);

  const syncedAt = new Date().toISOString();
  const { data: savedOrder, error: orderError } = await supabase
    .from("vault_shopify_orders")
    .upsert(
      {
        source: "shopify",
        shopify_order_id: order.id,
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
        shopify_customer_id: order.customer?.id ?? null,
        customer_name: order.customer?.displayName ?? null,
        customer_email: order.email,
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
