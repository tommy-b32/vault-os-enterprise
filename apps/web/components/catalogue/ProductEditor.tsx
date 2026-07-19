"use client";

import { useActionState } from "react";
import { ProductSaveButton } from "@/components/catalogue/ProductSaveButton";
import { ProductStats } from "@/components/catalogue/ProductStats";
import type {
  CatalogueProduct,
  CatalogueSupplier,
} from "@/types/catalogue";

import {
  updateProductSettings,
  type ProductSettingsActionState,
} from "@/app/catalogue/actions";

type ProductEditorProps = {
  product: CatalogueProduct | null;
  suppliers: CatalogueSupplier[];
};

const strategies = [
  ["stocked", "Stocked"],
  ["do_not_restock", "Do not restock"],
  ["discontinued", "Discontinued"],
  ["dropship", "Dropship"],
  ["service", "Service"],
] as const;

const packProfiles = [
  ["", "No pack profile"],
  ["tee_5_piece", "Tee — 5 piece"],
  ["polo_6_piece", "Polo — 6 piece"],
  ["hoodie", "Hoodie"],
  ["custom", "Custom"],
] as const;

export function ProductEditor({
  product,
  suppliers,
}: ProductEditorProps) {
      const initialState: ProductSettingsActionState = {
    status: "idle",
    message: "",
  };

  const [saveState, saveAction] = useActionState(
    updateProductSettings,
    initialState,
  );

  if (!product) {
    return (
      <section className="product-editor-empty">
        <div className="product-editor-empty-icon">
          V
        </div>

        <h2>Select a product</h2>

        <p>
          Choose a product from the list to review its
          supplier, inventory strategy and purchasing
          rules.
        </p>
      </section>
    );
  }

  return (
    <form
      action={saveAction}
      className="product-editor"
      key={product.product_id}
    >
      <input
        name="product_id"
        type="hidden"
        value={product.product_id}
      />

      <header className="product-editor-header">
        <div>
          <p className="vault-eyebrow">
            Product Intelligence
          </p>

          <h2>{product.product_name}</h2>

          <p>
            Shopify status:{" "}
            <strong>
              {product.status ?? "Unknown"}
            </strong>
          </p>
        </div>

        <span
          className={`catalogue-strategy-badge strategy-${product.inventory_strategy}`}
        >
          {product.inventory_strategy
            .replaceAll("_", " ")}
        </span>
      </header>

      <ProductStats product={product} />

      <section className="product-editor-section">
        <div className="product-editor-section-heading">
          <div>
            <p className="vault-eyebrow">
              Business Rules
            </p>

            <h3>Product configuration</h3>
          </div>

          <p>
            These settings are private to Vault OS and
            will not be overwritten by Shopify.
          </p>
        </div>

        <div className="product-editor-grid">
          <label>
            <span>Supplier company</span>

            <select
              defaultValue={product.supplier_id ?? ""}
              name="supplier_id"
            >
              <option value="">
                Not assigned
              </option>

              {suppliers.map((supplier) => (
                <option
                  key={supplier.id}
                  value={supplier.id}
                >
                  {supplier.supplier_name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Inventory strategy</span>

            <select
              defaultValue={
                product.inventory_strategy
              }
              name="inventory_strategy"
            >
              {strategies.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Pack profile</span>

            <select
              defaultValue={
                product.pack_profile ?? ""
              }
              name="pack_profile"
            >
              {packProfiles.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Supplier MOQ — packs</span>

            <input
              defaultValue={
                product.supplier_moq_packs ?? ""
              }
              min="0"
              name="supplier_moq_packs"
              placeholder="Example: 20"
              type="number"
            />
          </label>

          <label>
            <span>Target stock days</span>

            <input
              defaultValue={
                product.target_stock_days ?? ""
              }
              min="0"
              name="target_stock_days"
              placeholder="Example: 30"
              type="number"
            />
          </label>

          <label className="product-editor-toggle">
            <span>Restock enabled</span>

            <input
              defaultChecked={
                product.restock_enabled
              }
              name="restock_enabled"
              type="checkbox"
            />

            <small>
              Include this product in future reorder
              recommendations.
            </small>
          </label>

          <label className="product-editor-wide">
            <span>Decision reason</span>

            <input
              defaultValue={
                product.decision_reason ?? ""
              }
              name="decision_reason"
              placeholder="Example: Slow seller"
              type="text"
            />
          </label>

          <label className="product-editor-wide">
            <span>Private notes</span>

            <textarea
              defaultValue={product.notes ?? ""}
              name="notes"
              placeholder="Record supplier, quality or purchasing notes..."
              rows={4}
            />
          </label>
        </div>
      </section>

      <footer className="product-editor-footer">
        <div>
          <strong>Vault business memory</strong>

          <p>
            Saving will update Inventory Intelligence,
            supplier planning and future Vault Advisor
            recommendations.
          </p>
        </div>

        <ProductSaveButton />
      </footer>
            {saveState.status !== "idle" && (
        <p
          aria-live="polite"
          className={`product-save-message is-${saveState.status}`}
        >
          {saveState.status === "success" ? "✓ " : "⚠ "}
          {saveState.message}
        </p>
      )}
    </form>
  );
}