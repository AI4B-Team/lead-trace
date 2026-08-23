// Marketplace Deals — collection provider PROBE (operator only).
//
// Two jobs, neither of which stores anything or alerts anyone:
//   GET  — provider health + configuration report.
//   POST — ONE real collection run for a source, reporting what normalization
//          produced. This is the proof-of-concept gate: a source is only marked
//          Live in the catalog after this returns real, well-formed listings.
//
// Protected by the same server-side cron credential as every other hook, so the
// browser-safe publishable key can never trigger paid collection.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const ProbeInput = z.object({
  source: z.enum(["facebook"]).default("facebook"),
  location: z.string().min(2).max(120),
  keywords: z.array(z.string().min(1).max(60)).max(10).optional(),
  priceMax: z.number().int().positive().max(10_000_000).nullable().optional(),
  radiusMiles: z.number().int().positive().max(500).nullable().optional(),
  limit: z.number().int().min(1).max(25).optional(),
});

export const Route = createFileRoute("/api/public/hooks/marketplace-collection-probe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { requireCronAuth } = await import("@/lib/cron-auth.server");
        const denied = await requireCronAuth(request);
        if (denied) return denied;

        const { providerHealthReport, providerMetadataReport } = await import(
          "@/lib/marketplace/providers/registry.server"
        );
        return Response.json({
          ok: true,
          health: await providerHealthReport(),
          providers: providerMetadataReport(),
        });
      },

      POST: async ({ request }) => {
        const { requireCronAuth } = await import("@/lib/cron-auth.server");
        const denied = await requireCronAuth(request);
        if (denied) return denied;

        const parsed = ProbeInput.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) {
          return Response.json(
            { ok: false, error: "Invalid probe input.", issues: parsed.error.issues.slice(0, 5) },
            { status: 400 },
          );
        }
        const { verifyFacebookCollection } = await import(
          "@/lib/marketplace/adapters/facebook.source.server"
        );
        const result = await verifyFacebookCollection(parsed.data);
        return Response.json({ ...result, stored: false, alerted: false });
      },
    },
  },
});
