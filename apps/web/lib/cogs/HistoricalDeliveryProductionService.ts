import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { SupabaseHistoricalDeliveryRepository } from "./HistoricalDeliveryRepository.ts";
import { HistoricalDeliveryService } from "./HistoricalDeliveryService.ts";

/** Explicit production composition; unit tests must inject their own repository. */
export const createProductionHistoricalDeliveryService = (classes: ReadonlySet<string>) =>
  new HistoricalDeliveryService(classes, new SupabaseHistoricalDeliveryRepository(supabaseAdmin));
