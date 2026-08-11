// ---------------------------------------------------------------------------
// Realauction (RealForeclose / RealTaxDeed) adapter.
//
// The vendor runs one ColdFusion site per participating county on
// <county>.realforeclose.com. Auction day pages are server-rendered: each item
// arrives as a .AUCTION_ITEM block containing a label/value table.
//
// Every selector lives in fetch_config so a markup change is a data fix, not a
// deploy. The defaults below were read off live Broward HTML; anything we have
// not confirmed against a real page stays absent rather than guessed.
// ---------------------------------------------------------------------------

import { AdapterEmptyDayError, AdapterStructureError } from "@/lib/adapter-errors";
import { auctionWindowBlock, politeHtml } from "./scraper-policy";

export type RealauctionFetchConfig = {
  /** Class present on each auction item block. */
  itemClass?: string;
  /** Class on the label cell of the detail table. */
  labelClass?: string;
  /** Class on the value cell of the detail table. */
  valueClass?: string;
  /** Class carrying the auction start timestamp. */
  auctionDateClass?: string;
  /** Label text (lowercased, colon-stripped) → canonical field name. */
  labelMap?: Record<string, string>;
  /** Substrings that mean "the county says nothing is scheduled". */
  emptyDayMarkers?: string[];
};

export const REALAUCTION_DEFAULT_CONFIG: RealauctionFetchConfig = {
  itemClass: "AUCTION_ITEM",
  labelClass: "AD_LBL",
  valueClass: "AD_DTA",
  auctionDateClass: "ASTAT_MSGB",
  labelMap: {
    "auction type": "auctionType",
    "case #": "caseNumber",
    "case number": "caseNumber",
    "final judgment amount": "finalJudgmentAmount",
    "parcel id": "parcelApn",
    "property address": "propertyAddress",
    "plaintiff max bid": "plaintiffMaxBid",
    "opening bid": "openingBid",
    "assessed value": "assessedValue",
    "certificate #": "certificateNumber",
    // Sold-auction labels. Present on completed sale days; unmatched labels are
    // harmless, and no new selectors or classes are introduced for them — the
    // sold table renders in the same AD_LBL/AD_DTA pair as everything above.
    "sold amount": "soldAmount",
    amount: "soldAmount",
    "sold to": "soldTo",
    "sold date": "soldDate",
  },
  emptyDayMarkers: ["No Auctions Scheduled", "There are no auctions scheduled"],
};

export type RealauctionRow = {
  auctionItemId: string | null;
  caseNumber: string | null;
  auctionDate: string | null; // ISO date
  auctionTime: string | null;
  auctionType: string | null;
  parcelApn: string | null;
  propertyAddress: string | null;
  propertyCity: string | null;
  propertyZip: string | null;
  openingBid: number | null;
  finalJudgmentAmount: number | null;
  /** What the property actually sold for. Null means unknown, never zero. */
  soldAmount: number | null;
  /** Typically "3rd Party Bidder" or "Plaintiff". */
  soldTo: string | null;
  soldDate: string | null;
  sourceUrl: string;
  raw: Record<string, string>;
};

const stripTags = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();

