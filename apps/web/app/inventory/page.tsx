import VaultAppShell from "@/components/layout/VaultAppShell";
import MissionControlStyles from "@/components/brain/MissionControlStyles";
import VaultIcon, {
  type VaultIconName,
} from "@/components/brain/workspace/VaultIcon";

import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

type InventoryRecord = {
  product_id: string;
  product_name: string | null;
  stock_on_hand: number | null;
  committed_stock: number | null;
  incoming_stock: number | null;
  last_inventory_sync: string | null;

  inventory_strategy: string | null;
  configuration_state: string | null;
};

type InventoryConfigurationRow = {
  product_id: string;
  inventory_strategy: string | null;
  configuration_state: string | null;
};

type InventoryStatus =
  | "negative"
  | "out"
  | "low"
  | "healthy"
  | "dropship"
  | "service"
  | "do_not_restock"
  | "discontinued";

function normaliseNumber(
  value: number | null | undefined,
): number {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return 0;
  }

  return value;
}

function getAvailableStock(
  record: InventoryRecord,
): number {
  return (
    normaliseNumber(record.stock_on_hand) -
    normaliseNumber(record.committed_stock)
  );
}

function getInventoryStatus(
  record: InventoryRecord,
): InventoryStatus {
  const strategy =
    record.inventory_strategy?.toLowerCase() ?? "";

  const configurationState =
    record.configuration_state?.toLowerCase() ?? "";

  if (
    strategy === "service" ||
    configurationState === "service"
  ) {
    return "service";
  }

  if (
    strategy === "dropship" ||
    configurationState === "dropship_ready"
  ) {
    return "dropship";
  }

  if (
    strategy === "do_not_restock" ||
    configurationState === "do_not_restock"
  ) {
    return "do_not_restock";
  }

  if (
    strategy === "discontinued" ||
    configurationState === "discontinued"
  ) {
    return "discontinued";
  }

  const stockOnHand =
    normaliseNumber(record.stock_on_hand);

  const availableStock =
    getAvailableStock(record);

  if (stockOnHand < 0 || availableStock < 0) {
    return "negative";
  }

  if (availableStock === 0) {
    return "out";
  }

  if (availableStock <= 5) {
    return "low";
  }

  return "healthy";
}

function isInventoryRisk(
  record: InventoryRecord,
): boolean {
  const status =
    getInventoryStatus(record);

  return (
    status === "negative" ||
    status === "out" ||
    status === "low"
  );
}

function isMonitoredInventory(
  record: InventoryRecord,
): boolean {
  const status =
    getInventoryStatus(record);

  return (
    status !== "dropship" &&
    status !== "service" &&
    status !== "do_not_restock" &&
    status !== "discontinued"
  );
}

function getStatusLabel(
  status: InventoryStatus,
): string {
  switch (status) {
    case "negative":
      return "Negative stock";

    case "out":
      return "Out of stock";

    case "low":
      return "Low stock";

    case "healthy":
      return "Healthy";

    case "dropship":
      return "Dropship";

    case "service":
      return "Service";

    case "do_not_restock":
      return "Do not restock";

    case "discontinued":
      return "Discontinued";
  }
}

