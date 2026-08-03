export type BrainSignalSeverity =
  | "info"
  | "success"
  | "warning"
  | "critical";

export type BrainSignalType =
  | "inventory"
  | "supplier"
  | "margin"
  | "sales"
  | "buying"
  | "system";

export type BrainSignal = {
  id: string;

  type: BrainSignalType;

  severity: BrainSignalSeverity;

  title: string;

  message: string;

  confidence: number;

  productId: string | null;

  productName: string | null;

  supplierId: string | null;

  supplierName: string | null;

  value: number | null;

  currency: string | null;

  actionHref: string | null;

  actionLabel: string | null;

  createdAt: string;
};

export type BrainSignalInput = {
  type: BrainSignalType;

  severity: BrainSignalSeverity;

  title: string;

  message: string;

  confidence: number;

  productId?: string | null;

  productName?: string | null;

  supplierId?: string | null;

  supplierName?: string | null;

  value?: number | null;

  currency?: string | null;

  actionHref?: string | null;

  actionLabel?: string | null;
};

function clampConfidence(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(value),
    ),
  );
}

export const BrainSignalsEngine = {
  createSignal(
    input: BrainSignalInput,
  ): BrainSignal {
    return {
      id:
        `${input.type}:${Date.now()}`,

      type:
        input.type,

      severity:
        input.severity,

      title:
        input.title,

      message:
        input.message,

      confidence:
        clampConfidence(
          input.confidence,
        ),

      productId:
        input.productId ?? null,

      productName:
        input.productName ?? null,

      supplierId:
        input.supplierId ?? null,

      supplierName:
        input.supplierName ?? null,

      value:
        input.value ?? null,

      currency:
        input.currency ?? null,

      actionHref:
        input.actionHref ?? null,

      actionLabel:
        input.actionLabel ?? null,

      createdAt:
        new Date().toISOString(),
    };
  },

  sortByPriority(
    signals: BrainSignal[],
  ): BrainSignal[] {
    const severityOrder:
      Record<
        BrainSignalSeverity,
        number
      > = {
        critical: 4,
        warning: 3,
        success: 2,
        info: 1,
      };

    return [...signals].sort(
      (a, b) => {
        const severityDifference =
          severityOrder[b.severity] -
          severityOrder[a.severity];

        if (
          severityDifference !== 0
        ) {
          return severityDifference;
        }

        return (
          new Date(
            b.createdAt,
          ).getTime() -
          new Date(
            a.createdAt,
          ).getTime()
        );
      },
    );
  },

  getHighestPriority(
    signals: BrainSignal[],
  ): BrainSignal | null {
    return (
      BrainSignalsEngine.sortByPriority(
        signals,
      )[0] ?? null
    );
  },
} as const;