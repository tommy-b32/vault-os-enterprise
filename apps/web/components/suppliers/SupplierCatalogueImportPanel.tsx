"use client";

type Props = {
  fileName: string;
};

export function SupplierCatalogueImportPanel({
  fileName,
}: Props) {
  return (
    <section className="supplier-import-panel">
      <header className="supplier-import-panel-header">
        <div>
          <p className="vault-eyebrow">
            Import Preparation
          </p>

          <h2>Confirm catalogue details</h2>

          <p>
            Before Vault Brain extracts images, confirm
            which supplier this catalogue belongs to.
          </p>
        </div>

        <span className="supplier-import-status">
          Ready
        </span>
      </header>

      <div className="supplier-import-grid">
        <label>
          <span>Supplier</span>

          <select defaultValue="">
            <option value="">
              Select supplier...
            </option>

            <option>Exclusive</option>
            <option>Icon</option>
            <option>Tony Footwear</option>
          </select>
        </label>

        <label>
          <span>Season / Collection</span>

          <input
            defaultValue={fileName.replace(".pdf", "")}
          />
        </label>

        <label>
          <span>Catalogue Type</span>

          <select defaultValue="products">
            <option value="products">
              Products
            </option>

            <option value="footwear">
              Footwear
            </option>

            <option value="accessories">
              Accessories
            </option>
          </select>
        </label>

        <label>
          <span>Expected Lead Time</span>

          <input
            placeholder="10 days"
          />
        </label>
      </div>

      <footer className="supplier-import-footer">
        <button
          className="brain-button brain-button-secondary"
          type="button"
        >
          Cancel
        </button>

        <button
          className="brain-button"
          type="button"
        >
          Begin Extraction →
        </button>
      </footer>
    </section>
  );
}