"use client";

export type ProductEditorTab =
  | "business"
  | "commercial"
  | "inventory"
  | "purchasing"
  | "history";

type ProductEditorTabsProps = {
  activeTab: ProductEditorTab;
  onChange: (tab: ProductEditorTab) => void;
};

const tabs: {
  id: ProductEditorTab;
  label: string;
  description: string;
}[] = [
  {
    id: "business",
    label: "Business",
    description: "Supplier and purchasing rules",
  },
  {
    id: "commercial",
    label: "Commercial",
    description: "Costs, margin and return",
  },
  {
    id: "inventory",
    label: "Inventory",
    description: "Stock position and size runs",
  },
  {
    id: "purchasing",
    label: "Purchasing",
    description: "Vault Brain recommendations",
  },
  {
    id: "history",
    label: "History",
    description: "Price and purchasing records",
  },
];

export function ProductEditorTabs({
  activeTab,
  onChange,
}: ProductEditorTabsProps) {
  return (
    <nav
      aria-label="Product intelligence sections"
      className="product-editor-tabs"
    >
      {tabs.map((tab) => {
        const selected = activeTab === tab.id;

        return (
          <button
            aria-selected={selected}
            className={`product-editor-tab ${
              selected ? "is-active" : ""
            }`}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            role="tab"
            type="button"
          >
            <strong>{tab.label}</strong>
            <span>{tab.description}</span>
          </button>
        );
      })}
    </nav>
  );
}