import Link from "next/link";

import type {
  CommercialDecisionTimelineItem,
  CommercialDecisionTimelineResult,
} from "@/lib/brain/CommercialDecisionTimeline";

function TimelineItem({ item }: { item: CommercialDecisionTimelineItem }) {
  return (
    <article className={`decision-timeline-item is-${item.status}`}>
      <div className="decision-timeline-item-copy">
        <span>{item.priority}</span>
        <h3>{item.title}</h3>
        {item.description ? <p>{item.description}</p> : null}
        {item.evidence.length > 0 ? (
          <dl>
            {item.evidence.slice(0, 2).map((entry) => (
              <div key={`${item.id}-${entry.label}`}>
                <dt>{entry.label}</dt>
                <dd>{entry.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
      {item.destination ? <Link href={item.destination}>Review →</Link> : null}
    </article>
  );
}

export function CommercialDecisionTimeline({
  timeline,
}: {
  timeline: CommercialDecisionTimelineResult | null;
}) {
  if (!timeline) {
    return (
      <section className="vault-panel decision-timeline">
        <div className="vault-panel-heading">
          <div>
            <span className="vault-eyebrow">Decision Timeline</span>
            <h2>Commercial decisions unavailable</h2>
          </div>
        </div>
        <p>Canonical decision evidence could not be loaded.</p>
      </section>
    );
  }

  return (
    <section className="vault-panel decision-timeline">
      <div className="vault-panel-heading">
        <div>
          <span className="vault-eyebrow">Decision Timeline</span>
          <h2>What needs attention now</h2>
        </div>
        <Link href="/advisor">Open Advisor →</Link>
      </div>

      {timeline.groups.map((group) => (
        <section className="decision-timeline-group" key={group.label}>
          <h3>{group.label}</h3>
          <div>
            {group.items.map((item) => <TimelineItem item={item} key={item.id} />)}
          </div>
        </section>
      ))}
    </section>
  );
}