function getStatusClass(
  status: InventoryStatus,
): string {
  return `inventory-status-${status}`;
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "Not synced";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function calculateHealthScore(
  records: InventoryRecord[],
): number {
  const monitoredRecords =
    records.filter(
      isMonitoredInventory,
    );

  if (monitoredRecords.length === 0) {
    return 100;
  }

  const weightedHealth =
    monitoredRecords.reduce(
      (total, record) => {
        const status =
          getInventoryStatus(record);

        switch (status) {
          case "healthy":
            return total + 1;

          case "low":
            return total + 0.5;

          case "out":
          case "negative":
            return total;

          case "dropship":
          case "service":
          case "do_not_restock":
          case "discontinued":
            return total;
        }
      },
      0,
    );

  return Math.round(
    (weightedHealth /
      monitoredRecords.length) *
      100,
  );
}

function InventoryMetric({
  icon,
  label,
  value,
  supportingText,
  tone = "default",
}: {
  icon: VaultIconName;
  label: string;
  value: string | number;
  supportingText: string;
  tone?:
    | "default"
    | "positive"
    | "warning"
    | "critical";
}) {
  return (
    <article
      className={`inventory-metric inventory-metric-${tone}`}
    >
      <span className="inventory-metric-icon">
        <VaultIcon name={icon} />
      </span>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <p>{supportingText}</p>
      </div>
    </article>
  );
}

function InventoryPageStyles() {
  return (
    <style>{`
      .inventory-content {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-auto-flow: row;
  align-items: start;
  gap: 22px;
  width: 100%;
}

.inventory-content > * {
  width: 100%;
  min-width: 0;
}

      .inventory-header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 28px;
      }

      .inventory-heading {
        min-width: 0;
      }

      .inventory-heading h1 {
        margin: 8px 0 0;
        color: #f5f5f3;
        font-size: clamp(30px, 4vw, 48px);
        letter-spacing: -0.045em;
        line-height: 1;
      }

      .inventory-heading > p:last-child {
        max-width: 720px;
        margin: 13px 0 0;
        color: #92969a;
        font-size: 13px;
        line-height: 1.65;
      }

      .inventory-sync-status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex: 0 0 auto;
        padding: 8px 11px;
        border: 1px solid rgba(65, 176, 108, 0.24);
        border-radius: 999px;
        color: #8fd7aa;
        background: rgba(41, 119, 72, 0.12);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .inventory-sync-status i {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: #63d18c;
        box-shadow:
          0 0 0 4px rgba(99, 209, 140, 0.08),
          0 0 16px rgba(99, 209, 140, 0.32);
      }

      .inventory-status-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 20px;
        padding: 10px 14px;
        border: 1px solid rgba(255, 255, 255, 0.075);
        border-radius: 10px;
        background: #101210;
      }

      .inventory-status-strip span {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        color: #919598;
        font-size: 10px;
      }

      .inventory-status-strip i {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #5fcf88;
        box-shadow: 0 0 10px rgba(95, 207, 136, 0.38);
      }

      .inventory-metrics {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 12px;
      }

      .inventory-metric {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-width: 0;
        padding: 17px;
        border: 1px solid rgba(255, 255, 255, 0.075);
        border-radius: 12px;
        background:
          linear-gradient(
            145deg,
            rgba(255, 255, 255, 0.018),
            transparent 55%
          ),
          #101210;
      }

      .inventory-metric-icon {
        display: grid;
        width: 36px;
        height: 36px;
        flex: 0 0 36px;
        place-items: center;
        border: 1px solid rgba(212, 168, 70, 0.24);
        border-radius: 10px;
        color: #d9ae43;
        background: rgba(212, 168, 70, 0.065);
      }

      .inventory-metric > div {
        min-width: 0;
      }

      .inventory-metric > div > span {
        display: block;
        color: #85898c;
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .inventory-metric strong {
        display: block;
        margin-top: 5px;
        color: #f4f4f1;
        font-size: 24px;
        letter-spacing: -0.025em;
        line-height: 1;
      }

      .inventory-metric p {
        margin: 7px 0 0;
        color: #696d70;
        font-size: 9px;
        line-height: 1.4;
      }

      .inventory-metric-positive
        .inventory-metric-icon {
        border-color: rgba(65, 176, 108, 0.28);
        color: #8fd7aa;
        background: rgba(41, 119, 72, 0.14);
      }

      .inventory-metric-warning
        .inventory-metric-icon {
        border-color: rgba(224, 181, 63, 0.3);
        color: #e6bc4d;
        background: rgba(126, 92, 8, 0.17);
      }

      .inventory-metric-critical
        .inventory-metric-icon {
        border-color: rgba(221, 91, 80, 0.3);
        color: #ffaaa5;
        background: rgba(129, 31, 26, 0.18);
      }

      .inventory-risk-panel {
        padding: 21px;
      }

      .inventory-panel-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 20px;
        padding-bottom: 17px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.07);
      }

      .inventory-panel-header h2 {
        margin: 5px 0 0;
        color: #eeeeec;
        font-size: 18px;
        letter-spacing: -0.02em;
      }

      .inventory-panel-header p {
        max-width: 580px;
        margin: 7px 0 0;
        color: #787c7f;
        font-size: 10px;
        line-height: 1.55;
      }

      .inventory-risk-count {
        flex: 0 0 auto;
        padding: 6px 9px;
        border: 1px solid rgba(224, 181, 63, 0.22);
        border-radius: 999px;
        color: #e2b748;
        background: rgba(126, 92, 8, 0.12);
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }

      .inventory-risk-list {
        display: grid;
        gap: 9px;
        margin-top: 14px;
      }

      .inventory-risk-row {
  display: grid;
  grid-template-columns:
    minmax(220px, 1fr)
    repeat(4, minmax(88px, 0.35fr))
    minmax(100px, 0.35fr);
        gap: 12px;
        align-items: center;
        padding: 13px 14px;
        border: 1px solid rgba(255, 255, 255, 0.065);
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.014);
      }

      .inventory-product {
        min-width: 0;
      }

      .inventory-product strong {
        display: block;
        overflow: hidden;
        color: #e9ebe9;
        font-size: 12px;
        line-height: 1.4;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .inventory-product span {
        display: block;
        margin-top: 4px;
        overflow: hidden;
        color: #626669;
        font-size: 9px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .inventory-value {
        min-width: 0;
      }

      .inventory-value span {
        display: block;
        color: #65696c;
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.07em;
        text-transform: uppercase;
      }

      .inventory-value strong {
        display: block;
        margin-top: 5px;
        color: #e5e7e5;
        font-size: 12px;
      }

      .inventory-status {
        display: inline-flex;
        justify-content: center;
        justify-self: start;
        min-width: 82px;
        padding: 5px 8px;
        border: 1px solid rgba(255, 255, 255, 0.09);
        border-radius: 999px;
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      .inventory-status-healthy {
        border-color: rgba(65, 176, 108, 0.24);
        color: #8fd7aa;
        background: rgba(41, 119, 72, 0.12);
      }

      .inventory-status-low {
        border-color: rgba(224, 181, 63, 0.24);
        color: #e5ba49;
        background: rgba(126, 92, 8, 0.13);
      }

      .inventory-status-out,
      .inventory-status-negative {
        border-color: rgba(221, 91, 80, 0.27);
        color: #ffaaa5;
        background: rgba(129, 31, 26, 0.15);
      }

      .inventory-status-dropship {
        border-color: rgba(70, 144, 193, 0.25);
        color: #8bc8eb;
        background: rgba(29, 89, 126, 0.14);
      }

      .inventory-status-service {
        border-color: rgba(167, 122, 214, 0.25);
        color: #c9a7ed;
        background: rgba(89, 48, 126, 0.14);
      }

      .inventory-status-do_not_restock {
        min-width: 104px;
        border-color: rgba(212, 168, 70, 0.24);
        color: #dfb449;
        background: rgba(126, 92, 8, 0.13);
      }

      .inventory-status-discontinued {
        min-width: 96px;
        border-color: rgba(255, 255, 255, 0.12);
        color: #979b9e;
        background: rgba(255, 255, 255, 0.035);
      }

      .inventory-table-panel {
        padding: 21px;
      }

      .inventory-table-wrapper {
        margin-top: 14px;
        overflow-x: auto;
        border: 1px solid rgba(255, 255, 255, 0.065);
        border-radius: 10px;
      }

      .inventory-table {
        width: 100%;
        min-width: 820px;
        border-collapse: collapse;
      }

      .inventory-table th,
      .inventory-table td {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.055);
        text-align: left;
      }

      .inventory-table th {
        color: #6c7073;
        background: rgba(255, 255, 255, 0.018);
        font-size: 8px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
      }

      .inventory-table td {
        color: #a6aaad;
        font-size: 10px;
      }

      .inventory-table tbody tr:last-child td {
        border-bottom: 0;
      }

      .inventory-table tbody tr:hover {
        background: rgba(212, 168, 70, 0.022);
      }

      .inventory-table-product {
        max-width: 280px;
      }

      .inventory-table-product strong {
        display: block;
        overflow: hidden;
        color: #e7e9e7;
        font-size: 11px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .inventory-table-product span {
        display: block;
        margin-top: 4px;
        overflow: hidden;
        color: #5f6366;
        font-size: 8px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .inventory-empty {
        padding: 48px 24px;
        text-align: center;
      }

      .inventory-empty h2 {
        margin: 10px 0 0;
        color: #eceeec;
      }

      .inventory-empty p {
        margin: 8px auto 0;
        color: #777b7e;
      }

      .inventory-error-panel {
        margin: 28px;
        padding: 24px;
        border: 1px solid rgba(221, 91, 80, 0.28);
        border-radius: 14px;
        color: #ffaaa5;
        background: rgba(129, 31, 26, 0.13);
      }

      .inventory-error-panel h1 {
        margin: 0;
        color: #fff0ee;
      }

      .inventory-error-panel pre {
        margin: 14px 0 0;
        overflow: auto;
        color: #ffaaa5;
        white-space: pre-wrap;
      }

      @media (max-width: 1320px) {
        .inventory-metrics {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }

      @media (max-width: 900px) {
        .inventory-header {
          align-items: flex-start;
          flex-direction: column;
        }

        .inventory-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .inventory-risk-row {
          grid-template-columns:
            minmax(200px, 1fr)
            repeat(2, minmax(90px, 0.4fr));
        }

        .inventory-risk-row
          .inventory-value:nth-of-type(3),
        .inventory-risk-row
          .inventory-value:nth-of-type(4) {
          display: none;
        }
      }

      @media (max-width: 620px) {
        .inventory-metrics {
          grid-template-columns: 1fr;
        }

        .inventory-risk-row {
          grid-template-columns: 1fr 1fr;
        }

        .inventory-product {
          grid-column: 1 / -1;
        }

        .inventory-panel-header {
          flex-direction: column;
        }
      }
    `}</style>
  );
}

export default async function InventoryPage() {
  const [
    inventoryResponse,
    configurationResponse,
  ] = await Promise.all([
    supabase
      .from("vault_inventory_intelligence")
      .select(
        `
          product_id,
          product_name,
          stock_on_hand,
          committed_stock,
          incoming_stock,
          last_inventory_sync
        `,
      )
      .order("stock_on_hand", {
        ascending: true,
      }),

    supabase
      .from("vault_configuration_intelligence")
      .select(
        `
          product_id,
          inventory_strategy,
          configuration_state
        `,
      ),
  ]);

  const error =
    inventoryResponse.error ??
    configurationResponse.error;

  if (error) {
    return (
      <VaultAppShell
        searchPlaceholder="Search inventory..."
        systemStatusLabel="Inventory connection unavailable"
      >
        <article className="inventory-error-panel">
          <span className="vault-eyebrow">
            Inventory Intelligence
          </span>

          <h1>
            Inventory connection failed
          </h1>

          <pre>{error.message}</pre>
        </article>

        <MissionControlStyles />
        <InventoryPageStyles />
      </VaultAppShell>
    );
  }

  const configurationRows =
    (configurationResponse.data ??
      []) as InventoryConfigurationRow[];

  const configurationByProduct =
    new Map<
      string,
      InventoryConfigurationRow
    >(
      configurationRows.map(
        (row) => [
          row.product_id,
          row,
        ],
      ),
    );

  const inventory =
    (
      inventoryResponse.data ?? []
    ).map((record) => {
      const configuration =
        configurationByProduct.get(
          record.product_id,
        );

      return {
        ...record,
        inventory_strategy:
          configuration?.inventory_strategy ??
          "stocked",
        configuration_state:
          configuration?.configuration_state ??
          null,
      };
    }) as InventoryRecord[];

  const totalProducts =
    inventory.length;

  const monitoredInventory =
    inventory.filter(
      isMonitoredInventory,
    );

  const excludedFromRisk =
    inventory.filter(
      (record) =>
        !isMonitoredInventory(record),
    );

  const totalStockOnHand =
    monitoredInventory.reduce(
      (total, record) =>
        total +
        normaliseNumber(
          record.stock_on_hand,
        ),
      0,
    );

  const totalCommitted =
    monitoredInventory.reduce(
      (total, record) =>
        total +
        normaliseNumber(
          record.committed_stock,
        ),
      0,
    );

  const totalIncoming =
    monitoredInventory.reduce(
      (total, record) =>
        total +
        normaliseNumber(
          record.incoming_stock,
        ),
      0,
    );

  const negativeStock =
    monitoredInventory.filter(
      (record) =>
        getInventoryStatus(record) ===
        "negative",
    );

  const outOfStock =
    monitoredInventory.filter(
      (record) =>
        getInventoryStatus(record) ===
        "out",
    );

  const lowStock =
    monitoredInventory.filter(
      (record) =>
        getInventoryStatus(record) ===
        "low",
    );

  const healthScore =
    calculateHealthScore(inventory);

  const inventoryRisks =
    monitoredInventory
      .filter(isInventoryRisk)
      .sort(
        (a, b) =>
          getAvailableStock(a) -
          getAvailableStock(b),
      )
      .slice(0, 8);

  const latestSync =
    [...inventory]
      .filter(
        (record) =>
          record.last_inventory_sync,
      )
      .sort(
        (a, b) =>
          new Date(
            b.last_inventory_sync ?? 0,
          ).getTime() -
          new Date(
            a.last_inventory_sync ?? 0,
          ).getTime(),
      )[0]?.last_inventory_sync ?? null;

  return (
    <VaultAppShell
      searchPlaceholder="Search inventory..."
      notificationCount={
        negativeStock.length +
        outOfStock.length +
        lowStock.length
      }
      systemStatusLabel="Inventory connection healthy"
    >
      <div className="vault-content inventory-content">
          <header className="inventory-header">
            <div className="inventory-heading">
              <p className="vault-eyebrow">
                Live Operations
              </p>

              <h1>
                Inventory Intelligence
              </h1>

              <p>
                Live stock intelligence joined with Catalogue
                rules, so dropship, service, do-not-restock and
                discontinued products are handled correctly.
              </p>
            </div>

            <span className="inventory-sync-status">
              <i />
              Live inventory connected
            </span>
          </header>

          <section className="inventory-status-strip">
            <span>
              <i />
              Supabase connected
            </span>

            <span>
              <i />
              {monitoredInventory.length} stocked products monitored
            </span>

            <span>
              <i />
              Last sync: {formatDate(latestSync)}
            </span>

            <span>
              <i />
              Inventory intelligence online
            </span>
          </section>

          {inventory.length === 0 ? (
            <article className="vault-panel inventory-empty">
              <span className="vault-eyebrow">
                Inventory Intelligence
              </span>

              <h2>
                No inventory records found
              </h2>

              <p>
                Supabase returned no products from
                vault_inventory_intelligence.
              </p>
            </article>
          ) : (
            <>
              <section className="inventory-metrics">
                <InventoryMetric
                  icon="brain"
                  label="Health Score"
                  value={`${healthScore}%`}
                  supportingText={`${excludedFromRisk.length} products excluded by catalogue rules`}
                  tone={
                    healthScore >= 80
                      ? "positive"
                      : healthScore >= 55
                        ? "warning"
                        : "critical"
                  }
                />

                <InventoryMetric
                  icon="catalogue"
                  label="Products"
                  value={totalProducts}
                  supportingText={`${monitoredInventory.length} actively monitored`}
                />

                <InventoryMetric
                  icon="inventory"
                  label="Units on hand"
                  value={totalStockOnHand}
                  supportingText="Monitored stocked products only"
                />

                <InventoryMetric
                  icon="shield"
                  label="Low or unavailable"
                  value={
                    negativeStock.length +
                    outOfStock.length +
                    lowStock.length
                  }
                  supportingText="Products requiring attention"
                  tone={
                    negativeStock.length +
                      outOfStock.length >
                    0
                      ? "critical"
                      : lowStock.length > 0
                        ? "warning"
                        : "positive"
                  }
                />

                <InventoryMetric
                  icon="trend"
                  label="Incoming"
                  value={totalIncoming}
                  supportingText={`${totalCommitted} units committed`}
                  tone={
                    totalIncoming > 0
                      ? "positive"
                      : "default"
                  }
                />
              </section>

              <section className="vault-panel inventory-risk-panel">
                <div className="inventory-panel-header">
                  <div>
                    <span className="vault-eyebrow">
                      Inventory Risk Radar
                    </span>

                    <h2>
                      Products requiring attention
                    </h2>

                    <p>
                      Only actively stocked products are assessed.
                      Dropship, service, do-not-restock and discontinued
                      items are excluded from alerts and health scoring.
                    </p>
                  </div>

                  <span className="inventory-risk-count">
                    {inventoryRisks.length} surfaced risks
                  </span>
                </div>

                <div className="inventory-risk-list">
                  {inventoryRisks.length > 0 ? (
                    inventoryRisks.map((record) => {
                      const status =
                        getInventoryStatus(record);

                      return (
                        <article
                          className="inventory-risk-row"
                          key={record.product_id}
                        >
                          <div className="inventory-product">
                            <strong>
                              {record.product_name ??
                                "Unnamed product"}
                            </strong>

                            <span>
                              {record.product_id}
                            </span>
                          </div>

                          <div className="inventory-value">
                            <span>
                              On hand
                            </span>

                            <strong>
                              {normaliseNumber(
                                record.stock_on_hand,
                              )}
                            </strong>
                          </div>

                          <div className="inventory-value">
                            <span>
                              Available
                            </span>

                            <strong>
                              {getAvailableStock(record)}
                            </strong>
                          </div>

                          <div className="inventory-value">
                            <span>
                              Committed
                            </span>

                            <strong>
                              {normaliseNumber(
                                record.committed_stock,
                              )}
                            </strong>
                          </div>

                          <div className="inventory-value">
                            <span>
                              Incoming
                            </span>

                            <strong>
                              {normaliseNumber(
                                record.incoming_stock,
                              )}
                            </strong>
                          </div>

                          <span
                            className={`inventory-status ${getStatusClass(
                              status,
                            )}`}
                          >
                            {getStatusLabel(status)}
                          </span>
                        </article>
                      );
                    })
                  ) : (
                    <article className="inventory-empty">
                      <span className="vault-eyebrow">
                        Inventory health
                      </span>

                      <h2>
                        No immediate stock risks
                      </h2>

                      <p>
                        Every available product is currently
                        above the low-stock threshold.
                      </p>
                    </article>
                  )}
                </div>
              </section>

              <section className="vault-panel inventory-table-panel">
                <div className="inventory-panel-header">
                  <div>
                    <span className="vault-eyebrow">
                      Live Inventory
                    </span>

                    <h2>
                      Complete stock position
                    </h2>

                    <p>
                      All inventory records with their Catalogue
                      strategy applied. Excluded products remain visible
                      but do not create stock alerts.
                    </p>
                  </div>

                  <span className="inventory-sync-status">
                    <i />
                    {totalProducts} records
                  </span>
                </div>

                <div className="inventory-table-wrapper">
                  <table className="inventory-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Status</th>
                        <th>On hand</th>
                        <th>Committed</th>
                        <th>Available</th>
                        <th>Incoming</th>
                        <th>Last sync</th>
                      </tr>
                    </thead>

                    <tbody>
                      {inventory.map((record) => {
                        const status =
                          getInventoryStatus(record);

                        return (
                          <tr key={record.product_id}>
                            <td>
                              <div className="inventory-table-product">
                                <strong>
                                  {record.product_name ??
                                    "Unnamed product"}
                                </strong>

                                <span>
                                  {record.product_id}
                                </span>
                              </div>
                            </td>

                            <td>
                              <span
                                className={`inventory-status ${getStatusClass(
                                  status,
                                )}`}
                              >
                                {getStatusLabel(status)}
                              </span>
                            </td>

                            <td>
                              {normaliseNumber(
                                record.stock_on_hand,
                              )}
                            </td>

                            <td>
                              {normaliseNumber(
                                record.committed_stock,
                              )}
                            </td>

                            <td>
                              {getAvailableStock(record)}
                            </td>

                            <td>
                              {normaliseNumber(
                                record.incoming_stock,
                              )}
                            </td>

                            <td>
                              {formatDate(
                                record.last_inventory_sync,
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
      </div>

      <MissionControlStyles />
      <InventoryPageStyles />
    </VaultAppShell>
  );
}