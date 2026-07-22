type AdvisorStatProps = {
  label: string;
  value: number | string;
  highlight?: boolean;
};

export function AdvisorStat({
  label,
  value,
  highlight = false,
}: AdvisorStatProps) {
  return (
    <article
      className={`advisor-stat ${
        highlight
          ? "advisor-stat-highlight"
          : ""
      }`}
    >
      <span className="advisor-stat-label">
        {label}
      </span>

      <strong className="advisor-stat-value">
        {value}
      </strong>
    </article>
  );
}