import { BriefingEngine } from "@/lib/brain/BriefingEngine";
import { CapitalEngine } from "@/lib/brain/CapitalEngine";
import { CommercialEngine } from "@/lib/brain/CommercialEngine";
import { OpportunityEngine } from "@/lib/brain/OpportunityEngine";
import { RecommendationEngine } from "@/lib/brain/RecommendationEngine";

export const VaultBrain = {
  commercial: CommercialEngine,
  capital: CapitalEngine,
  recommendation: RecommendationEngine,
  briefing: BriefingEngine,
  opportunity: OpportunityEngine,
} as const;