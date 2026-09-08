// ---------------------------------------------------------------------------
// MVP nationwide county roster for the RealeFlow sweep.
//
// Territory verified live on account 192423 (scripts/realeflow-state-probe.mjs,
// 2026-09-02): TX/GA/CA/NC/AZ/OH all returned rows incl. premium
// pre_foreclosure. The roster is deliberately METRO-WEIGHTED (~135 counties)
// so the 30-min tick cadence (~48 counties/day) keeps every county on a
// ~2-3 day refresh — full statewide expansion waits for the dedicated worker.
//
// Ordering IS the priority: the sweep cursor walks this list in order, so the
// operator-designated priority counties (Hillsborough, Pasco, Pinellas) sit
// first and are refreshed at the top of every cycle.
//
// FIPS are static census codes; county names are ambiguous across states
// (Orange FL vs Orange CA, Forsyth GA vs NC…), so every entry carries its
// state and consumers must key on state+county or fips, never name alone.
// ---------------------------------------------------------------------------

import { FL_COUNTY_FIPS } from "./fl-counties";

export type RosterEntry = {
  state: string;
  county: string;
  fips: string;
};

/** Operator-designated highest-priority counties — refreshed first each cycle. */
export const PRIORITY_COUNTIES: readonly RosterEntry[] = [
  { state: "FL", county: "Hillsborough", fips: "12057" },
  { state: "FL", county: "Pasco", fips: "12101" },
  { state: "FL", county: "Pinellas", fips: "12103" },
];

/** Metro counties per expansion state (investor-demand weighted). */
const TX: readonly RosterEntry[] = [
  { state: "TX", county: "Harris", fips: "48201" },
  { state: "TX", county: "Dallas", fips: "48113" },
  { state: "TX", county: "Tarrant", fips: "48439" },
  { state: "TX", county: "Bexar", fips: "48029" },
  { state: "TX", county: "Travis", fips: "48453" },
  { state: "TX", county: "Collin", fips: "48085" },
  { state: "TX", county: "Denton", fips: "48121" },
  { state: "TX", county: "Fort Bend", fips: "48157" },
  { state: "TX", county: "Montgomery", fips: "48339" },
  { state: "TX", county: "Williamson", fips: "48491" },
  { state: "TX", county: "Hidalgo", fips: "48215" },
  { state: "TX", county: "El Paso", fips: "48141" },
  { state: "TX", county: "Galveston", fips: "48167" },
  { state: "TX", county: "Brazoria", fips: "48039" },
  { state: "TX", county: "Hays", fips: "48209" },
  { state: "TX", county: "Nueces", fips: "48355" },
  { state: "TX", county: "Bell", fips: "48027" },
  { state: "TX", county: "Lubbock", fips: "48303" },
];

const GA: readonly RosterEntry[] = [
  { state: "GA", county: "Fulton", fips: "13121" },
  { state: "GA", county: "Gwinnett", fips: "13135" },
  { state: "GA", county: "Cobb", fips: "13067" },
  { state: "GA", county: "DeKalb", fips: "13089" },
  { state: "GA", county: "Clayton", fips: "13063" },
  { state: "GA", county: "Cherokee", fips: "13057" },
  { state: "GA", county: "Forsyth", fips: "13117" },
  { state: "GA", county: "Henry", fips: "13151" },
  { state: "GA", county: "Paulding", fips: "13223" },
  { state: "GA", county: "Douglas", fips: "13097" },
  { state: "GA", county: "Chatham", fips: "13051" },
  { state: "GA", county: "Richmond", fips: "13245" },
  { state: "GA", county: "Hall", fips: "13139" },
  { state: "GA", county: "Clarke", fips: "13059" },
];

