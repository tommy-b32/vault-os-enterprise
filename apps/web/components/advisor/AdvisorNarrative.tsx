import type { Insight } from "@/lib/brain/InsightEngine";

type Props = {
  insights: Insight[];
};

export function AdvisorNarrative({
  insights,
}: Props) {
  return (
    <section className="advisor-narrative">
      <header>
        <p className="vault-eyebrow">
          Vault Brain
        </p>

        <h2>Commercial Briefing</h2>
      </header>

      <div className="advisor-insight-list">
        {insights.map((insight) => (
          <article
            key={insight.id}
            className={`advisor-insight advisor-insight-${insight.severity}`}
          >
            <h3>{insight.title}</h3>

            <p>{insight.message}</p>
          </article>
        ))}
      </div>
    </section>
  );
}