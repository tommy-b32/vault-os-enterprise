import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  cashLedgerExternalId,
  penceToDatabaseAmount,
  poundsToPence,
  type CashDirection,
} from "@/lib/business/CashLedgerRules";

export type CashLedgerEntry = {
  id: string;
  effectiveDate: string;
  createdAt: string;
  transactionType: string;
  category: string;
  description: string;
  reference: string | null;
  notes: string | null;
  amountPence: number;
  resultingBalancePence: number;
};

export type CashLedgerSnapshot = {
  currency: "GBP";
  balancePence: number;
  transactions: CashLedgerEntry[];
};

export type NewCashTransaction = {
  direction: CashDirection;
  amountPence: number;
  description: string;
  category: string;
  effectiveDate: string;
  reference: string | null;
  notes: string | null;
  submissionId: string;
  createdByOperatorId: string;
};

type CashAccount = { id: string; currency: string };

async function getBusinessAccount(): Promise<CashAccount> {
  const { data, error } = await supabaseAdmin
    .from("vault_cash_accounts")
    .select("id, currency")
    .eq("account_type", "business")
    .eq("is_active", true);

  if (error) {
    throw new Error(`Unable to load the business cash account: ${error.message}`);
  }

  if (!data || data.length !== 1) {
    throw new Error("Exactly one active business cash account is required.");
  }

  if (data[0].currency !== "GBP") {
    throw new Error("The active business cash account must use GBP.");
  }

  return data[0];
}

function transactionTypeFor(
  direction: CashDirection,
  category: string,
): string {
  if (direction === "money_in") {
    return category === "Refund received" ? "refund" : "income";
  }

  if (category === "Stock purchase") {
    return "supplier_payment";
  }

  return category === "Refund" ? "refund" : "expense";
}

export const CashLedgerRepository = {
  async getRecentEntries(): Promise<{ currency: CashLedgerSnapshot["currency"]; transactions: Array<Pick<CashLedgerEntry, "id" | "description" | "amountPence" | "createdAt">> }> {
    const account = await getBusinessAccount();
    const { data, error } = await supabaseAdmin
      .from("vault_cash_transactions")
      .select("id, description, amount_gbp, created_at")
      .eq("account_id", account.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(7);
    if (error || data === null) throw new Error("Cash ledger unavailable");
    return {
      currency: "GBP",
      transactions: data.map((entry) => ({
        id: entry.id, description: entry.description,
        amountPence: poundsToPence(entry.amount_gbp), createdAt: entry.created_at,
      })),
    };
  },

  async getSnapshot(limit = 20): Promise<CashLedgerSnapshot> {
    const account = await getBusinessAccount();
    const { data, error } = await supabaseAdmin
      .from("vault_cash_transactions")
      .select("id, transaction_date, transaction_type, category, description, amount_gbp, reference, notes, created_at")
      .eq("account_id", account.id)
      .order("transaction_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(`Unable to load the cash ledger: ${error.message}`);
    }

    let balancePence = 0;
    const chronological = (data ?? []).map((transaction) => {
      const amountPence = poundsToPence(transaction.amount_gbp);
      balancePence += amountPence;

      return {
        id: transaction.id,
        effectiveDate: transaction.transaction_date,
        createdAt: transaction.created_at,
        transactionType: transaction.transaction_type,
        category: transaction.category,
        description: transaction.description,
        reference: transaction.reference,
        notes: transaction.notes,
        amountPence,
        resultingBalancePence: balancePence,
      } satisfies CashLedgerEntry;
    });

    return {
      currency: "GBP",
      balancePence,
      transactions: chronological.reverse().slice(0, limit),
    };
  },

  async addTransaction(transaction: NewCashTransaction): Promise<"created" | "duplicate"> {
    const account = await getBusinessAccount();
    const signedAmount = transaction.direction === "money_in"
      ? transaction.amountPence
      : -transaction.amountPence;

    const { error } = await supabaseAdmin
      .from("vault_cash_transactions")
      .insert({
        account_id: account.id,
        transaction_date: transaction.effectiveDate,
        transaction_type: transactionTypeFor(
          transaction.direction,
          transaction.category,
        ),
        category: transaction.category,
        description: transaction.description,
        amount_gbp: penceToDatabaseAmount(signedAmount),
        reference: transaction.reference,
        notes: transaction.notes,
        source: "manual",
        external_id: cashLedgerExternalId(transaction.submissionId),
        created_by_operator_id: transaction.createdByOperatorId,
      });

    if (error?.code === "23505") {
      return "duplicate";
    }

    if (error) {
      throw new Error(`Unable to record the cash transaction: ${error.message}`);
    }

    return "created";
  },
} as const;
