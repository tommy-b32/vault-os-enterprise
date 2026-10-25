import { OperatorAuthorizationError, requireOperatorRole } from "@/lib/auth/operators";
import { createHistoricalDeliveryHandler, createHistoricalDeliveryReadHandler } from "@/lib/cogs/HistoricalDeliveryHttp";
import { createProductionHistoricalDeliveryService } from "@/lib/cogs/HistoricalDeliveryProductionService";
import { supabaseAdmin } from "@/lib/supabase-admin";

const handler = createHistoricalDeliveryHandler({
  requireOperator: () => requireOperatorRole("owner", "operator"),
  isOperatorAuthorizationError: (error): error is OperatorAuthorizationError => error instanceof OperatorAuthorizationError,
  async loadClasses() {
    const { data, error } = await supabaseAdmin.from("vault_historical_merchandise_classes").select("id");
    if (error) throw error;
    return new Set((data ?? []).map((row) => row.id));
  },
  createService: createProductionHistoricalDeliveryService,
});

const readHandler = createHistoricalDeliveryReadHandler({
  requireOperator: () => requireOperatorRole("owner", "operator"),
  isOperatorAuthorizationError: (error): error is OperatorAuthorizationError => error instanceof OperatorAuthorizationError,
  async loadClasses() {
    const { data, error } = await supabaseAdmin.from("vault_historical_merchandise_classes").select("id");
    if (error) throw error;
    return new Set((data ?? []).map((row) => row.id));
  },
  createService: createProductionHistoricalDeliveryService,
});

export async function POST(request: Request) { return handler(request); }
export async function GET(request: Request) { return readHandler(request); }