function money(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Split the document into the HTML of each auction item block. */
function itemBlocks(html: string, itemClass: string): string[] {
  const out: string[] = [];
  const open = new RegExp(`<div[^>]*class="[^"]*\\b${itemClass}\\b[^"]*"[^>]*>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = open.exec(html))) {
    const start = m.index;
    // Walk divs to find the matching close tag.
    let depth = 0;
    const tag = /<\/?div\b[^>]*>/gi;
    tag.lastIndex = start;
    let t: RegExpExecArray | null;
    while ((t = tag.exec(html))) {
      if (t[0].startsWith("</")) {
        depth -= 1;
        if (depth === 0) break;
      } else depth += 1;
    }
    const end = t ? t.index + t[0].length : html.length;
    out.push(html.slice(start, end));
    open.lastIndex = end;
  }
  return out;
}

function attr(block: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`, "i").exec(block);
  return m?.[1] ?? null;
}

function isoDate(raw: string | null): { date: string | null; time: string | null } {
  if (!raw) return { date: null, time: null };
  const d = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  const t = /(\d{1,2}:\d{2}\s*(?:AM|PM)?(?:\s*[A-Z]{2,3})?)/i.exec(raw);
  return {
    date: d ? `${d[3]}-${d[1]!.padStart(2, "0")}-${d[2]!.padStart(2, "0")}` : null,
    time: t?.[1]?.trim() ?? null,
  };
}

export function parseRealauctionPage(
  html: string,
  sourceUrl: string,
  config: RealauctionFetchConfig = {},
): RealauctionRow[] {
  const cfg = { ...REALAUCTION_DEFAULT_CONFIG, ...config };
  const itemClass = cfg.itemClass;
  const labelClass = cfg.labelClass;
  const valueClass = cfg.valueClass;
  if (!itemClass || !labelClass || !valueClass) {
    throw new AdapterStructureError({
      message: "Realauction fetch_config is missing selectors — refusing to guess",
      url: sourceUrl,
      bytes: html.length,
    });
  }

  if ((cfg.emptyDayMarkers ?? []).some((marker) => html.includes(marker))) {
    throw new AdapterEmptyDayError(sourceUrl);
  }

  const rows: RealauctionRow[] = [];
  for (const block of itemBlocks(html, itemClass)) {
    const raw: Record<string, string> = {};
    const cellRe = new RegExp(
      `<td[^>]*class="[^"]*\\b${labelClass}\\b[^"]*"[^>]*>([\\s\\S]*?)</td>\\s*<td[^>]*class="[^"]*\\b${valueClass}\\b[^"]*"[^>]*>([\\s\\S]*?)</td>`,
      "gi",
    );
    let c: RegExpExecArray | null;
    let lastField = "";
    while ((c = cellRe.exec(block))) {
      const label = stripTags(c[1] ?? "").replace(/:$/, "").toLowerCase();
      const value = stripTags(c[2] ?? "");
      if (!value) continue;
      const field = cfg.labelMap?.[label];
      if (field) {
        raw[field] = value;
        lastField = field;
      } else if (!label && lastField === "propertyAddress") {
        // Continuation line: "CITY, ZIP".
        raw["propertyAddressLine2"] = value;
      } else if (label) {
        raw[label] = value;
      }
    }

    const dateBlock = new RegExp(
      `class="[^"]*\\b${cfg.auctionDateClass}\\b[^"]*"[^>]*>([\\s\\S]*?)</div>`,
      "i",
    ).exec(block);
    const { date, time } = isoDate(dateBlock ? stripTags(dateBlock[1] ?? "") : null);

    const line2 = raw["propertyAddressLine2"] ?? "";
    // Live FL pages write line 2 as "GAINESVILLE, FL- 32641" — a state
    // abbreviation and a stray hyphen sit between the comma and the ZIP. The
    // older comma-then-ZIP pattern silently dropped city and ZIP on every
    // county, so both parts stay optional but the state segment is tolerated.
    const cityZip = /^(.*?),\s*(?:([A-Z]{2})\s*-?\s*)?(\d{5})/.exec(line2);

    rows.push({
      auctionItemId: attr(block, "aid"),
      caseNumber: raw["caseNumber"] ?? null,
      auctionDate: date,
      auctionTime: time,
      auctionType: raw["auctionType"] ?? null,
      parcelApn: raw["parcelApn"] ?? null,
      propertyAddress: raw["propertyAddress"] ?? null,
      propertyCity: cityZip?.[1]?.trim() ?? null,
      propertyZip: cityZip?.[3] ?? null,
      openingBid: money(raw["openingBid"]),
      finalJudgmentAmount: money(raw["finalJudgmentAmount"]),
      soldAmount: money(raw["soldAmount"]),
      soldTo: raw["soldTo"] ?? null,
      soldDate: isoDate(raw["soldDate"] ?? null).date,
      sourceUrl,
      raw,
    });
  }

  if (rows.length === 0) {
    throw new AdapterStructureError({
      message: "Realauction page returned HTTP 200 with zero parsed auction items",
      url: sourceUrl,
      httpStatus: 200,
      bytes: html.length,
      detail: `no .${itemClass} blocks matched`,
    });
  }
  return rows;
}

/** A row is only usable evidence of coverage if it has both keys we cadence on. */
export function isUsableRow(row: RealauctionRow): boolean {
  return Boolean(row.caseNumber && row.auctionDate);
}

/**
 * The vendor runs one property per record type: foreclosure sales live on
 * <county>.realforeclose.com and tax deed sales on <county>.realtaxdeed.com.
 * Markup is identical across both, so the domain is the only thing that moves.
 */
export type RealauctionDomain = "realforeclose.com" | "realtaxdeed.com";

export const realauctionUrls = {
  home: (sub: string, domain: RealauctionDomain = "realforeclose.com") =>
    `https://${sub}.${domain}/index.cfm`,
  calendar: (sub: string, domain: RealauctionDomain = "realforeclose.com") =>
    `https://${sub}.${domain}/index.cfm?zaction=USER&ZMETHOD=CALENDAR`,
  auctionDay: (sub: string, mmddyyyy: string, domain: RealauctionDomain = "realforeclose.com") =>
    `https://${sub}.${domain}/index.cfm?zaction=AUCTION&Zmethod=PREVIEW&AUCTIONDATE=${mmddyyyy}`,
};

/** Auction dates the calendar page advertises, as MM/DD/YYYY. */
export function parseCalendarDates(html: string): string[] {
  const dates = new Set<string>();
  for (const m of html.matchAll(/dayid="(\d{2})\/(\d{2})\/(\d{4})"/gi)) {
    dates.add(`${m[1]}/${m[2]}/${m[3]}`);
  }
  for (const m of html.matchAll(/AUCTIONDATE=(\d{2})\/(\d{2})\/(\d{4})/gi)) {
    dates.add(`${m[1]}/${m[2]}/${m[3]}`);
  }
  return [...dates];
}

export async function fetchRealauctionDay(
  sub: string,
  mmddyyyy: string,
  config?: RealauctionFetchConfig,
  domain: RealauctionDomain = "realforeclose.com",
): Promise<RealauctionRow[]> {
  const block = auctionWindowBlock();
  if (block.blocked) throw new Error(block.reason);
  const url = realauctionUrls.auctionDay(sub, mmddyyyy, domain);
  const { html } = await politeHtml(url);
  return parseRealauctionPage(html, url, config);
}
