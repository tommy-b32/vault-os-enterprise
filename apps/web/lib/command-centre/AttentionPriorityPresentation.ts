import type { CockpitAttentionItem } from "./CommandCentreCockpit";

export type AttentionPriorityPresentation = {
  className: string;
  label: string;
  accessibilityLabel: string;
};

const PRESENTATION_BY_PRIORITY: Record<
  CockpitAttentionItem["priority"],
  AttentionPriorityPresentation
> = {
  critical: { className: "is-critical", label: "CRITICAL", accessibilityLabel: "Severity: Critical" },
  high: { className: "is-high", label: "HIGH", accessibilityLabel: "Severity: High" },
  medium: { className: "is-medium", label: "MEDIUM", accessibilityLabel: "Severity: Medium" },
  low: { className: "is-low", label: "LOW", accessibilityLabel: "Severity: Low" },
  informational: {
    className: "is-informational",
    label: "INFORMATIONAL",
    accessibilityLabel: "Severity: Informational",
  },
};

const UNAVAILABLE_PRESENTATION: AttentionPriorityPresentation = {
  className: "is-unavailable",
  label: "UNAVAILABLE",
  accessibilityLabel: "Severity: Unavailable",
};

export function getAttentionPriorityPresentation(
  priority: CockpitAttentionItem["priority"] | string,
): AttentionPriorityPresentation {
  return PRESENTATION_BY_PRIORITY[priority as CockpitAttentionItem["priority"]]
    ?? UNAVAILABLE_PRESENTATION;
}
