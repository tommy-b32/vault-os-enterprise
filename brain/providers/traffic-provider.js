/**
 * ============================================================
 * VAULT OS
 * Traffic Provider
 * ============================================================
 *
 * Responsible for retrieving all traffic intelligence used
 * by Vault Command.
 */

export class TrafficProvider {

  constructor(supabase) {
    this.supabase = supabase;
  }

  /**
   * Returns today's traffic summary.
   */
  async getTodaySummary() {

    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await this.supabase
      .from("vault_traffic_daily")
      .select("*")
      .eq("traffic_date", today)
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

}