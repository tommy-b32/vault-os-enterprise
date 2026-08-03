import type {
  BrainSignal,
} from "@/lib/brain/BrainSignalsEngine";

export type BrainReasoningStep = {
  id: string;

  status:
    | "complete"
    | "active";

  text: string;
};

function buildTypeStep(
  signal: BrainSignal,
): BrainReasoningStep {
  switch (signal.type) {
    case "inventory":
      return {
        id: "inventory",
        status: "complete",
        text:
          "Analysed current inventory exposure",
      };

    case "supplier":
      return {
        id: "supplier-intelligence",
        status: "complete",
        text:
          "Checked supplier performance and lead time",
      };

    case "margin":
      return {
        id: "margin",
        status: "complete",
        text:
          "Reviewed margin and profit opportunity",
      };

    case "sales":
      return {
        id: "sales",
        status: "complete",
        text:
          "Compared recent sales performance",
      };

    case "buying":
      return {
        id: "buying",
        status: "complete",
        text:
          "Reviewed buying and replenishment data",
      };

    case "system":
      return {
        id: "system",
        status: "complete",
        text:
          "Checked Vault OS system intelligence",
      };
  }
}

export const BrainReasoningEngine = {
  build(
    signal: BrainSignal,
  ): BrainReasoningStep[] {
    const steps:
      BrainReasoningStep[] = [];

    steps.push(
      buildTypeStep(signal),
    );

    if (signal.supplierName) {
      steps.push({
        id: "supplier",

        status: "complete",

        text:
          `Compared supplier intelligence (${signal.supplierName})`,
      });
    }

    if (signal.productName) {
      steps.push({
        id: "product",

        status: "complete",

        text:
          `Reviewed ${signal.productName}`,
      });
    }

    steps.push({
      id: "confidence",

      status: "complete",

      text:
        `Confidence reached ${signal.confidence}%`,
    });

    steps.push({
      id: "recommendation",

      status: "active",

      text:
        "Preparing recommendation…",
    });

    return steps;
  },
} as const;