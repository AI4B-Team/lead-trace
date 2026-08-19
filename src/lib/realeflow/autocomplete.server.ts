import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { RealeflowError, rfAutocomplete } from "@/lib/realeflow/client.server";
import type { AutocompleteResult } from "@/lib/realeflow/types";
import { FL_COUNTY_FIPS } from "@/lib/fl-counties";

function isBotProtectionError(error: unknown): boolean {
  return (
    error instanceof RealeflowError &&
    (error.status === 403 || /bot protection/i.test(error.message))
  );
}

function escapeLike(value: string): string {
  return value.replaceAll("%", "\\%").replaceAll("_", "\\_");
}

/**
 * Prefer Realeflow's full location index. If its edge protection rejects the
 * request, keep county search usable from LeadTrace's authenticated coverage
 * reference instead of propagating a server-function exception to the UI.
 */
export async function resilientRfAutocomplete(
  db: SupabaseClient<Database>,
  query: string,
): Promise<AutocompleteResult[]> {
  try {
    return await rfAutocomplete(query);
  } catch (error) {
    if (!isBotProtectionError(error)) throw error;

    const [countyPart, statePart] = query.split(",", 2).map((part) => part.trim());
    const countyTerm = (countyPart ?? query).replace(/\s+county$/i, "").trim();
    if (countyTerm.length < 2) return [];

    let lookup = db
      .from("county_coverage")
      .select("county_name, state, fips")
      .not("fips", "is", null)
      .ilike("county_name", `%${escapeLike(countyTerm)}%`)
      .order("county_name")
      .limit(8);

    if (statePart && /^[a-z]{2}$/i.test(statePart)) {
      lookup = lookup.eq("state", statePart.toUpperCase());
    }

    const { data, error: lookupError } = await lookup;
    const databaseRows = lookupError ? [] : (data ?? []);
    const localFloridaRows = Object.entries(FL_COUNTY_FIPS)
      .filter(([county]) => county.toLowerCase().includes(countyTerm.toLowerCase()))
      .map(([county_name, fips]) => ({ county_name, state: "FL", fips }));
    const rows = databaseRows.length > 0 ? databaseRows : localFloridaRows;

    const seen = new Set<string>();
    return rows.flatMap((row) => {
      if (!row.fips || seen.has(row.fips)) return [];
      seen.add(row.fips);
      return [
        {
          type: "county" as const,
          text: `${row.county_name} County, ${row.state}`,
          county: {
            county: row.county_name,
            city: "",
            state: row.state,
            fips: Number(row.fips),
            latitude: 0,
            longitude: 0,
          },
          location: { type: "Point" as const, coordinates: [0, 0] as [number, number] },
        },
      ];
    });
  }
}