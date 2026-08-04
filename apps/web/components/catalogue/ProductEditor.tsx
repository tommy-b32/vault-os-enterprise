"use client";

import {
  useActionState,
  useEffect,
  useState,
} from "react";

import {
  updateProductSettings,
  type ProductSettingsActionState,
} from "@/app/catalogue/actions";

import { ProductSaveButton } from "@/components/catalogue/ProductSaveButton";
import { ProductStats } from "@/components/catalogue/ProductStats";
import {
  ProductEditorTabs,
  type ProductEditorTab,
} from "@/components/catalogue/ProductEditorTabs";
import { ProductBusinessTab } from "@/components/catalogue/editor/ProductBusinessTab";
import { ProductCommercialTab } from "@/components/catalogue/editor/ProductCommercialTab";

import type {
  CatalogueProduct,
  CatalogueSupplier,
} from "@/types/catalogue";

type ProductEditorProps = {
  product: CatalogueProduct | null;
  suppliers: CatalogueSupplier[];
};

const requirementLabels: Record<string, string> = {
  supplier: "Supplier assigned",
  inventory_strategy: "Inventory strategy",
  pack_profile: "Pack profile",
  supplier_moq: "Supplier MOQ",
  target_stock_days: "Target stock days",
};

function getNextActions(
  product: CatalogueProduct,
): string[] {
  if (product.missing_requirements.length === 0) {
    return [
      "No action required",
      "Vault Brain can trust this product",
    ];
  }

  return product.missing_requirements.map(
    (requirement) =>
      requirementLabels[requirement] ??
      requirement.replaceAll("_", " "),
  );
}

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

  const [activeTab, setActiveTab] =
    useState<ProductEditorTab>("business");

  useEffect(() => {
    // Style changes intentionally return the editor to its default workspace.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTab("business");
  }, [product?.style_id]);

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

  const checks = [
    {
      key: "supplier",
      label: "Supplier assigned",
      complete:
        !product.missing_requirements.includes(
          "supplier",
        ),
    },
    {
      key: "inventory_strategy",
      label: "Inventory strategy",
      complete:
        !product.missing_requirements.includes(
          "inventory_strategy",
        ),
    },
    {
      key: "pack_profile",
      label: "Pack profile",
      complete:
        !product.missing_requirements.includes(
          "pack_profile",
        ),
    },
    {
      key: "supplier_moq",
      label: "Supplier MOQ",
      complete:
        !product.missing_requirements.includes(
          "supplier_moq",
        ),
    },
    {
      key: "target_stock_days",
      label: "Target stock days",
      complete:
        !product.missing_requirements.includes(
          "target_stock_days",
        ),
    },
  ];

  const nextActions = getNextActions(product);

  return (
    <div
      className="product-editor"
      key={product.style_id}
    >
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
          {product.inventory_strategy.replaceAll(
            "_",
            " ",
          )}
        </span>
      </header>

      <ProductStats product={product} />

      <section className="configuration-health-card">
        <div className="configuration-health-header">
          <div>
            <p className="vault-eyebrow">
              Vault Brain
            </p>

            <h3>Product Readiness</h3>
          </div>

          <span
            className={`configuration-confidence confidence-${product.brain_confidence}`}
          >
            {product.brain_confidence === "high" &&
              "Trusted"}

            {product.brain_confidence === "limited" &&
              "Limited confidence"}

            {product.brain_confidence === "untrusted" &&
              "Low confidence"}
          </span>
        </div>

        <div className="configuration-score-row">
          <strong>
            {product.configuration_score}%
          </strong>

          <span>
            {product.configuration_state.replaceAll(
              "_",
              " ",
            )}
          </span>
        </div>

        <div className="configuration-progress">
          <span
            style={{
              width: `${product.configuration_score}%`,
            }}
          />
        </div>

        <div className="configuration-checklist">
          {checks.map((check) => (
            <div
              className={`configuration-check ${
                check.complete
                  ? "is-complete"
                  : "is-missing"
              }`}
              key={check.key}
            >
              <span aria-hidden="true">
                {check.complete ? "✓" : "✕"}
              </span>

              <span>{check.label}</span>
            </div>
          ))}
        </div>

        <div className="configuration-next-action">
          <span>
            {nextActions.length === 1
              ? "Next action"
              : "Next actions"}
          </span>

          <ul>
            {nextActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </div>

        <div className="vault-brain-panel">
          <div className="vault-brain-panel-header">
            <p className="vault-eyebrow">
              Vault Brain Analysis
            </p>

            <h4>
              {product.configuration_trusted
                ? "Decision Engine Ready"
                : "Decision Engine Waiting"}
            </h4>
          </div>

          {!product.configuration_trusted ? (
            <>
              <p className="vault-brain-message">
                Vault Brain does not yet have enough
                information to make reliable purchasing
                decisions for this product.
              </p>

              <div className="vault-brain-summary">
                <div>
                  <span>Confidence</span>
                  <strong>
                    {product.configuration_score}%
                  </strong>
                </div>

                <div>
                  <span>Missing Rules</span>
                  <strong>
                    {product.missing_requirement_count}
                  </strong>
                </div>

                <div>
                  <span>Estimated Setup</span>
                  <strong>
                    {product.missing_requirement_count *
                      10}{" "}
                    sec
                  </strong>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="vault-brain-message">
                Vault Brain understands this product and
                can safely include it in future stock
                recommendations.
              </p>

              <div className="vault-brain-summary">
                <div>
                  <span>Status</span>
                  <strong>Trusted</strong>
                </div>

                <div>
                  <span>Reorder Engine</span>
                  <strong>
                    {product.trusted_for_reorder
                      ? "Enabled"
                      : "Disabled"}
                  </strong>
                </div>

                <div>
                  <span>Confidence</span>
                  <strong>
                    {product.configuration_score}%
                  </strong>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <ProductEditorTabs
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "business" && (
        <form action={saveAction}>
          <input
            name="parent_product_id"
            type="hidden"
            value={product.parent_product_id}
          />

          <ProductBusinessTab
            product={product}
            suppliers={suppliers}
          />

          <footer className="product-editor-footer">
            <div>
              <strong>Vault business memory</strong>

              <p>
                Saving will update Inventory Intelligence, supplier
                planning and future Vault Advisor recommendations.
              </p>
            </div>

            <ProductSaveButton />
          </footer>

          {saveState.status !== "idle" && (
            <p
              aria-live="polite"
              className={`product-save-message is-${saveState.status}`}
            >
              {saveState.status === "success" ? "Saved: " : "Attention: "}
              {saveState.message}
            </p>
          )}
        </form>
      )}

      {activeTab === "commercial" && (
        <ProductCommercialTab
          key={product.style_id}
          product={product}
        />
      )}

      {activeTab === "inventory" && (
        <section className="product-editor-section product-workspace-placeholder">
          <p className="vault-eyebrow">
            Inventory Intelligence
          </p>

          <h3>Stock position and pack health</h3>

          <p>
            Current stock, complete packs and broken
            size-run intelligence will be expanded here.
          </p>
        </section>
      )}

      {activeTab === "purchasing" && (
        <section className="product-editor-section product-workspace-placeholder">
          <p className="vault-eyebrow">
            Vault Brain Purchasing
          </p>

          <h3>Purchasing recommendation</h3>

          <p>
            Supplier basket recommendations,
            affordability and expected return will
            appear here.
          </p>
        </section>
      )}

      {activeTab === "history" && (
        <section className="product-editor-section product-workspace-placeholder">
          <p className="vault-eyebrow">
            Product History
          </p>

          <h3>Commercial and purchasing records</h3>

          <p>
            Supplier price changes, purchase history and
            audit events will appear here.
          </p>
        </section>
      )}

    </div>
  );
}
