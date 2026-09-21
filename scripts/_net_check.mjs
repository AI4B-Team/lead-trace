// Network triage: is it our network/VPN or RealeFlow's block?
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);

// 1. Our outbound internet + public IP
try {
  const ip = await (await fetch("https://api.ipify.org?format=json")).json();
  console.log("1. our public IP:", ip.ip);
} catch (e) {
  console.log("1. FAILED to reach ipify:", e.message);
}

// 2. General internet (control)
try {
  const g = await fetch("https://www.google.com", { method: "HEAD" });
  console.log("2. google reachable:", g.status);
} catch (e) {
  console.log("2. FAILED to reach google:", e.message);
}

// 3. RealeFlow app domain root (not the API) — is the whole domain blocking us?
const base = (env.REALEFLOW_BASE_URL ?? "").replace(/\/+$/, "");
try {
  const root = await fetch(base, {
    method: "HEAD",
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36" },
  });
  console.log("3. realeflow domain root:", root.status, "cf-ray:", root.headers.get("cf-ray") ?? "-");
} catch (e) {
  console.log("3. FAILED to reach domain root:", e.message);
}

// 4. The API call itself
try {
  const r = await fetch(`${base}/api/2.0/leadpipes/autocomplete?q=test`, {
    headers: {
      "X-RF-Partner-Api-Key": env.REALEFLOW_API_KEY,
      "X-RF-Partner-Account-Id": env.REALEFLOW_ACCOUNT_ID,
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const t = await r.text();
  console.log("4. API status:", r.status,
    "| cloudflare block:", /Just a moment|challenges\.cloudflare/i.test(t),
    "| cf-ray:", r.headers.get("cf-ray") ?? "-");
  console.log("   body[0..100]:", t.slice(0, 100).replace(/\s+/g, " "));
} catch (e) {
  console.log("4. FAILED API call:", e.message);
}
