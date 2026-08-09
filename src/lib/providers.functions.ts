import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ProviderKey = "scrape" | "lookup" | "scrub";

export type ProviderHealth = {
  key: string;
  state: "up" | "degraded" | "down";
  message: string | null;
};

/**
 * Graceful provider-outage state (spec §9.5). Rather than surfacing a generic
 * error, affected screens show a maintenance banner and let the user subscribe
 * to a recovery email. Queued jobs resume on their own.
 */
export const getProviderHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("provider_status")
      .select("key, state, message");
    return { providers: (data ?? []) as ProviderHealth[] };
  });

export const subscribeProviderAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        providerKey: z.enum(["scrape", "lookup", "scrub"]),
        workspaceId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const email = (context.claims?.email as string | undefined) ?? null;
    if (!email) throw new Error("We Need An Email On Your Account To Notify You.");
    const { error } = await context.supabase.from("provider_alerts").insert({
      user_id: context.userId,
      workspace_id: data.workspaceId ?? null,
      provider_key: data.providerKey,
      email,
    });
    if (error) throw new Error(error.message);
    return { ok: true, email };
  });

/** Live credential probe for the Apify scraper (Settings → Integrations). */
export const checkApifyConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { verifyApifyToken } = await import("./data-providers/apify");
    return verifyApifyToken();
  });

export type VendorStatus = {
  key: string;
  label: string;
  configured: boolean;
  detail: string;
};

/**
 * Data-vendor readiness for Settings → Integrations. Scrubbing is fail-closed,
 * so an unconfigured scrub vendor is a hard blocker worth showing plainly.
 */
export const getVendorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { verifyApifyToken } = await import("./data-providers/apify");
    const { getDncScrubber } = await import("./data-providers/dnc");

    const apify = await verifyApifyToken().catch((err: unknown) => ({
      ok: false,
      message: err instanceof Error ? err.message : "Apify check failed.",
    }));
    const scrubber = getDncScrubber();
    const scrubConfigured = scrubber.isConfigured();
    const skipProvider = process.env.SKIPTRACE_PROVIDER ?? "realeflow-semi";
    const { isSkipTraceProviderConfigured } = await import("./skiptrace/provider.server");
    const skipConfigured = isSkipTraceProviderConfigured(skipProvider);

    const vendors: VendorStatus[] = [
      {
        key: "apify",
        label: "Business Sources — Google Maps, Yelp, LinkedIn",
        configured: apify.ok,
        detail: apify.ok
          ? "Connected. Google Maps, Yelp, and LinkedIn company searches are live."
          : apify.message,
      },
      {
        key: "scrub",
        label:
          scrubber.key === "dnc.rpv"
            ? "DNC & Litigator Scrub — RealPhoneValidation"
            : "DNC & Litigator Scrub",
        configured: scrubConfigured,
        detail: scrubConfigured
          ? "Connected. Federal DNC, state DNC, DMA, and litigator lists are checked before any send."
          : "Not connected. Outreach stays blocked until a scrub vendor is configured.",
      },
      {
        key: "skiptrace",
        label:
          skipProvider === "batchskiptracing"
            ? "Skip Trace — BatchSkipTracing"
            : "Skip Trace — Semi-Trace",
        configured: skipConfigured,
        detail: !skipConfigured
          ? `Not connected. "${skipProvider}" is selected but its credentials are missing, so skip trace will fail rather than guess.`
          : skipProvider === "realeflow-semi"
            ? "Semi-trace only: confirmed owner name and mailing address. No phone vendor is connected yet."
            : "Connected. Full skip trace returns owner name, mailing address, phones, and emails.",
      },
    ];
    return { vendors };
  });
