import { shopifyGraphQL } from "./graphql.ts";

const BUSINESS_TIME_ZONE = "Europe/London";

type Money = {
  amount: string;
  currencyCode: string;
};

type PayoutNode = {
  id: string;
  issuedAt: string;
  net: Money;
  status: string;
  transactionType: string;
};

type PaymentsResponse = {
  shopifyPaymentsAccount: {
    activated: boolean;
    defaultCurrency: string;
    balance: Money[];
    payouts: { nodes: PayoutNode[]; pageInfo: { hasNextPage: boolean } };
  } | null;
};

export type SafeShopifyPayout = {
  amount: number;
  currency: string;
  status: string;
  issuedAt: string;
};

export type SafeShopifyPaymentsSnapshot = {
  activated: boolean;
  defaultCurrency: string;
  balances: Array<{ amount: number; currency: string }>;
  todayPayout: SafeShopifyPayout | null;
  nextScheduledPayout: SafeShopifyPayout | null;
  latestSuccessfulPayout: SafeShopifyPayout | null;
  synchronizedAt: string;
};

const PAYMENTS_QUERY = `
  query VaultShopifyPayments {
    shopifyPaymentsAccount {
      activated
      defaultCurrency
      balance {
        amount
        currencyCode
      }
      payouts(first: 20, reverse: true, sortKey: ISSUED_AT) {
        pageInfo { hasNextPage }
        nodes {
          id
          issuedAt
          net {
            amount
            currencyCode
          }
          status
          transactionType
        }
      }
    }
  }
`;

function londonDate(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function amount(value: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error("Shopify Payments returned an invalid monetary amount");
  }

  return parsed;
}

function safePayout(payout: PayoutNode): SafeShopifyPayout {
  return {
    amount: amount(payout.net.amount),
    currency: payout.net.currencyCode,
    status: payout.status,
    issuedAt: payout.issuedAt,
  };
}

export async function fetchShopifyPaymentsSnapshot(
  now = new Date(),
): Promise<SafeShopifyPaymentsSnapshot> {
  const data = await shopifyGraphQL<PaymentsResponse>(PAYMENTS_QUERY, {}, Date.now() + 30_000);
  const account = data.shopifyPaymentsAccount;

  if (!account) {
    throw new Error("Shopify Payments is unavailable for this store");
  }

  // Fail closed if the bounded page cannot establish complete coverage of today.
  const oldest = account.payouts.nodes.at(-1);
  if (account.payouts.pageInfo.hasNextPage && (!oldest || londonDate(oldest.issuedAt) >= londonDate(now))) {
    throw new Error("Shopify Payments today coverage exceeds the bounded page");
  }

  const payouts = account.payouts.nodes
    .filter((payout) => payout.transactionType === "DEPOSIT")
    .sort((left, right) => Date.parse(right.issuedAt) - Date.parse(left.issuedAt));
  const today = londonDate(now);
  const todayPayout = payouts.find(
    (payout) => londonDate(payout.issuedAt) === today,
  );
  const nextScheduledPayout = [...payouts]
    .filter(
      (payout) =>
        payout.status === "SCHEDULED" && Date.parse(payout.issuedAt) > now.getTime(),
    )
    .sort((left, right) => Date.parse(left.issuedAt) - Date.parse(right.issuedAt))[0];
  const latestSuccessfulPayout = payouts.find(
    (payout) => payout.status === "PAID",
  );

  return {
    activated: account.activated,
    defaultCurrency: account.defaultCurrency,
    balances: account.balance.map((balance) => ({
      amount: amount(balance.amount),
      currency: balance.currencyCode,
    })),
    todayPayout: todayPayout ? safePayout(todayPayout) : null,
    nextScheduledPayout: nextScheduledPayout
      ? safePayout(nextScheduledPayout)
      : null,
    latestSuccessfulPayout: latestSuccessfulPayout
      ? safePayout(latestSuccessfulPayout)
      : null,
    synchronizedAt: now.toISOString(),
  };
}
