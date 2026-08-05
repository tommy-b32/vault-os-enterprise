"use server";

import { revalidatePath } from "next/cache";

import { CashLedgerRepository } from "@/lib/business/CashLedgerRepository";
import { requireOperatorRole } from "@/lib/auth/operators";
import {
  CASH_CATEGORIES,
  CASH_DIRECTIONS,
  parsePositiveAmountToPence,
  type CashDirection,
} from "@/lib/business/CashLedgerRules";
import { emitCommandCentreRefreshEvent } from "@/lib/command-centre/emitCommandCentreRefreshEvent";

export type CashLedgerActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

class CashLedgerInputError extends Error {}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function addCashTransaction(
  _previousState: CashLedgerActionState,
  formData: FormData,
): Promise<CashLedgerActionState> {
  try {
    const operator = await requireOperatorRole("owner", "operator");
    const direction = text(formData, "direction") as CashDirection;
    const description = text(formData, "description");
    const category = text(formData, "category");
    const effectiveDate = text(formData, "effective_date");
    const submissionId = text(formData, "submission_id");

    if (!CASH_DIRECTIONS.includes(direction)) {
      throw new CashLedgerInputError("Choose whether this is money in or money out.");
    }

    if (!(CASH_CATEGORIES[direction] as readonly string[]).includes(category)) {
      throw new CashLedgerInputError("Choose a valid transaction category.");
    }

    if (!description) {
      throw new CashLedgerInputError("Description is required.");
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      throw new CashLedgerInputError("Choose a valid effective date.");
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) {
      throw new CashLedgerInputError("This transaction form has expired. Close it and try again.");
    }

    const result = await CashLedgerRepository.addTransaction({
      direction,
      amountPence: (() => {
        try {
          return parsePositiveAmountToPence(text(formData, "amount"));
        } catch (amountError) {
          throw new CashLedgerInputError(
            amountError instanceof Error ? amountError.message : "Enter a valid amount.",
          );
        }
      })(),
      description,
      category,
      effectiveDate,
      reference: text(formData, "reference") || null,
      notes: text(formData, "notes") || null,
      submissionId,
      createdByOperatorId: operator.id,
    });

    console.info("Cash ledger transaction attributed", { operatorId: operator.id, result });

    if (result === "created") {
      await emitCommandCentreRefreshEvent({
        domain: "finance",
        eventType: "cash-transaction-created",
        source: "cash-ledger-action",
      });
    }

    revalidatePath("/commercial");
    revalidatePath("/");

    return {
      status: "success",
      message: result === "duplicate"
        ? "This transaction was already recorded; no duplicate was added."
        : "Cash transaction recorded successfully.",
    };
  } catch (error) {
    console.warn("Cash ledger transaction rejected", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return {
      status: "error",
      message: error instanceof CashLedgerInputError
        ? error.message
        : error instanceof Error && error.name === "OperatorAuthorizationError"
          ? "You are not authorized to record cash transactions."
          : "The transaction could not be recorded. Please try again.",
    };
  }
}
