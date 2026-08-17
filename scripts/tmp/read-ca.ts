import { politeHtml, politeFetch } from "../../src/lib/data-providers/scraper-policy";
import { pdfToLines } from "../../src/lib/surplus/handlers/pdf-list";
import { pickLatestPdf } from "../../src/lib/surplus/clerk-primary.server";

const targets: Array<{name:string; landing:string; match:string}> = [
  { name: "Los Angeles", landing: "https://ttc.lacounty.gov/notice-of-excess-proceeds/", match: "ep-listing|excess" },
  { name: "Orange", landing: "https://octreasurer.gov/property-tax/tax-defaulted-land-sales", match: "excess" },
  { name: "San Joaquin", landing: "https://www.sjgov.org/department/ttcnew/tax-sale", match: "excess" },
];
for (const t of targets) {
  try {
    const { html } = await politeHtml(t.landing);
    const pdf = pickLatestPdf(html, t.landing, t.match);
    console.log("###", t.name, "landing ok, pdf =", pdf);
    if (!pdf) {
      const all = [...html.matchAll(/href\s*=\s*["']([^"']+\.pdf)["']/gi)].map(m=>m[1]).slice(0,20);
      console.log("   pdfs on page:", all);
      continue;
    }
    const res = await politeFetch(pdf, { headers: { Accept: "application/pdf" } });
    const buf = new Uint8Array(await res.arrayBuffer());
    const lines = await pdfToLines(buf);
    console.log("   bytes", buf.byteLength, "lines", lines.length);
    console.log(lines.slice(0, 40).map((l,i)=>`   ${i}| ${l}`).join("\n"));
  } catch (e) { console.log("###", t.name, "ERR", String(e).slice(0,300)); }
}
