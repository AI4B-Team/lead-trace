import { politeFetch } from "../../src/lib/data-providers/scraper-policy";
import { pdfToLines } from "../../src/lib/surplus/handlers/pdf-list";
const urls = [
 ["Orange 1398","https://www.octreasurer.gov/sites/ttc/files/2025-11/Excess%20Proceeds%20Timeshare%20Re-Offer%20Auction%201398.pdf"],
 ["Orange 1397","https://octreasurer.gov/sites/ttc/files/2021-10/Excess%20Proceeds%20-%20Internet%20Auction%20%231397.pdf"],
 ["SanJoaquin 2026","https://www.sjgov.org/docs/default-source/treasurer---tax-collector-documents/excess-proceeds/excess-proceeds-march-2026.pdf?sfvrsn=1f82eec3_21"],
];
for (const [name,u] of urls) {
  try {
    const res = await politeFetch(u, { headers: { Accept: "application/pdf" } });
    const lines = await pdfToLines(new Uint8Array(await res.arrayBuffer()));
    console.log("###", name, lines.length, "lines");
    console.log(lines.slice(0,30).map((l,i)=>`  ${i}| ${l}`).join("\n"));
  } catch(e){ console.log("###", name, "ERR", String(e).slice(0,200)); }
}
