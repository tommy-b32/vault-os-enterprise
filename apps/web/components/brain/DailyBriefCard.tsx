"use client";

import {
  DailyBriefEngine,
} from "@/lib/brain/DailyBriefEngine";

export function DailyBriefCard() {
  const brief =
    DailyBriefEngine.generate();

  return (
    <section className="daily-brief-card">
      <header className="daily-brief-header">
        <div>
          <p className="vault-eyebrow">
            Daily Intelligence Brief
          </p>

          <h2>
            {brief.greeting}, Tom.
          </h2>

          <p>
            {brief.summary}
          </p>
        </div>
      </header>

      <div className="daily-brief-list">
        {brief.items.map((item) => (
          <article
            key={item.id}
            className={`daily-brief-item ${item.priority}`}
          >
            <strong>
              {item.title}
            </strong>

            <p>
              {item.message}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}