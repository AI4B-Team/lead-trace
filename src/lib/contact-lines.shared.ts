/**
 * P5.8.7 — Multi-line correction (pure half).
 *
 * The same person shows up in the book more than once: a foreclosure record and
 * a code-violation record for the same house, two skip-traced numbers on one
 * owner, a list uploaded twice with a different cell. Each of those rows is a
 * "line" — one reachable phone number for one contact.
 *
 * The rule this file exists to serve: an opt-out on ANY line suppresses the
 * contact on EVERY line, permanently. A person who told us to stop must not be
 * reachable again through a different record type, a different list or a
 * different number we happen to hold for them.
 */

/** Last ten digits, the only phone form worth comparing. */
export function normalisePhone10(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function squash(v: string | null | undefined): string | null {
  const s = (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return s.length >= 3 ? s : null;
}

/** One row of the book that carries a phone line. */
export type ContactLine = {
  id: string;
  phone: string | null;
  fullName?: string | null;
  address?: string | null;
  zip?: string | null;
  email?: string | null;
};

/**
 * Identity keys a line can be matched on. Two lines belong to the same contact
 * when they share any key. Address is only trusted together with a name or zip,
 * so two unrelated owners of a duplex are not merged into one person.
 */
export function identityKeys(line: ContactLine): string[] {
  const keys: string[] = [];
  const phone = normalisePhone10(line.phone);
  if (phone) keys.push(`p:${phone}`);
  const email = (line.email ?? "").trim().toLowerCase();
  if (email.includes("@")) keys.push(`e:${email}`);
  const name = squash(line.fullName);
  const address = squash(line.address);
  const zip = (line.zip ?? "").replace(/\D/g, "").slice(0, 5);
  if (name && address) keys.push(`na:${name}|${address}`);
  if (address && zip.length === 5) keys.push(`az:${address}|${zip}`);
  return keys;
}

/**
 * Groups lines into contacts by shared identity keys (union-find, so A–B and
 * B–C put A and C together). Returns a contact key per line id.
 */
export function groupContacts(lines: ContactLine[]): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) && parent.get(r) !== r) r = parent.get(r) as string;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const line of lines) {
    const self = `line:${line.id}`;
    if (!parent.has(self)) parent.set(self, self);
    for (const key of identityKeys(line)) {
      if (!parent.has(key)) parent.set(key, key);
      union(self, key);
    }
  }

  const contactKeyByLine = new Map<string, string>();
  for (const line of lines) contactKeyByLine.set(line.id, find(`line:${line.id}`));
  return contactKeyByLine;
}

/**
 * Every phone we hold for the contacts that own the given seed lines. This is
 * the set that has to be suppressed when one of them says STOP.
 */
export function contactPhones(lines: ContactLine[], seedLineIds: string[]): string[] {
  const groups = groupContacts(lines);
  const wanted = new Set(seedLineIds.map((id) => groups.get(id)).filter(Boolean) as string[]);
  const phones = new Set<string>();
  for (const line of lines) {
    const key = groups.get(line.id);
    if (key && wanted.has(key) && line.phone) phones.add(line.phone);
  }
  return [...phones];
}
