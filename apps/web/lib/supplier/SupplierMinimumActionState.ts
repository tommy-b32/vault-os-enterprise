import type { SupplierMinimumState } from "@/lib/supplier/SupplierMinimum";

export type SupplierMinimumActionState = {
  status: "idle" | "success" | "error";
  message: string;
  supplierMinimumState: SupplierMinimumState | null;
};

export const INITIAL_SUPPLIER_MINIMUM_ACTION_STATE: SupplierMinimumActionState = {
  status: "idle",
  message: "",
  supplierMinimumState: null,
};

