"use client";

import VaultIcon, {
  type VaultIconName,
} from "@/components/brain/workspace/VaultIcon";

import type {
  BusinessActivityEvent,
  BusinessActivityResult,
} from "@/lib/business/BusinessActivityRepository";

type BusinessFeedProps = {
  activity: BusinessActivityResult;
  generatedAt: string;
};

function getLondonDate(value: string): {
  year: number;
  month: number;
  day: number;
  key: string;
} | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const parts = new Map(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date).map((part) => [part.type, part.value]),
  );
  const year = Number(parts.get("year"));
  const month = Number(parts.get("month"));
  const day = Number(parts.get("day"));

  return {
    year,
    month,
    day,
    key: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function formatRelativeTime(value: string, generatedAt: string): string {
  const eventTime = new Date(value);
  const currentTime = new Date(generatedAt);
  const eventDate = getLondonDate(value);
  const currentDate = getLondonDate(generatedAt);

  if (!eventDate || !currentDate) return "Time unavailable";

  const minutes = Math.max(
    0,
    Math.floor((currentTime.getTime() - eventTime.getTime()) / 60_000),
  );

  if (eventDate.key === currentDate.key) {
    if (minutes < 1) return "Just now";
    if (minutes === 1) return "1 min ago";
    if (minutes < 60) return `${minutes} mins ago`;
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }

  const yesterday = new Date(Date.UTC(
    currentDate.year,
    currentDate.month - 1,
    currentDate.day - 1,
  ));
  const yesterdayKey = [
    yesterday.getUTCFullYear(),
    String(yesterday.getUTCMonth() + 1).padStart(2, "0"),
    String(yesterday.getUTCDate()).padStart(2, "0"),
  ].join("-");
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(eventTime);

  if (eventDate.key === yesterdayKey) return `Yesterday at ${time}`;

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(eventTime);
}

function getPresentation(event: BusinessActivityEvent): {
  icon: VaultIconName;
  tone: "success" | "warning" | "neutral";
} {
  if (event.type === "shopify-order-created") {
    return { icon: "orders", tone: "success" };
  }

  if (event.type === "shopify-order-fulfilled") {
    return { icon: "inventory", tone: "success" };
  }

  if (event.type === "shopify-refund") {
    return { icon: "trend", tone: "warning" };
  }

  return { icon: "brain", tone: "neutral" };
}

export default function BusinessFeed({
  activity,
  generatedAt,
}: BusinessFeedProps) {
  const events = activity.data.slice(0, 8);

  return (
    <section className="vault-business-feed">
      <div className="vault-section-heading">
        <div>
          <span className="vault-eyebrow">Business Feed</span>
          <h2>Latest operational activity</h2>
        </div>
      </div>

      <article className="vault-panel">
        {activity.status === "error" ? (
          <div className="vault-business-feed-state is-error">
            <strong>Business activity unavailable</strong>
            <span>Vault OS could not load the activity feed.</span>
          </div>
        ) : events.length === 0 ? (
          <div className="vault-business-feed-state">
            <strong>No business activity recorded yet</strong>
            <span>
              New orders, fulfilments and refunds will appear here automatically.
            </span>
          </div>
        ) : (
          <div className="vault-business-feed-list">
            {events.map((event) => {
              const presentation = getPresentation(event);

              return (
                <article
                  className={`vault-business-feed-row is-${presentation.tone}`}
                  key={event.id}
                >
                  <span className="vault-business-feed-icon">
                    <VaultIcon name={presentation.icon} size={17} />
                  </span>
                  <div className="vault-business-feed-copy">
                    <strong>{event.title}</strong>
                    {event.description ? <p>{event.description}</p> : null}
                  </div>
                  <time dateTime={event.timestamp}>
                    {formatRelativeTime(event.timestamp, generatedAt)}
                  </time>
                </article>
              );
            })}
          </div>
        )}

        {activity.status === "stale" && events.length > 0 ? (
          <p className="vault-business-feed-freshness">
            Activity feed may be delayed
          </p>
        ) : null}
      </article>
    </section>
  );
}
