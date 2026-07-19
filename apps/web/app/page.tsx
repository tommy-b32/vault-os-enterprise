type IconName =
  | "home"
  | "inventory"
  | "catalogue"
  | "partners"
  | "orders"
  | "analytics"
  | "advisor"
  | "settings"
  | "search"
  | "bell"
  | "pound"
  | "cart"
  | "coins"
  | "chart"
  | "warning"
  | "truck"
  | "star"
  | "arrow"
  | "whatsapp";

type IconProps = {
  name: IconName;
  size?: number;
  strokeWidth?: number;
};

function Icon({
  name,
  size = 20,
  strokeWidth = 1.8,
}: IconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const paths: Record<IconName, React.ReactNode> = {
    home: (
      <>
        <path d="M3 11.5 12 4l9 7.5" />
        <path d="M5 10.5V20h14v-9.5" />
        <path d="M9.5 20v-6h5v6" />
      </>
    ),
    inventory: (
      <>
        <path d="M4 7h16v13H4z" />
        <path d="M7 4h10l2 3H5z" />
        <path d="M9 11h6" />
      </>
    ),
    catalogue: (
      <>
        <path d="M8 4 4 7v13h16V7l-4-3" />
        <path d="M8 4c0 2 1.8 3 4 3s4-1 4-3" />
        <path d="M8 12h8" />
      </>
    ),
    partners: (
      <>
        <circle cx="8" cy="8" r="3" />
        <circle cx="16" cy="8" r="3" />
        <path d="M3 20c.5-4 2.2-6 5-6s4.5 2 5 6" />
        <path d="M11 20c.5-4 2.2-6 5-6s4.5 2 5 6" />
      </>
    ),
    orders: (
      <>
        <path d="M6 5h12l1 15H5z" />
        <path d="M9 8V5a3 3 0 0 1 6 0v3" />
        <path d="M9 12h6" />
      </>
    ),
    analytics: (
      <>
        <path d="M4 20V10" />
        <path d="M9 20V5" />
        <path d="M14 20v-8" />
        <path d="M19 20V3" />
      </>
    ),
    advisor: (
      <>
        <path d="M9 3h6l1 3 3 1v5l-3 1-1 3H9l-1-3-3-1V7l3-1z" />
        <circle cx="12" cy="9.5" r="2.5" />
        <path d="M8.5 20c.7-3 2-4.5 3.5-4.5s2.8 1.5 3.5 4.5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19 12a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.5 1a7 7 0 0 0-1.8-1L14.2 3h-4.4l-.4 3a7 7 0 0 0-1.8 1l-2.5-1-2 3.4L5.1 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.5-1a7 7 0 0 0 1.8 1l.4 3h4.4l.4-3a7 7 0 0 0 1.8-1l2.5 1 2-3.4-2-1.6a7 7 0 0 0 .1-1Z" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </>
    ),
    pound: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M14.5 7.5a3 3 0 0 0-5 2v6" />
        <path d="M8 12h5" />
        <path d="M8 17h8" />
      </>
    ),
    cart: (
      <>
        <path d="M3 4h2l2 11h10l2-7H6" />
        <circle cx="9" cy="19" r="1" />
        <circle cx="17" cy="19" r="1" />
      </>
    ),
    coins: (
      <>
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
        <path d="M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
      </>
    ),
    chart: (
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="m7 15 4-4 3 2 5-7" />
      </>
    ),
    warning: (
      <>
        <path d="M12 3 2.5 20h19z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </>
    ),
    truck: (
      <>
        <path d="M3 6h11v10H3z" />
        <path d="M14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </>
    ),
    star: (
      <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9z" />
    ),
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m14 7 5 5-5 5" />
      </>
    ),
    whatsapp: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m7 20 1-3" />
        <path d="M9 8c1 4 3 6 7 7" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}

const navigation = [
  { label: "Command Centre", icon: "home", active: true },
  { label: "Inventory", icon: "inventory" },
  { label: "Catalogue", icon: "catalogue" },
  { label: "Partners", icon: "partners" },
  { label: "Orders", icon: "orders" },
  { label: "Analytics", icon: "analytics" },
  { label: "Advisor", icon: "advisor" },
  { label: "Settings", icon: "settings" },
] satisfies Array<{
  label: string;
  icon: IconName;
  active?: boolean;
}>;

const metrics = [
  {
    label: "Revenue Today",
    value: "£420",
    change: "18%",
    icon: "pound",
  },
  {
    label: "Orders Today",
    value: "7",
    change: "12%",
    icon: "cart",
  },
  {
    label: "Profit Today",
    value: "£218",
    change: "15%",
    icon: "coins",
  },
  {
    label: "ROAS (Meta)",
    value: "5.3",
    change: "24%",
    icon: "chart",
  },
] satisfies Array<{
  label: string;
  value: string;
  change: string;
  icon: IconName;
}>;

