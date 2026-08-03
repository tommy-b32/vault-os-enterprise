import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type FinancePosition = {
  amount: number;
  currency: string;
  asOf: string;
};

export type BusinessFinanceSnapshot = {
  businessCash: FinancePosition | null;
  protectedReserve: FinancePosition | null;
};

function databaseAmount(value: number | string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error("Canonical business finance contains an invalid amount");
  }

  return parsed;
}

export const BusinessFinanceRepository = {
  async getSnapshot(): Promise<BusinessFinanceSnapshot> {
    const [accountsResult, policyResult] = await Promise.all([
      supabaseAdmin
        .from("vault_cash_accounts")
        .select("id, currency")
        .eq("account_type", "business")
        .eq("is_active", true),
      supabaseAdmin
        .from("vault_purchasing_policy")
        .select("protected_reserve_gbp, updated_at")
        .eq("policy_key", "primary")
        .maybeSingle(),
    ]);

    if (accountsResult.error) {
      throw new Error(
        `Unable to read business cash accounts: ${accountsResult.error.message}`,
      );
    }

    if (policyResult.error) {
      throw new Error(
        `Unable to read protected reserve: ${policyResult.error.message}`,
      );
    }

    const accounts = accountsResult.data ?? [];
    const currencies = new Set(accounts.map((account) => account.currency));

    if (currencies.size > 1) {
      throw new Error("Business cash accounts use multiple currencies");
    }

    let businessCash: FinancePosition | null = null;

    if (accounts.length > 0) {
      const { data: transactions, error } = await supabaseAdmin
        .from("vault_cash_transactions")
        .select("amount_gbp, updated_at")
        .in("account_id", accounts.map((account) => account.id));

      if (error) {
        throw new Error(`Unable to read business cash ledger: ${error.message}`);
      }

      if (transactions && transactions.length > 0) {
        businessCash = {
          amount: transactions.reduce(
            (total, transaction) =>
              total + databaseAmount(transaction.amount_gbp),
            0,
          ),
          currency: currencies.values().next().value ?? "GBP",
          asOf: transactions
            .map((transaction) => transaction.updated_at)
            .sort((left, right) => Date.parse(right) - Date.parse(left))[0],
        };
      }
    }

    return {
      businessCash,
      protectedReserve: policyResult.data
        ? {
          amount: databaseAmount(policyResult.data.protected_reserve_gbp),
          currency: "GBP",
          asOf: policyResult.data.updated_at,
        }
        : null,
    };
  },
} as const;
