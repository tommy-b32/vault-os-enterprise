type VaultBrainBriefingCardProps = {
  greeting: string;
  businessHealth: number;

  mission: string;

  highestPriority: {
    title: string;
    description: string;
    confidence: number;
    expectedProfit: string;
  };

  actions: string[];
};

export function VaultBrainBriefingCard({
  greeting,
  businessHealth,
  mission,
  highestPriority,
  actions,
}: VaultBrainBriefingCardProps) {
  return (
    <section className="vault-brain-briefing">
      <header>
        <span className="vault-eyebrow">
          🧠 Vault Brain
        </span>

        <h2>{greeting}</h2>

        <p>{mission}</p>
      </header>

      <div className="vault-brain-health">
        <span>Business Health</span>

        <strong>{businessHealth}%</strong>
      </div>

      <article className="vault-brain-priority">
        <span>Highest Priority</span>

        <h3>{highestPriority.title}</h3>

        <p>{highestPriority.description}</p>

        <footer>
          <strong>
            Expected Profit {highestPriority.expectedProfit}
          </strong>

          <span>
            {highestPriority.confidence}% confidence
          </span>
        </footer>
      </article>

      <div className="vault-brain-actions">
        <span>Today's Actions</span>

        <ul>
          {actions.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}