const recentOrders = [
  ["#1047", "Sarah", "£80.00", "Paid"],
  ["#1046", "Michael", "£120.00", "Paid"],
  ["#1045", "Brad", "£40.00", "Dispatched"],
  ["#1044", "Chris", "£80.00", "Processing"],
  ["#1043", "Adam", "£40.00", "Processing"],
];

const topProducts = [
  ["Moncler Black Badge Tee", "123 sold", "£40.00"],
  ["Dior Atelier Tee", "98 sold", "£40.00"],
  ["Amiri MA Core Logo Tee", "87 sold", "£40.00"],
  ["Balmain Paris Tee", "76 sold", "£40.00"],
];

export default function Home() {
  return (
    <main className="vault-shell">
      <aside className="vault-sidebar">
        <div className="vault-brand">
          <span className="vault-brand-mark">V</span>
          <span>VAULT OS</span>
        </div>

        <nav className="vault-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <button
              className={`vault-nav-item ${
                item.active ? "is-active" : ""
              }`}
              key={item.label}
              type="button"
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="vault-company">
          <div className="vault-company-mark">✦</div>
          <div>
            <strong>The Fabric Vault</strong>
            <span>Where Luxury Meets Affordability</span>
          </div>
        </div>
      </aside>

      <section className="vault-workspace">
        <header className="vault-topbar">
          <label className="vault-search">
            <Icon name="search" size={19} />
            <input
              aria-label="Search Vault OS"
              placeholder="Search anything..."
              type="search"
            />
            <kbd>⌘K</kbd>
          </label>

          <div className="vault-topbar-actions">
            <button
              aria-label="Notifications"
              className="vault-icon-button"
              type="button"
            >
              <Icon name="bell" />
              <span className="vault-notification-count">3</span>
            </button>

            <div className="vault-heartbeat" title="Vault systems healthy">
              <span />
            </div>

            <button className="vault-user" type="button">
              <span className="vault-avatar">T</span>
              <span>Tom</span>
              <span className="vault-user-arrow">⌄</span>
            </button>
          </div>
        </header>

        <div className="vault-content">
          <section className="vault-main-column">
            <div className="vault-page-heading">
              <p className="vault-eyebrow">Vault Command</p>
              <h1>Command Centre</h1>
              <p>Good morning Tom <span aria-hidden>👋</span></p>
            </div>

            <section className="vault-status-strip">
              <span><i /> Shopify connected</span>
              <span><i /> Inventory synced 2 min ago</span>
              <span><i /> Vault Brain online</span>
              <span><i /> 0 sync errors</span>
            </section>

            <section className="vault-metrics">
              {metrics.map((metric) => (
                <article className="vault-card vault-metric-card" key={metric.label}>
                  <div className="vault-metric-label">
                    <span className="vault-card-icon">
                      <Icon name={metric.icon} />
                    </span>
                    <span>{metric.label}</span>
                  </div>

                  <strong>{metric.value}</strong>

                  <p>
                    <span>▲ {metric.change}</span> vs yesterday
                  </p>
                </article>
              ))}
            </section>

            <section className="vault-panel vault-attention">
              <div className="vault-section-heading">
                <div>
                  <span className="vault-eyebrow">Attention Required</span>
                  <h2>Today&apos;s priorities</h2>
                </div>

                <button className="vault-text-button" type="button">
                  View all <Icon name="arrow" size={16} />
                </button>
              </div>

              <div className="vault-attention-grid">
                <article className="vault-action-card vault-action-card-primary">
                  <div className="vault-action-topline">
                    <span className="vault-badge">Exclusive</span>
                    <Icon name="warning" size={20} />
                  </div>

                  <h3>Moncler Black Badge</h3>
                  <p className="vault-action-title">Order 20 packs</p>
                  <p className="vault-muted">6 days of stock remaining</p>

                  <button className="vault-primary-button" type="button">
                    Generate WhatsApp
                    <Icon name="whatsapp" size={18} />
                  </button>
                </article>

                <article className="vault-action-card">
                  <span className="vault-card-kicker">Dropship partner</span>
                  <h3>Tony</h3>
                  <p className="vault-action-title">3 shoe orders</p>
                  <p className="vault-muted">Awaiting purchase</p>
                  <button className="vault-secondary-button" type="button">
                    View orders
                  </button>
                </article>

                <article className="vault-action-card">
                  <span className="vault-card-kicker">Shipment</span>
                  <div className="vault-inline-title">
                    <h3>UPS</h3>
                    <Icon name="truck" size={28} />
                  </div>
                  <p className="vault-action-title">Arrives tomorrow</p>
                  <p className="vault-muted">Expected at 12:10 PM</p>
                  <button className="vault-secondary-button" type="button">
                    Track shipment
                  </button>
                </article>

                <article className="vault-action-card">
                  <span className="vault-card-kicker">Trustpilot</span>
                  <h3>Excellent</h3>
                  <div className="vault-stars" aria-label="Five stars">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Icon key={index} name="star" size={22} />
                    ))}
                  </div>
                  <p className="vault-muted">New five-star review received</p>
                  <button className="vault-secondary-button" type="button">
                    View review
                  </button>
                </article>
              </div>
            </section>

            <section className="vault-lower-grid">
              <article className="vault-panel vault-sales-card">
                <div className="vault-section-heading">
                  <div>
                    <span className="vault-eyebrow">Sales Overview</span>
                    <h2>Last seven days</h2>
                  </div>
                  <button className="vault-filter-button" type="button">
                    7 Days⌄
                  </button>
                </div>

                <div className="vault-chart" aria-label="Placeholder sales chart">
                  <div className="vault-chart-grid" />
                  <svg
                    aria-hidden="true"
                    preserveAspectRatio="none"
                    viewBox="0 0 600 210"
                  >
                    <defs>
                      <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#d4a846" stopOpacity=".36" />
                        <stop offset="100%" stopColor="#d4a846" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M5 180 L55 150 L105 170 L155 115 L205 130 L255 90 L305 120 L355 75 L405 100 L455 70 L505 30 L555 45 L595 10 L595 210 L5 210 Z"
                      fill="url(#chartFill)"
                    />
                    <path
                      d="M5 180 L55 150 L105 170 L155 115 L205 130 L255 90 L305 120 L355 75 L405 100 L455 70 L505 30 L555 45 L595 10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                  </svg>

                  <div className="vault-chart-labels">
                    <span>11 Jul</span>
                    <span>12 Jul</span>
                    <span>13 Jul</span>
                    <span>14 Jul</span>
                    <span>15 Jul</span>
                    <span>16 Jul</span>
                    <span>17 Jul</span>
                  </div>
                </div>
              </article>

              <article className="vault-panel">
                <div className="vault-section-heading">
                  <div>
                    <span className="vault-eyebrow">Top Selling Products</span>
                    <h2>Product performance</h2>
                  </div>

                  <button className="vault-text-button" type="button">
                    View all <Icon name="arrow" size={16} />
                  </button>
                </div>

                <div className="vault-product-list">
                  {topProducts.map(([name, sold, price], index) => (
                    <div className="vault-product-row" key={name}>
                      <span className="vault-product-rank">{index + 1}</span>
                      <span className="vault-product-thumbnail">TFV</span>
                      <div>
                        <strong>{name}</strong>
                        <span>{sold}</span>
                      </div>
                      <b>{price}</b>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          </section>

          <aside className="vault-right-column">
            <article className="vault-panel vault-health-card">
              <span className="vault-eyebrow">Inventory Health</span>

              <div className="vault-health-content">
                <div className="vault-health-ring">
                  <div>
                    <strong>82%</strong>
                    <span>Healthy</span>
                  </div>
                </div>

                <div className="vault-health-legend">
                  <span><i className="healthy" /> Healthy <b>82%</b></span>
                  <span><i className="low" /> Low stock <b>12%</b></span>
                  <span><i className="out" /> Out of stock <b>6%</b></span>
                </div>
              </div>
            </article>

            <article className="vault-panel">
              <span className="vault-eyebrow">Cash Position</span>
              <strong className="vault-big-number">£12,540</strong>
              <p className="vault-muted">Available balance</p>

              <div className="vault-mini-chart">
                <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 220 90">
                  <path
                    d="M5 75 35 50 60 65 85 35 110 55 140 25 165 38 215 8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                </svg>
              </div>

              <button className="vault-secondary-button" type="button">
                View finance
              </button>
            </article>

            <article className="vault-panel">
              <div className="vault-section-heading compact">
                <span className="vault-eyebrow">Recent Orders</span>
                <button className="vault-text-button" type="button">
                  View all
                </button>
              </div>

              <div className="vault-orders-list">
                {recentOrders.map(([number, name, total, status]) => (
                  <div className="vault-order-row" key={number}>
                    <span>{number}</span>
                    <strong>{name}</strong>
                    <span>{total}</span>
                    <em className={`status-${status.toLowerCase()}`}>
                      {status}
                    </em>
                  </div>
                ))}
              </div>
            </article>

            <article className="vault-panel vault-advisor-card">
              <span className="vault-eyebrow">Vault Advisor</span>
              <div className="vault-advisor-icon">✦</div>
              <h3>3 recommendations ready</h3>
              <p>
                Inventory reorder, pricing opportunities and fulfilment actions
                are ready for review.
              </p>
              <button className="vault-primary-button" type="button">
                View Advisor
              </button>
            </article>
          </aside>
        </div>

        <footer className="vault-quick-actions">
          <span className="vault-eyebrow">Quick Actions</span>

          <div>
            <button type="button">＋ Add product</button>
            <button type="button">▣ Create order</button>
            <button type="button">◉ Message partner</button>
            <button type="button">▤ Generate report</button>
            <button type="button">⌁ View analytics</button>
          </div>
        </footer>
      </section>
    </main>
  );
}