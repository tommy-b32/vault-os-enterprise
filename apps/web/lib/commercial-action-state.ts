export type ProductCommercialActionState = {
  status: "idle" | "success" | "error";
  message: string;
  commercialState: "trusted" | "untrusted" | null;
  landedCostAvailable: boolean;
  grossProfitAvailable: boolean;
  marginAvailable: boolean;
  returnAvailable: boolean;
  missingRequirements: string[];
};

export const INITIAL_COMMERCIAL_ACTION_STATE:
  ProductCommercialActionState = {
    status: "idle",
    message: "",
    commercialState: null,
    landedCostAvailable: false,
    grossProfitAvailable: false,
    marginAvailable: false,
    returnAvailable: false,
    missingRequirements: [],
  };
