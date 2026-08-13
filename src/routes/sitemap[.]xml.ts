import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { INDUSTRY_LANDINGS } from "@/lib/industry-landings";
import { LEAD_PAGES } from "@/lib/lead-pages";

const BASE_URL = "https://leadtrace.com";

interface SitemapEntry {
  path: string;
  changefreq?: "weekly" | "monthly";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/how-it-works", changefreq: "monthly", priority: "0.8" },
          { path: "/features", changefreq: "monthly", priority: "0.8" },
          { path: "/industries", changefreq: "monthly", priority: "0.7" },
          { path: "/pricing", changefreq: "monthly", priority: "0.9" },
          { path: "/street-scan", changefreq: "monthly", priority: "0.9" },
          { path: "/distress-feed", changefreq: "weekly", priority: "0.9" },
          { path: "/distress-feed/counties", changefreq: "weekly", priority: "0.8" },
          { path: "/distress-feed/guides", changefreq: "weekly", priority: "0.8" },
          { path: "/distress-feed/states", changefreq: "weekly", priority: "0.8" },
          { path: "/surplus-funds", changefreq: "weekly", priority: "0.9" },
          { path: "/surplus-funds/states", changefreq: "weekly", priority: "0.8" },
          { path: "/compliance", changefreq: "monthly", priority: "0.7" },
          { path: "/leads", changefreq: "weekly", priority: "0.9" },
          { path: "/tools", changefreq: "monthly", priority: "0.8" },
          { path: "/templates", changefreq: "weekly", priority: "0.8" },
          { path: "/tutorials", changefreq: "monthly", priority: "0.6" },
          { path: "/help", changefreq: "monthly", priority: "0.5" },
          { path: "/tools/dnc-checker", changefreq: "monthly", priority: "0.8" },
          { path: "/tools/line-type-checker", changefreq: "monthly", priority: "0.8" },
          ...LEAD_PAGES.map((p) => ({
            path: `/leads/${p.slug}`,
            changefreq: "monthly" as const,
            priority: "0.8",
          })),
          ...INDUSTRY_LANDINGS.map((i) => ({
            path: `/${i.slug}`,
            changefreq: "monthly" as const,
            priority: "0.8",
          })),
        ];
        // Coverage and guide pages are data-driven, so the sitemap regenerates
        // itself whenever coverage or the guide library changes.
        try {
          const { stateSummaries, countySummaries, listGuides } =
            await import("@/lib/distress-feed.server");
          const { listPublishedStateGuides } = await import("@/lib/state-guides.server");
          const { countySlug, recordTypeById } = await import("@/lib/distress-feed.shared");
          const states = await stateSummaries();
          const guides = await listGuides();
          // Only PUBLISHED state guides are advertised: a draft renders noindex,
          // so listing it would advertise a page we are telling Google to skip.
          const stateGuides = await listPublishedStateGuides();
          const stateGuideStates = new Set(stateGuides.map((g) => g.state.toUpperCase()));
          // Only list guide state hubs that actually have guides, otherwise the
          // state route 404s and the sitemap advertises dead URLs.
          const guideStates = new Set(guides.map((g) => g.state.toUpperCase()));
          for (const s of states) {
            const code = s.state.toLowerCase();
            entries.push({
              path: `/distress-feed/counties/${code}`,
              changefreq: "weekly",
              priority: "0.7",
            });
            if (guideStates.has(s.state.toUpperCase())) {
              entries.push({
                path: `/distress-feed/guides/${code}`,
                changefreq: "monthly",
                priority: "0.6",
              });
            }
            if (stateGuideStates.has(s.state.toUpperCase())) {
              entries.push({
                path: `/distress-feed/states/${code}`,
                changefreq: "weekly",
                priority: "0.8",
              });
            }
            for (const c of await countySummaries(s.state)) {
              entries.push({
                path: `/distress-feed/counties/${code}/${countySlug(c.county)}`,
                changefreq: "weekly",
                priority: "0.7",
              });
            }
          }
          for (const g of guides) {
            entries.push({
              path: `/distress-feed/guides/${g.state.toLowerCase()}/${countySlug(g.county)}/${
                recordTypeById(g.record_type)?.slug ?? g.record_type
              }`,
              changefreq: "monthly",
              priority: "0.7",
            });
          }
          for (const g of stateGuides) {
            entries.push({
              path: `/distress-feed/states/${g.state.toLowerCase()}/${g.record_type_slug}`,
              changefreq: "weekly",
              priority: "0.8",
            });
          }
          // Surplus guides publish independently of the record-type guides, and
          // only published rows are listed — an unpublished one renders noindex.
          const { publishedSurplusUrls } = await import("@/lib/surplus/public.server");
          for (const u of await publishedSurplusUrls()) {
            const code = u.state.toLowerCase();
            entries.push({
              path: u.countySlug
                ? `/distress-feed/states/${code}/surplus-funds/${u.countySlug}`
                : `/distress-feed/states/${code}/surplus-funds`,
              changefreq: "weekly",
              priority: u.countySlug ? "0.7" : "0.8",
            });
          }
        } catch (err) {
          console.error("sitemap: distress feed pages skipped:", err);
        }

        const urls = entries
          .map((e) =>
            [
              `  <url>`,
              `    <loc>${BASE_URL}${e.path}</loc>`,
              e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
              e.priority ? `    <priority>${e.priority}</priority>` : null,
              `  </url>`,
            ]
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n");
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
