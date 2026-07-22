import {
  CommercialOpportunityEngine,
} from "@/lib/brain/CommercialOpportunityEngine";

import type {
  Opportunity,
} from "@/lib/brain/OpportunityEngine";

import type {
  CommercialOpportunityInput,
} from "@/lib/brain/CommercialOpportunityEngine";

export type OpportunityCollectorInput = {
  commercial?: CommercialOpportunityInput[];
};

export function collectOpportunities({
  commercial = [],
}: OpportunityCollectorInput) {
  const opportunities: Opportunity[] = [];

  commercial.forEach((product) => {
    const opportunity =
      CommercialOpportunityEngine.create(
        product,
      );

    if (opportunity) {
      opportunities.push(opportunity);
    }
  });

  return opportunities;
}

export const OpportunityCollector = {
  collect: collectOpportunities,
};