import type { ReactNode } from "react";

type BrainPillProps = {
  children: ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
};

export function BrainPill({
  children,
  tone = "default",
}: BrainPillProps) {
  return (
    <span
      className={`brain-pill brain-pill-${tone}`}
    >
      {children}
    </span>
  );
}