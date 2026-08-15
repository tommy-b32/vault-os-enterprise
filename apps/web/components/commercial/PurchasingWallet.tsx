export type PurchasingWalletData = {
  ledger_balance_gbp: number;
  protected_reserve_gbp: number;
  committed_orders_gbp: number;
  calculated_purchasing_power_gbp: number;
  available_purchasing_power_gbp: number;
  manual_spending_limit_gbp: number | null;
  reserve_override_allowed: boolean;
  wallet_last_updated: string | null;
  wallet_freshness_threshold_minutes?: number | null;
  purchasing_power_state:
    | "healthy"
    | "limited"
    | "reserve_protected"
    | "no_cash";
};

type PurchasingWalletProps = {
  wallet: PurchasingWalletData;
};

const stateLabels = {
  healthy: "Healthy",
  limited: "Limited",
  reserve_protected: "Reserve protected",
  no_cash: "No purchasing power",
} as const;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(value);
}

export function PurchasingWallet({
  wallet,
}: PurchasingWalletProps) {
  const purchasingPower =
    wallet.available_purchasing_power_gbp;

  const balanceAfterCommitments =
    wallet.ledger_balance_gbp -
    wallet.committed_orders_gbp;

  const purchasingPercentage =
    wallet.ledger_balance_gbp > 0
      ? Math.max(
          0,
          Math.min(
            100,
            (purchasingPower /
              wallet.ledger_balance_gbp) *
              100,
          ),
        )
      : 0;

  return (
    <section className="commercial-card purchasing-wallet">
      <header className="commercial-card-header">
        <div>
          <p className="vault-eyebrow">
            Commercial Intelligence
          </p>

          <h2>Purchasing Wallet</h2>

          <p>
            The amount Vault Brain can safely invest in
            stock today.
          </p>
        </div>

        <span
          className={`purchasing-state state-${wallet.purchasing_power_state}`}
        >
          {stateLabels[wallet.purchasing_power_state]}
        </span>
      </header>

      <div className="purchasing-power-hero">
        <span>Available purchasing power</span>

        <strong>
          {formatCurrency(purchasingPower)}
        </strong>

        <div
          aria-label={`${purchasingPercentage.toFixed(
            1,
          )}% of cash available for purchasing`}
          className="purchasing-power-progress"
        >
          <span
            style={{
              width: `${purchasingPercentage}%`,
            }}
          />
        </div>
      </div>

      <div className="purchasing-wallet-grid">
        <article>
          <span>Ledger cash</span>
          <strong>
            {formatCurrency(
              wallet.ledger_balance_gbp,
            )}
          </strong>
        </article>

        <article>
          <span>Protected reserve</span>
          <strong>
            {formatCurrency(
              wallet.protected_reserve_gbp,
            )}
          </strong>
        </article>

        <article>
          <span>Committed orders</span>
          <strong>
            {formatCurrency(
              wallet.committed_orders_gbp,
            )}
          </strong>
        </article>

        <article>
          <span>Cash after commitments</span>
          <strong>
            {formatCurrency(
              balanceAfterCommitments,
            )}
          </strong>
        </article>
      </div>

      <div className="purchasing-wallet-guidance">
        <span>Vault Brain guidance</span>

        <strong>
          {wallet.purchasing_power_state === "healthy" &&
            "Purchasing power is available while the protected reserve remains intact."}

          {wallet.purchasing_power_state === "limited" &&
            "Purchasing power is limited. Prioritise only the strongest commercial opportunities."}

          {wallet.purchasing_power_state ===
            "reserve_protected" &&
            "No further stock purchasing is currently permitted without using the protected reserve."}

          {wallet.purchasing_power_state === "no_cash" &&
            "There is currently no available business cash for stock purchasing."}
        </strong>
      </div>
    </section>
  );
}
