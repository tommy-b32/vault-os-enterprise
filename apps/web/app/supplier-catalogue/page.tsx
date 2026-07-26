import { CatalogueMatchCard } from "@/components/suppliers/CatalogueMatchCard";
import { SupplierCatalogueCard } from "@/components/suppliers/SupplierCatalogueCard";
import { SupplierCatalogueDropzone } from "@/components/suppliers/SupplierCatalogueDropzone";

import type {
  CatalogueMatchingResult,
} from "@/lib/brain/CatalogueMatchingEngine";

import type {
  CatalogueProduct,
} from "@/types/catalogue";

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

  brand: "Balencia",
  officialProductName: "Balenciaga Logo T-Shirt",
  internalReference: "Exclusive catalogue page 4",

  colour: "Black",

  packCost: 60,
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

const demoProduct: CatalogueProduct = {
  product_id: "demo-balencia-black-tee",
  product_name: "Balencia Logo Tee Black",

  product_type: "T-Shirt",
  status: "active",

  supplier_id: "exclusive",
  supplier_company: "Exclusive",

  inventory_strategy: "stocked",

  restock_enabled: true,

  pack_profile: "pack",

  supplier_moq_packs: null,

  target_stock_days: 21,

  decision_reason:
    "Core catalogue product supplied by Exclusive.",

  notes: null,

  stock_on_hand: 12,

  complete_packs: 2,

  loose_units: 2,

  configuration_score: 82,

  configuration_state: "ready",

  missing_requirements: [],

  missing_requirement_count: 0,

  configuration_trusted: true,

  trusted_for_reorder: true,

  brain_confidence: "high",

  commercial_cost: {
    currency: "EUR",
    exchange_rate_to_gbp: 0.86,

    pack_cost: 60,
    shipping_cost_per_pack: 8,
    import_cost_per_pack: 2,

    units_per_pack: 5,

    landed_cost_per_pack: 70,
    landed_cost_per_pack_gbp: 60.2,
    landed_cost_per_unit: 12.04,

    average_selling_price: 35,

    estimated_gross_profit_per_unit: 22.96,
    estimated_margin_percent: 65.6,

    estimated_return_on_pack_capital_percent:
      190.7,

    commercial_cost_trusted: true,
    missing_commercial_requirements: [],

    last_supplier_price_update:
      "2026-07-26T00:00:00.000Z",

    commercial_notes:
      "Demonstration commercial data for catalogue matching preview.",
  },
};

const demoMatchingResult: CatalogueMatchingResult = {
  catalogueCardId: demoCatalogueCard.id,

  bestMatch: {
    product: demoProduct,
    confidence: 86,

    signals: [
      {
        reason: "same_supplier",
        label: "Same supplier",
        score: 20,
      },
      {
        reason: "brand_match",
        label: "Brand appears in product name",
        score: 20,
      },
      {
        reason: "name_similarity",
        label: "Product naming similarity",
        score: 31,
      },
      {
        reason: "colour_match",
        label: "Colour appears in product name",
        score: 15,
      },
    ],
  },

  alternatives: [],

  requiresReview: false,

  status: "matched",
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
              Catalogue Matching Preview
            </p>

            <h2>
              Supplier item and suggested match
            </h2>

            <p>
              Vault Brain compares the visual supplier
              catalogue item with your Fabric Vault
              product catalogue and explains its
              recommendation.
            </p>
          </div>

          <span>86% confidence</span>
        </header>

        <div className="supplier-catalogue-match-preview">
          <SupplierCatalogueCard
            card={demoCatalogueCard}
          />

          <CatalogueMatchCard
            result={demoMatchingResult}
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
            a visual supplier catalogue card, suggest
            Fabric Vault product matches and prepare
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