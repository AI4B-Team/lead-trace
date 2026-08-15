// ---------------------------------------------------------------------------
// Public Records Request composer. Per-state templates cite the governing
// statute so the request is unambiguous to the records officer, and always ask
// for a machine-readable format.
//
// Throttling rule (enforced server-side): one request per agency per cycle
// from LeadTrace — never one per user. The returned dataset is distributed to
// every workspace subscribed to that county.
// ---------------------------------------------------------------------------

export const CADENCE_OPTIONS = ["weekly", "biweekly", "monthly", "quarterly"] as const;
export type RequestCadence = (typeof CADENCE_OPTIONS)[number];

export const CADENCE_LABEL: Record<RequestCadence, string> = {
  weekly: "Weekly",
  biweekly: "Every Two Weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
};

export const CADENCE_DAYS: Record<RequestCadence, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
};

export const REQUEST_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sent: "Sent",
  received: "Received",
  parsing: "Parsing",
  needs_mapping: "Needs Mapping",
  failed: "Failed",
  paused: "Paused",
};

/** Governing public-records statute by state. */
export const STATE_STATUTE: Record<string, string> = {
  AL: "Alabama Code § 36-12-40 (Public Writings)",
  AK: "Alaska Stat. § 40.25.110 (Public Records Act)",
  AZ: "A.R.S. § 39-121 (Public Records Law)",
  AR: "Ark. Code § 25-19-101 (Freedom of Information Act)",
  CA: "Cal. Gov. Code § 7920.000 et seq. (California Public Records Act)",
  CO: "C.R.S. § 24-72-201 et seq. (Colorado Open Records Act)",
  CT: "Conn. Gen. Stat. § 1-200 et seq. (Freedom of Information Act)",
  DE: "29 Del. C. § 10001 et seq. (Freedom of Information Act)",
  DC: "D.C. Code § 2-531 et seq. (Freedom of Information Act)",
  FL: "Chapter 119, Florida Statutes (Florida Public Records Act)",
  GA: "O.C.G.A. § 50-18-70 et seq. (Open Records Act)",
  HI: "HRS Chapter 92F (Uniform Information Practices Act)",
  ID: "Idaho Code § 74-101 et seq. (Public Records Act)",
  IL: "5 ILCS 140 (Freedom of Information Act)",
  IN: "Ind. Code § 5-14-3 (Access to Public Records Act)",
  IA: "Iowa Code Chapter 22 (Examination of Public Records)",
  KS: "K.S.A. § 45-215 et seq. (Open Records Act)",
  KY: "KRS 61.870 et seq. (Open Records Act)",
  LA: "La. R.S. § 44:1 et seq. (Public Records Law)",
  ME: "1 M.R.S. § 401 et seq. (Freedom of Access Act)",
  MD: "Md. Code, Gen. Prov. § 4-101 et seq. (Public Information Act)",
  MA: "M.G.L. c. 66 § 10 (Public Records Law)",
  MI: "MCL § 15.231 et seq. (Freedom of Information Act)",
  MN: "Minn. Stat. Chapter 13 (Government Data Practices Act)",
  MS: "Miss. Code § 25-61-1 et seq. (Public Records Act)",
  MO: "Mo. Rev. Stat. § 610.010 et seq. (Sunshine Law)",
  MT: "Mont. Code § 2-6-1001 et seq. (Public Records)",
  NE: "Neb. Rev. Stat. § 84-712 (Public Records Statutes)",
  NV: "NRS Chapter 239 (Public Records Act)",
  NH: "RSA Chapter 91-A (Right-to-Know Law)",
  NJ: "N.J.S.A. § 47:1A-1 et seq. (Open Public Records Act)",
  NM: "NMSA § 14-2-1 et seq. (Inspection of Public Records Act)",
  NY: "N.Y. Pub. Off. Law § 84 et seq. (Freedom of Information Law)",
  NC: "N.C.G.S. § 132-1 et seq. (Public Records Law)",
  ND: "N.D.C.C. § 44-04-18 (Open Records Statute)",
  OH: "Ohio Rev. Code § 149.43 (Public Records Act)",
  OK: "51 O.S. § 24A.1 et seq. (Open Records Act)",
  OR: "ORS § 192.311 et seq. (Public Records Law)",
  PA: "65 P.S. § 67.101 et seq. (Right-to-Know Law)",
  RI: "R.I. Gen. Laws § 38-2-1 et seq. (Access to Public Records Act)",
  SC: "S.C. Code § 30-4-10 et seq. (Freedom of Information Act)",
  SD: "SDCL Chapter 1-27 (Public Records)",
  TN: "Tenn. Code § 10-7-503 (Public Records Act)",
  TX: "Tex. Gov't Code Chapter 552 (Public Information Act)",
  UT: "Utah Code § 63G-2-101 et seq. (GRAMA)",
  VT: "1 V.S.A. § 315 et seq. (Public Records Act)",
  VA: "Va. Code § 2.2-3700 et seq. (Freedom of Information Act)",
  WA: "RCW Chapter 42.56 (Public Records Act)",
  WV: "W. Va. Code § 29B-1-1 et seq. (Freedom of Information Act)",
  WI: "Wis. Stat. § 19.31 et seq. (Public Records Law)",
  WY: "Wyo. Stat. § 16-4-201 et seq. (Public Records Act)",
};

export function statuteFor(state: string): string {
  return STATE_STATUTE[state.toUpperCase()] ?? "the applicable state public records law";
}

export function dateRangeFor(days: number, now = new Date()): { from: string; to: string } {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

export type ComposeArgs = {
  agencyName: string;
  department?: string | null;
  contactName?: string | null;
  state: string;
  recordTypes: string[];
  dateRangeDays: number;
  requesterName?: string;
  requesterEmail?: string;
  now?: Date;
};

export function composeRequestSubject(args: ComposeArgs): string {
  const { from, to } = dateRangeFor(args.dateRangeDays, args.now);
  return `Public Records Request — ${args.recordTypes.join(", ")} (${from} to ${to})`;
}

export function composeRequestBody(args: ComposeArgs): string {
  const { from, to } = dateRangeFor(args.dateRangeDays, args.now);
  const greeting = args.contactName ? `Dear ${args.contactName},` : "To the Records Custodian,";
  const dept = args.department ? `${args.department}, ${args.agencyName}` : args.agencyName;
  return [
    greeting,
    "",
    `Under ${statuteFor(args.state)}, I am requesting copies of the following records held by ${dept}:`,
    "",
    ...args.recordTypes.map((t) => `  • ${t}`),
    "",
    `Date range: ${from} through ${to}.`,
    "",
    "If possible, please provide the records in a machine-readable format (Excel .xlsx or CSV) including, where available: property address, city, ZIP, owner or respondent name, case or record number, filing or inspection date, current status, and a description of the violation or order.",
    "",
    "If any portion of this request is denied, please cite the specific exemption relied upon and release all remaining responsive records. If fees are expected to exceed $25, please advise before proceeding so I can authorize the cost.",
    "",
    "Thank you for your time and assistance.",
    "",
    "Sincerely,",
    args.requesterName ?? "LeadTrace Records Team",
    args.requesterEmail ?? "records@leadtrace.com",
  ].join("\n");
}
