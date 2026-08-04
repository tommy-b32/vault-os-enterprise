import type {
  CatalogueProduct,
  CatalogueSupplier,
} from "@/types/catalogue";
import {
  approveProductForReorder,
  revokeProductReorderApproval,
} from "@/app/catalogue/actions";

type ProductBusinessTabProps = {
  product: CatalogueProduct;
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

function formatApprovalTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}

export function ProductBusinessTab({
  product,
  suppliers,
}: ProductBusinessTabProps) {
  const approval = product.reorder_approval;
  const hasActiveApproval =
    approval?.approval_state === "approved";
  const configurationEligible =
    product.configuration_trusted &&
    product.inventory_strategy === "stocked" &&
    product.restock_enabled;
  const approvalState = hasActiveApproval
    ? configurationEligible
      ? "approved"
      : "inactive"
    : configurationEligible
      ? "ready"
      : "ineligible";

  return (
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
            defaultValue={product.inventory_strategy}
            name="inventory_strategy"
          >
            {strategies.map(([value, label]) => (
              <option
                key={value}
                value={value}
              >
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Pack profile</span>

          <select
            defaultValue={product.pack_profile ?? ""}
            name="pack_profile"
          >
            {packProfiles.map(([value, label]) => (
              <option
                key={value}
                value={value}
              >
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
            defaultChecked={product.restock_enabled}
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
            placeholder="Example: Core stocked product"
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

      <section className={`commercial-approval is-${approvalState}`}>
        <input
          name="parent_product_id"
          type="hidden"
          value={product.parent_product_id}
        />

        <div className="commercial-approval-heading">
          <div>
            <p className="vault-eyebrow">Commercial Approval</p>
            <h4>Reorder approval</h4>
          </div>
          <span>
            {approvalState === "approved" && "Approved"}
            {approvalState === "ready" && "Ready for approval"}
            {approvalState === "inactive" &&
              "Approval inactive because configuration changed"}
            {approvalState === "ineligible" && "Not eligible"}
          </span>
        </div>

        {approval ? (
          <dl className="commercial-approval-metadata">
            <div>
              <dt>Approving operator</dt>
              <dd>{approval.approved_by_display_name}</dd>
            </div>
            <div>
              <dt>Approval timestamp</dt>
              <dd>{formatApprovalTimestamp(approval.approved_at)}</dd>
            </div>
          </dl>
        ) : null}

        {approvalState === "ineligible" ? (
          <p>
            Complete the mandatory configuration before this product can
            be explicitly approved. Missing: {product.missing_requirements
              .map((requirement) => requirement.replaceAll("_", " "))
              .join(", ") || "stocked strategy or restock permission"}.
          </p>
        ) : null}

        {approvalState === "inactive" ? (
          <p>
            The approval record is preserved, but reorder trust remains
            disabled until the mandatory configuration is restored.
          </p>
        ) : null}

        {approvalState === "ready" ? (
          <p>
            Configuration is complete. Approval requires an explicit
            operator action and applies to this canonical parent product.
          </p>
        ) : null}

        <div className="commercial-approval-actions">
          {hasActiveApproval ? (
            <button
              formAction={revokeProductReorderApproval}
              type="submit"
            >
              Revoke approval
            </button>
          ) : (
            <button
              disabled={!configurationEligible}
              formAction={approveProductForReorder}
              type="submit"
            >
              Approve for reorder
            </button>
          )}
        </div>
      </section>
    </section>
  );
}
