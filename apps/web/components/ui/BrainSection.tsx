import type { ReactNode } from "react";

type BrainSectionProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  children: ReactNode;
};

export function BrainSection({
  title,
  eyebrow,
  description,
  children,
}: BrainSectionProps) {
  return (
    <section className="brain-section">
      <header className="brain-section-header">
        {eyebrow && (
          <p className="brain-section-eyebrow">
            {eyebrow}
          </p>
        )}

        <h1>{title}</h1>

        {description && (
          <p className="brain-section-description">
            {description}
          </p>
        )}
      </header>

      {children}
    </section>
  );
}