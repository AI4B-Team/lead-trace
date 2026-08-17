import { politeHtml } from "../../src/lib/data-providers/scraper-policy";
const urls = [
 "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=RTC&sectionNum=4675",
 "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=RTC&sectionNum=4674",
];
for (const u of urls) {
  try {
    const { html } = await politeHtml(u);
    const text = html.replace(/<script[\s\S]*?<\/script>/gi,"").replace(/<[^>]+>/g," ").replace(/&#160;|&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ");
    const i = text.indexOf("4674") ;
    console.log("###", u);
    console.log(text.slice(Math.max(0,i-100), i+3000));
  } catch(e){ console.log("### ERR", u, String(e).slice(0,200)); }
}
