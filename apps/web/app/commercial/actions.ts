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
import { SupplierMinimumContract } from "@/lib/supplier/SupplierMinimum";
import type { SupplierMinimumActionState } from "@/lib/supplier/SupplierMinimumActionState";
import { parseSupplierMinimumPolicy } from "@/lib/supplier/SupplierMinimumPolicyInput";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type CashLedgerActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

type SupplierCostProfileActionState = CashLedgerActionState;

class CashLedgerInputError extends Error {}
class SupplierMinimumInputError extends Error {}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function requiredPositive(formData: FormData, name: string, label: string): number {
  const value = Number(text(formData, name));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be greater than zero.`);
  return value;
}

export async function saveSupplierCostProfile(
  _previousState: SupplierCostProfileActionState,
  formData: FormData,
): Promise<SupplierCostProfileActionState> {
  try {
    const operator = await requireOperatorRole("owner", "operator");
    const supplierId = text(formData, "supplier_id");
    const costTypeId = text(formData, "cost_type_id").toLowerCase();
    const costTypeName = text(formData, "cost_type_name");
    const currency = text(formData, "supplier_currency").toUpperCase();
    if (!/^[a-z0-9_]+$/.test(costTypeId) || !costTypeName) throw new Error("Choose a governed cost type identifier and display name.");
    if (!["GBP", "EUR", "USD", "TRY"].includes(currency)) throw new Error("Choose a supported supplier currency.");
    const supplier = await supabaseAdmin.from("vault_suppliers").select("id, is_active").eq("id", supplierId).maybeSingle();
    if (supplier.error || !supplier.data?.is_active) throw new Error("Choose an active canonical supplier.");
    const { error: typeError } = await supabaseAdmin.from("vault_cost_types").upsert({ id: costTypeId, display_name: costTypeName }, { onConflict: "id" });
    if (typeError) throw new Error("The governed cost type could not be saved.");
    const profile = {
      supplier_id: supplierId, cost_type_id: costTypeId, supplier_currency: currency,
      exchange_rate_to_gbp: currency === "GBP" ? 1 : requiredPositive(formData, "exchange_rate_to_gbp", "Exchange rate"),
      pack_cost: requiredPositive(formData, "pack_cost", "Pack cost"),
      shipping_cost_per_pack: Number(text(formData, "shipping_cost_per_pack") || 0),
      import_cost_per_pack: Number(text(formData, "import_cost_per_pack") || 0),
      units_per_pack: requiredPositive(formData, "units_per_pack", "Units per pack"),
      price_updated_at: text(formData, "price_updated_at"), effective_from: text(formData, "effective_from") || new Date().toISOString(),
      active: true, updated_by_operator_id: operator.id, created_by_operator_id: operator.id,
      notes: text(formData, "notes") || null,
    };
    if (!Number.isInteger(profile.units_per_pack) || profile.shipping_cost_per_pack < 0 || profile.import_cost_per_pack < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(profile.price_updated_at)) throw new Error("Check the non-negative costs, whole pack quantity, and price date.");
    const existing = await supabaseAdmin.from("vault_supplier_product_type_cost_profiles").select("id").eq("supplier_id", supplierId).eq("cost_type_id", costTypeId).eq("active", true).maybeSingle();
    const write = existing.data
      ? supabaseAdmin.from("vault_supplier_product_type_cost_profiles").update(profile).eq("id", existing.data.id)
      : supabaseAdmin.from("vault_supplier_product_type_cost_profiles").insert(profile);
    const { error } = await write;
    if (error) throw new Error("The supplier cost profile could not be saved.");
    revalidateSupplierRuleConsumers();
    return { status: "success", message: "Supplier replacement-cost profile saved. Existing products remain product-specific until they explicitly opt into inheritance." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "The supplier cost profile could not be saved." };
  }
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

function revalidateSupplierRuleConsumers() {
  revalidatePath("/commercial");
  revalidatePath("/advisor");
  revalidatePath("/purchase-orders");
  revalidatePath("/catalogue");
  revalidatePath("/");
}

export async function updateSupplierMinimumPolicy(
  _previousState: SupplierMinimumActionState,
  formData: FormData,
): Promise<SupplierMinimumActionState> {
  try {
    await requireOperatorRole("owner", "operator");
    const input = parseSupplierMinimumPolicy(formData);

    const [supplierResponse, ruleResponse] = await Promise.all([
      supabaseAdmin
        .from("vault_suppliers")
        .select("id, is_active, currency_code, minimum_order_value")
        .eq("id", input.supplierId)
        .maybeSingle(),
      supabaseAdmin
        .from("vault_supplier_purchasing_rules")
        .select("supplier_id, minimum_order_packs")
        .eq("supplier_id", input.supplierId)
        .maybeSingle(),
    ]);
    const existing = supplierResponse.data;

    if (supplierResponse.error || ruleResponse.error || !existing) {
      throw new SupplierMinimumInputError("The canonical supplier is unavailable.");
    }
    if (!existing.is_active) {
      throw new SupplierMinimumInputError("Inactive supplier behaviour cannot be changed here.");
    }

    const existingMinimum = existing.minimum_order_value === null
      ? null
      : Number(existing.minimum_order_value);
    const existingPackMinimum = ruleResponse.data?.minimum_order_packs === null ||
      ruleResponse.data?.minimum_order_packs === undefined
      ? null
      : Number(ruleResponse.data.minimum_order_packs);
    if (
      existingMinimum === input.value &&
      existingPackMinimum === input.minimumOrderPacks
    ) {
      const unchanged = SupplierMinimumContract.create({
        value: existingMinimum,
        currency: existing.currency_code,
        minimumOrderPacks: existingPackMinimum,
      });
      return {
        status: "success",
        message: "Supplier minimum-order policy is already unchanged.",
        supplierMinimumState: unchanged.state,
      };
    }

    const { error: updateError } = await supabaseAdmin.rpc(
      "update_supplier_minimum_policy",
      {
        target_supplier_id: input.supplierId,
        target_minimum_order_value: input.value,
        target_minimum_order_packs: input.minimumOrderPacks,
      },
    );

    if (updateError) {
      throw new Error("Supplier minimum-order policy could not be saved.");
    }

    const [canonicalSupplierResponse, canonicalRuleResponse] = await Promise.all([
      supabaseAdmin
        .from("vault_suppliers")
        .select("id, currency_code, minimum_order_value")
        .eq("id", input.supplierId)
        .maybeSingle(),
      supabaseAdmin
        .from("vault_supplier_purchasing_rules")
        .select("supplier_id, minimum_order_packs")
        .eq("supplier_id", input.supplierId)
        .maybeSingle(),
    ]);
    const canonical = canonicalSupplierResponse.data;

    if (
      canonicalSupplierResponse.error ||
      canonicalRuleResponse.error ||
      !canonical ||
      !canonicalRuleResponse.data
    ) {
      throw new Error("Supplier policy was saved but could not be reread canonically.");
    }

    const minimum = SupplierMinimumContract.create({
      value: canonical.minimum_order_value === null
        ? null
        : Number(canonical.minimum_order_value),
      currency: canonical.currency_code,
      minimumOrderPacks: canonicalRuleResponse.data.minimum_order_packs === null
        ? null
        : Number(canonicalRuleResponse.data.minimum_order_packs),
    });

    await emitCommandCentreRefreshEvent({
      domain: "supplier",
      eventType: "supplier-rules-updated",
      entityId: canonical.id,
      source: "supplier-minimum-action",
    });
    revalidateSupplierRuleConsumers();

    return {
      status: "success",
      message: minimum.state === "unknown"
        ? "Minimum-order policy saved as unknown. Trusted buying remains blocked for this supplier."
        : minimum.state === "not_applicable"
          ? "No minimum order has been explicitly confirmed."
          : `Defined minimum saved in ${minimum.currency ?? "the supplier currency"}. Basket-level evaluation remains required.`,
      supplierMinimumState: minimum.state,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof SupplierMinimumInputError
        ? error.message
        : error instanceof Error && error.name === "OperatorAuthorizationError"
          ? "You are not authorized to update supplier rules."
          : error instanceof Error
            ? error.message
            : "Supplier minimum-order policy could not be saved.",
      supplierMinimumState: null,
    };
  }
}
