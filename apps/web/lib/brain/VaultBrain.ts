import { CapitalEngine } from "@/lib/brain/CapitalEngine";
import { CommercialEngine } from "@/lib/brain/CommercialEngine";
import { RecommendationEngine } from "@/lib/brain/RecommendationEngine";

export const VaultBrain = {
  commercial: CommercialEngine,
  capital: CapitalEngine,
  recommendation: RecommendationEngine,
} as const;