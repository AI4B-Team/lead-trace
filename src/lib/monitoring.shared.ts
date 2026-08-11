import { recordTypeDisplayName } from "./record-types";
// Shared cadence helpers — imported by server functions and UI alike.

export const CADENCE_LABEL: Record<string, string> = {
  one_time: "One-Time",
  "12h": "Every 12 Hours",
  daily: "Daily",
  weekly: "Weekly",
};

/**
 * Display names for monitor record types. Record-type names live in one place
 * (public.record_types, mirrored by RECORD_TYPE_OPTIONS); the only entry kept
 * locally is "business", which is a source type rather than a record type.
 */
export function recordTypeLabelFor(slug: string): string {
  if (slug === "business") return "Business";
  return recordTypeDisplayName(slug);
}

export function nextRunFor(schedule: "12h" | "daily" | "weekly", from: Date): string {
  const hours = schedule === "12h" ? 12 : schedule === "daily" ? 24 : 24 * 7;
  return new Date(from.getTime() + hours * 3_600_000).toISOString();
}
