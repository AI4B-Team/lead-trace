/**
 * P5.8.7 — Multi-line correction (database half).
 *
 * One job: when a contact opts out on one line, suppress every other line we
 * hold for that same person, permanently, and leave an auditable trail of why
 * each number was added. Nothing here ever removes a suppression row.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { contactPhones, groupContacts, normalisePhone10, type ContactLine } from "./contact-lines.shared";
import { phoneVariants } from "./optout.server";

type Client = { from: (table: string) => any };

const LINE_LIMIT = 400;

const LEAD_COLS = "id, phone, full_name, address, zip, email";
const RECORD_COLS = "id, phone, full_name, address, zip, email";

export type ResolvedContact = {
  /** Every phone number held for this contact, in every stored spelling. */
  phones: string[];
  /** `leads` rows for the contact (the textable line rows). */
  leadIds: string[];
  /** Deduped `lead_records` rows for the contact. */
  recordIds: string[];
};

function asLines(rows: unknown, prefix: string): ContactLine[] {
  return ((rows ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: `${prefix}:${String(r["id"])}`,
    phone: (r["phone"] as string | null) ?? null,
    fullName: (r["full_name"] as string | null) ?? null,
    address: (r["address"] as string | null) ?? null,
    zip: (r["zip"] as string | null) ?? null,
    email: (r["email"] as string | null) ?? null,
  }));
}

/**
 * Finds every line belonging to the same contact as the seed lead/phone.
 * Two passes: seed the identity from the row(s) we know, then widen to
 * anything sharing a phone, a name+address or an email with them.
 */
export async function resolveContactLines(
  db: Client,
  workspaceId: string,
  seed: { leadId?: string | null; phone?: string | null },
): Promise<ResolvedContact> {
  const variants = seed.phone ? phoneVariants(seed.phone) : [];
  const seedLines: ContactLine[] = [];

  if (seed.leadId) {
    const { data } = await db.from("leads").select(LEAD_COLS).eq("id", seed.leadId).limit(1);
    seedLines.push(...asLines(data, "lead"));
  }
  if (variants.length > 0) {
    const [{ data: l }, { data: r }] = await Promise.all([
      db.from("leads").select(LEAD_COLS).eq("workspace_id", workspaceId).in("phone", variants).limit(LINE_LIMIT),
      db
        .from("lead_records")
        .select(RECORD_COLS)
        .eq("workspace_id", workspaceId)
        .in("phone", variants)
        .limit(LINE_LIMIT),
    ]);
    seedLines.push(...asLines(l, "lead"), ...asLines(r, "record"));
  }
  if (seedLines.length === 0) {
    return { phones: seed.phone ? [seed.phone] : [], leadIds: seed.leadId ? [seed.leadId] : [], recordIds: [] };
  }

  const names = [...new Set(seedLines.map((s) => s.fullName).filter(Boolean) as string[])].slice(0, 20);
  const addresses = [...new Set(seedLines.map((s) => s.address).filter(Boolean) as string[])].slice(0, 20);
  const emails = [...new Set(seedLines.map((s) => s.email).filter(Boolean) as string[])].slice(0, 20);
  const phones = [
    ...new Set(seedLines.flatMap((s) => (s.phone ? phoneVariants(s.phone) : []))),
    ...variants,
  ].slice(0, 60);

  const widen = async (table: string, cols: string): Promise<ContactLine[]> => {
    const out: ContactLine[] = [];
    const runs: Array<Promise<{ data: unknown }>> = [];
    const q = () => db.from(table).select(cols).eq("workspace_id", workspaceId).limit(LINE_LIMIT);
    if (phones.length) runs.push(q().in("phone", phones));
    if (addresses.length) runs.push(q().in("address", addresses));
    if (emails.length) runs.push(q().in("email", emails));
    if (names.length) runs.push(q().in("full_name", names));
    for (const res of await Promise.all(runs)) out.push(...asLines(res?.data, table === "leads" ? "lead" : "record"));
    return out;
  };

  const all = [...seedLines, ...(await widen("leads", LEAD_COLS)), ...(await widen("lead_records", RECORD_COLS))];
  const deduped = new Map(all.map((l) => [l.id, l]));
  const lines = [...deduped.values()];

  const groups = groupContacts(lines);
  const seedKeys = new Set(seedLines.map((s) => groups.get(s.id)).filter(Boolean) as string[]);
  const mine = lines.filter((l) => seedKeys.has(groups.get(l.id) as string));

  const phoneSet = new Set<string>();
  if (seed.phone) phoneSet.add(seed.phone);
  for (const l of mine) if (l.phone) phoneSet.add(l.phone);

  return {
    phones: [...phoneSet],
    leadIds: mine.filter((l) => l.id.startsWith("lead:")).map((l) => l.id.slice(5)),
    recordIds: mine.filter((l) => l.id.startsWith("record:")).map((l) => l.id.slice(7)),
  };
}

/**
 * The rule: one opt-out suppresses the contact everywhere. Writes a suppression
 * row for every phone on every line of the contact and logs one compliance
 * event per number added, so six months later you can show exactly which lines
 * were closed, when, and because of what.
 */
export async function suppressContactAcrossLines(
  db: Client,
  args: {
    workspaceId: string;
    phone: string;
    leadId?: string | null;
    reason: "optout" | "negative_keyword";
    source?: string;
    note?: string | null;
  },
): Promise<{ phones: string[]; leadIds: string[] }> {
  const resolved = await resolveContactLines(db, args.workspaceId, {
    leadId: args.leadId ?? null,
    phone: args.phone,
  });
  const origin = normalisePhone10(args.phone);
  const phones = [...new Set([args.phone, ...resolved.phones])].filter(Boolean);

  for (const phone of phones) {
    const sameLine = normalisePhone10(phone) === origin;
    try {
      await db.from("suppression").upsert({
        workspace_id: args.workspaceId,
        phone,
        reason: args.reason,
        source: args.source ?? "inbound",
        note: sameLine
          ? (args.note ?? null)
          : `Suppressed with ${args.phone} — same contact, other line${args.note ? `. ${args.note}` : ""}`,
      });
    } catch {
      /* one failed line must not stop the rest of the contact being closed */
    }
    if (sameLine) continue;
    try {
      await db.from("compliance_events").insert({
        workspace_id: args.workspaceId,
        phone,
        lead_id: args.leadId ?? null,
        path: "manual",
        reason: args.reason === "optout" ? "opted_out" : "negative_keyword",
        detail: { cross_line: true, origin_phone: args.phone, lines: resolved.leadIds.length },
      });
    } catch {
      /* the suppression is the control; logging is best-effort */
    }
  }

  // Every sequence the contact sits in stops, not just the line that replied.
  if (args.reason === "optout" && resolved.leadIds.length > 0) {
    const { stopSequenceForOptOut } = await import("@/lib/sequence-runner.server");
    for (const leadId of resolved.leadIds) {
      try {
        await stopSequenceForOptOut(db as never, { workspaceId: args.workspaceId, leadId });
      } catch {
        /* best-effort per line */
      }
    }
  }

  if (phones.length > 1) {
    console.warn(
      `[compliance] ${args.reason} on ${args.phone} suppressed ${phones.length} lines for the same contact`,
    );
  }
  return { phones, leadIds: resolved.leadIds };
}
