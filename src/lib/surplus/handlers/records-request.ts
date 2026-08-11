/**
 * records_request — the long tail. Counties with no portal at all.
 *
 * There is no scrape here. The county is routed through the existing public
 * records request engine, which already owns the cadence and the
 * requested → sent → received → parsing → needs_mapping lifecycle, and which
 * throttles to one request per agency per cycle (not one per user).
 *
 * This handler therefore produces no rows: it ensures a request is scheduled
 * and reports that the county is handled out of band.
 */

import { emptyResult, type HandlerContext, type HandlerResult } from "./types";

export async function runRecordsRequest(ctx: HandlerContext): Promise<HandlerResult> {
  const { source } = ctx;
  const cadence =
    source.refresh_cadence === "daily" ? "weekly" : source.refresh_cadence; // no daily FOIA requests

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: agency } = await supabaseAdmin
    .from("agency_contacts")
    .select("id")
    .eq("state", source.state)
    .ilike("county_name", source.county_name)
    .limit(1)
    .maybeSingle();

  if (!agency?.id) {
    const result = emptyResult(
      `No records-request contact on file for ${source.county_name} County, ${source.state}`,
    );
    return { ...result, deferred: true };
  }

  const { composeAndSchedule } = await import("../../records-requests.server");
  await composeAndSchedule(agency.id as string, {
    recordTypes: ["surplus_funds"],
    cadence: cadence as "weekly" | "biweekly" | "monthly" | "quarterly",
  });

  const result = emptyResult(
    `Handled by public records request (${cadence}); rows arrive through the request pipeline`,
  );
  return { ...result, deferred: true };
}
