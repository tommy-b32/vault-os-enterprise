export type DailyBriefItem = {
  id: string;
  title: string;
  message: string;
  priority: "info" | "warning" | "success";
};

export type DailyBrief = {
  greeting: string;
  summary: string;
  items: DailyBriefItem[];
};

export const DailyBriefEngine = {
  generate(): DailyBrief {
    const hour = new Date().getHours();

    const greeting =
      hour < 12
        ? "Good morning"
        : hour < 18
          ? "Good afternoon"
          : "Good evening";

    return {
      greeting,

      summary:
        "Vault Brain has reviewed your latest activity and prepared today's operational briefing.",

      items: [
        {
          id: "brain-status",
          title: "Vault Brain",
          message:
            "Learning system online and analysing catalogue decisions.",
          priority: "success",
        },
        {
          id: "buying",
          title: "Buying Intelligence",
          message:
            "No buying risks detected at the moment.",
          priority: "info",
        },
        {
          id: "suppliers",
          title: "Supplier Intelligence",
          message:
            "No supplier alerts require attention.",
          priority: "info",
        },
      ],
    };
  },
} as const;