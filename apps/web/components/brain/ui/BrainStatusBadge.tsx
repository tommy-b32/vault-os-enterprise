export type BrainStatusState =
  | "approved"
  | "review"
  | "rejected"
  | "waiting"
  | "analysing";

type BrainStatusBadgeProps = {
  state: BrainStatusState;
  label: string;
};

export function BrainStatusBadge({
  state,
  label,
}: BrainStatusBadgeProps) {
  return (
    <span
      className={`brain-status-badge brain-status-${state}`}
    >
      <span
        aria-hidden="true"
        className="brain-status-dot"
      />

      {label}
    </span>
  );
}