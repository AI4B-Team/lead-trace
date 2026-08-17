import { politeHtml } from "../../src/lib/data-providers/scraper-policy";
const urls = [
 "https://california.public.law/codes/ca_rev_and_tax_code_section_4675",
 "https://california.public.law/codes/ca_rev_and_tax_code_section_4674",
 "https://ttc.lacounty.gov/notice-of-excess-proceeds/",
];
for (const u of urls) {
  try {
    const { html } = await politeHtml(u);
    const t = html.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," ").replace(/&#160;|&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ");
    const i = Math.max(t.toLowerCase().indexOf("one year"), t.toLowerCase().indexOf("excess proceeds"), 0);
    console.log("###", u, "\n", t.slice(Math.max(0,i-600), i+2200), "\n");
  } catch(e){ console.log("### ERR", u, String(e).slice(0,160)); }
}
