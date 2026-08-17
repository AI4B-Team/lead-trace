import { politeHtml } from "../../src/lib/data-providers/scraper-policy";
const urls = [
 "https://law.justia.com/codes/california/code-rtc/division-1/part-8/chapter-1-3/section-4675/",
 "https://law.justia.com/codes/california/code-rtc/division-1/part-8/chapter-1-3/section-4674/",
 "https://codes.findlaw.com/ca/revenue-and-taxation-code/rtc-sect-4675/",
];
for (const u of urls) {
  try {
    const { html } = await politeHtml(u);
    const t = html.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<style[\s\S]*?<\/style>/gi,"").replace(/<[^>]+>/g," ").replace(/&#160;|&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ");
    const i = Math.max(t.indexOf("excess proceeds"), 0);
    console.log("###", u, "\n", t.slice(Math.max(0,i-300), i+2600), "\n");
  } catch(e){ console.log("### ERR", u, String(e).slice(0,160)); }
}
