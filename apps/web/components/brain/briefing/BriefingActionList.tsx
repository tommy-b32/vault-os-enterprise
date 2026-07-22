import type {
  BriefingAction,
} from "@/lib/brain/BriefingEngine";

type BriefingActionListProps = {
  actions: BriefingAction[];
};

function getPriorityLabel(
  priority: BriefingAction["priority"],
): string {
  if (priority === "critical") {
    return "Critical";
  }

  if (priority === "high") {
    return "High";
  }

  if (priority === "medium") {
    return "Medium";
  }

  return "Low";
}

export function BriefingActionList({
  actions,
}: BriefingActionListProps) {
  if (actions.length === 0) {
    return (
      <div className="briefing-actions-empty">
        <strong>No urgent actions</strong>

        <p>
          Vault Brain has not identified any immediate
          priorities.
        </p>
      </div>
    );
  }

  return (
    <div className="briefing-action-list">
      {actions.map((action, index) => (
        <article
          className={`briefing-action-item priority-${action.priority}`}
          key={action.id}
        >
          <div className="briefing-action-rank">
            {index + 1}
          </div>

          <div className="briefing-action-content">
            <div className="briefing-action-heading">
              <strong>{action.title}</strong>

              <span>
                {getPriorityLabel(action.priority)}
              </span>
            </div>

            <p>{action.description}</p>

            <div className="briefing-action-confidence">
              <span>Confidence</span>
              <strong>{action.confidence}%</strong>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}