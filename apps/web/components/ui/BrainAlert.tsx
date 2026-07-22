import type { ReactNode } from "react";

type BrainAlertProps = {
  title: string;
  children: ReactNode;
  tone?: "info" | "success" | "warning" | "danger";
};

export function BrainAlert({
  title,
  children,
  tone = "info",
}: BrainAlertProps) {
  return (
    <article
      className={`brain-alert brain-alert-${tone}`}
    >
      <div className="brain-alert-indicator" />

      <div className="brain-alert-content">
        <h3>{title}</h3>

        <div className="brain-alert-message">
          {children}
        </div>
      </div>
    </article>
  );
}