const CA: readonly RosterEntry[] = [
  { state: "CA", county: "Los Angeles", fips: "06037" },
  { state: "CA", county: "San Diego", fips: "06073" },
  { state: "CA", county: "Orange", fips: "06059" },
  { state: "CA", county: "Riverside", fips: "06065" },
  { state: "CA", county: "San Bernardino", fips: "06071" },
  { state: "CA", county: "Sacramento", fips: "06067" },
  { state: "CA", county: "Santa Clara", fips: "06085" },
  { state: "CA", county: "Alameda", fips: "06001" },
  { state: "CA", county: "Contra Costa", fips: "06013" },
  { state: "CA", county: "Fresno", fips: "06019" },
  { state: "CA", county: "Kern", fips: "06029" },
  { state: "CA", county: "San Joaquin", fips: "06077" },
];

const NC: readonly RosterEntry[] = [
  { state: "NC", county: "Mecklenburg", fips: "37119" },
  { state: "NC", county: "Wake", fips: "37183" },
  { state: "NC", county: "Guilford", fips: "37081" },
  { state: "NC", county: "Forsyth", fips: "37067" },
  { state: "NC", county: "Durham", fips: "37063" },
  { state: "NC", county: "Cumberland", fips: "37051" },
  { state: "NC", county: "Union", fips: "37179" },
  { state: "NC", county: "Gaston", fips: "37071" },
  { state: "NC", county: "New Hanover", fips: "37129" },
  { state: "NC", county: "Buncombe", fips: "37021" },
];

const AZ: readonly RosterEntry[] = [
  { state: "AZ", county: "Maricopa", fips: "04013" },
  { state: "AZ", county: "Pima", fips: "04019" },
  { state: "AZ", county: "Pinal", fips: "04021" },
  { state: "AZ", county: "Yavapai", fips: "04025" },
  { state: "AZ", county: "Mohave", fips: "04015" },
];

const OH: readonly RosterEntry[] = [
  { state: "OH", county: "Franklin", fips: "39049" },
  { state: "OH", county: "Cuyahoga", fips: "39035" },
  { state: "OH", county: "Hamilton", fips: "39061" },
  { state: "OH", county: "Summit", fips: "39153" },
  { state: "OH", county: "Montgomery", fips: "39113" },
  { state: "OH", county: "Lucas", fips: "39095" },
  { state: "OH", county: "Butler", fips: "39017" },
  { state: "OH", county: "Stark", fips: "39151" },
];

/** FL statewide (67), priority trio first, remainder in stable name order. */
const priorityFips = new Set(PRIORITY_COUNTIES.map((c) => c.fips));
const FL_REST: readonly RosterEntry[] = Object.entries(FL_COUNTY_FIPS)
  .filter(([, fips]) => !priorityFips.has(fips))
  .map(([county, fips]) => ({ state: "FL", county, fips }));

/**
 * The full MVP roster the sweep cursor walks, in refresh-priority order:
 * priority trio → rest of FL statewide → expansion-state metros.
 */
export const MVP_COUNTY_ROSTER: readonly RosterEntry[] = [
  ...PRIORITY_COUNTIES,
  ...FL_REST,
  ...TX,
  ...GA,
  ...CA,
  ...NC,
  ...AZ,
  ...OH,
];

/**
 * Resolve an explicit county request (manual refresh / demo) to roster
 * entries. Accepts "Hillsborough", "Hillsborough, FL" or "hillsborough".
 * Bare names prefer FL (every pre-roster caller assumed FL) and otherwise
 * take the first roster match in priority order.
 */
export function rosterEntriesFor(names: readonly string[]): RosterEntry[] {
  const out: RosterEntry[] = [];
  for (const raw of names) {
    const m = /^\s*(.+?)\s*(?:,\s*([A-Za-z]{2}))?\s*$/.exec(raw ?? "");
    if (!m) continue;
    const name = (m[1] ?? "").toLowerCase();
    const state = m[2]?.toUpperCase();
    const candidates = MVP_COUNTY_ROSTER.filter((e) => e.county.toLowerCase() === name);
    const hit = state
      ? candidates.find((e) => e.state === state)
      : (candidates.find((e) => e.state === "FL") ?? candidates[0]);
    if (hit && !out.some((e) => e.fips === hit.fips)) out.push(hit);
  }
  return out;
}
