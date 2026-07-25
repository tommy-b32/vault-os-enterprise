import { SupplierCatalogueCard } from "@/components/suppliers/SupplierCatalogueCard";
import { SupplierCatalogueDropzone } from "@/components/suppliers/SupplierCatalogueDropzone";

import type {
  SupplierCatalogueCardData,
} from "@/types/supplier-catalogue";

const demoCatalogueCard: SupplierCatalogueCardData = {
  id: "exclusive-summer-2026-demo",

  supplierId: "exclusive",
  supplierName: "Exclusive",

  catalogueId: "exclusive-summer-2026",
  catalogueName: "Summer T-Shirt Collection 2026",

  pageNumber: 4,

  brand: "Supplier catalogue item",
  officialProductName: null,
  internalReference: "Exclusive catalogue page 4",

  colour: null,

  packCost: null,
  packSize: 5,
  currency: "EUR",

  leadTimeDays: 10,

  status: "unlinked",

  linkedProductId: null,
  linkedProductName: null,

  isPreferredSource: true,

  images: [],

  notes:
    "Demo visual catalogue card based on the uploaded Exclusive Summer 2026 PDF.",
};

const catalogueStats = [
  {
    label: "Supplier Catalogues",
    value: "3",
    helper: "Active supplier archives",
  },
  {
    label: "Catalogue Pages",
    value: "152",
    helper: "Latest Exclusive PDF",
  },
  {
    label: "Mapped Products",
    value: "0",
    helper: "Ready for product linking",
  },
  {
    label: "Buying Opportunities",
    value: "0",
    helper: "Vault Brain analysis pending",
  },
];

const supplierCatalogues = [
  {
    id: "exclusive",
    supplier: "Exclusive",
    season: "Summer T-Shirt Collection 2026",
    products: 152,
    lastImported: "Latest catalogue uploaded",
    reliability: "Primary supplier",
    leadTime: "10 days",
    status: "Ready to review",
  },
  {
    id: "icon",
    supplier: "Icon",
    season: "Latest Collection",
    products: 0,
    lastImported: "No catalogue imported",
    reliability: "Secondary supplier",
    leadTime: "10 days",
    status: "Awaiting catalogue",
  },
  {
    id: "tony-footwear",
    supplier: "Tony Footwear",
    season: "Latest Footwear Collection",
    products: 0,
    lastImported: "No catalogue imported",
    reliability: "Footwear supplier",
    leadTime: "7 days",
    status: "Awaiting catalogue",
  },
];

export const dynamic = "force-dynamic";

export default function SupplierCataloguePage() {
  return (
    <main className="supplier-catalogue-page">
      <header className="supplier-catalogue-hero">
        <div>
          <p className="vault-eyebrow">
            Supplier Catalogue Intelligence
          </p>

          <h1>Supplier Catalogue</h1>

          <p>
            Every supplier catalogue you receive,
            organised, searchable and connected to
            Vault Brain.
          </p>
        </div>

        <a
          className="catalogue-back"
          href="/"
        >
          ← Command Centre
        </a>
      </header>

      <section className="supplier-catalogue-import">
        <SupplierCatalogueDropzone />
      </section>

      <section className="supplier-catalogue-intelligence">
        <div className="supplier-catalogue-intelligence-header">
          <div>
            <p className="vault-eyebrow">
              Live Archive
            </p>

            <h2>Catalogue Intelligence</h2>

            <p>
              The commercial memory of every supplier
              catalogue, image and buying source.
            </p>
          </div>

          <span className="supplier-catalogue-status">
            Vault Brain ready
          </span>
        </div>

        <div className="supplier-catalogue-stat-grid">
          {catalogueStats.map((stat) => (
            <article
              key={stat.label}
              className="supplier-catalogue-stat"
            >
              <span>{stat.label}</span>

              <strong>{stat.value}</strong>

              <small>{stat.helper}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="supplier-catalogue-search-panel">
        <div>
          <p className="vault-eyebrow">
            Global Catalogue Search
          </p>

          <h2>Search every supplier catalogue</h2>

          <p>
            Search by supplier, brand, colour,
            catalogue season or linked Fabric Vault
            product.
          </p>
        </div>

        <label className="supplier-catalogue-search">
          <span aria-hidden="true">⌕</span>

          <input
            aria-label="Search supplier catalogues"
            placeholder="Search supplier catalogues..."
            type="search"
          />

          <kbd>Ctrl K</kbd>
        </label>
      </section>

      <section className="supplier-catalogue-archive">
        <header className="supplier-catalogue-section-header">
          <div>
            <p className="vault-eyebrow">
              Supplier Archives
            </p>

            <h2>Your catalogues</h2>

            <p>
              Open a supplier archive to review visual
              catalogue cards, link products and prepare
              future orders.
            </p>
          </div>

          <span>
            {supplierCatalogues.length} suppliers
          </span>
        </header>

        <div className="supplier-catalogue-grid">
          {supplierCatalogues.map((catalogue) => (
            <article
              key={catalogue.id}
              className={`supplier-catalogue-card supplier-${catalogue.id}`}
            >
              <div className="supplier-catalogue-card-glow" />

              <header>
                <div>
                  <p className="vault-eyebrow">
                    Supplier Archive
                  </p>

                  <h3>{catalogue.supplier}</h3>
                </div>

                <span>{catalogue.status}</span>
              </header>

              <div className="supplier-catalogue-card-season">
                <span>Latest catalogue</span>

                <strong>{catalogue.season}</strong>
              </div>

              <div className="supplier-catalogue-card-metrics">
                <div>
                  <span>Catalogue pages</span>

                  <strong>{catalogue.products}</strong>
                </div>

                <div>
                  <span>Lead time</span>

                  <strong>{catalogue.leadTime}</strong>
                </div>

                <div>
                  <span>Supplier role</span>

                  <strong>
                    {catalogue.reliability}
                  </strong>
                </div>
              </div>

              <footer>
                <div>
                  <span>Last imported</span>

                  <strong>
                    {catalogue.lastImported}
                  </strong>
                </div>

                <a
                  href={`/supplier-catalogue/${catalogue.id}`}
                >
                  Open Catalogue →
                </a>
              </footer>
            </article>
          ))}
        </div>
      </section>

      <section className="supplier-catalogue-demo">
        <header className="supplier-catalogue-section-header">
          <div>
            <p className="vault-eyebrow">
              Catalogue Card Preview
            </p>

            <h2>Visual supplier item</h2>

            <p>
              This is the foundation of image-first
              purchasing inside Vault OS.
            </p>
          </div>
        </header>

        <div className="supplier-catalogue-demo-grid">
          <SupplierCatalogueCard
            card={demoCatalogueCard}
          />
        </div>
      </section>

      <section className="supplier-catalogue-next-step">
        <div>
          <p className="vault-eyebrow">
            Vault Brain
          </p>

          <h2>
            Visual purchasing starts here
          </h2>

          <p>
            The next stage will turn every PDF page into
            a visual supplier catalogue card that can be
            linked to Fabric Vault products and added to
            WhatsApp-ready purchase orders.
          </p>
        </div>

        <span>
          PDF extraction coming next
        </span>
      </section>
    </main>
  );
}