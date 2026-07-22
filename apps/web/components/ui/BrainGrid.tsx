import type { ReactNode } from "react";

type BrainGridProps = {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
};

export function BrainGrid({
  children,
  columns = 4,
  className = "",
}: BrainGridProps) {
  return (
    <div
      className={`brain-grid brain-grid-${columns} ${className}`}
    >
      {children}
    </div>
  );
}