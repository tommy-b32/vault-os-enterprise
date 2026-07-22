import type { ReactNode } from "react";

type BrainCardProps = {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
};

export function BrainCard({
  title,
  subtitle,
  children,
  className = "",
}: BrainCardProps) {
  return (
    <section className={`brain-card ${className}`}>
      {(title || subtitle) && (
        <header className="brain-card-header">
          {subtitle && (
            <p className="brain-card-subtitle">
              {subtitle}
            </p>
          )}

          {title && (
            <h2 className="brain-card-title">
              {title}
            </h2>
          )}
        </header>
      )}

      <div className="brain-card-content">
        {children}
      </div>
    </section>
  );
}