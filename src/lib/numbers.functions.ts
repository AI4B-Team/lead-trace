import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const REGION_AREA_CODES: Record<"east" | "central" | "mountain" | "west", string[]> = {
  east: ["212", "215", "305", "404", "617", "813", "919"],
  central: ["214", "312", "615", "713", "816", "901"],
  mountain: ["303", "480", "505", "702", "801"],
  west: ["206", "310", "415", "503", "619", "702", "858"],
};

export const listNumbers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("sending_numbers")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { rows: rows ?? [] };
  });

export const buyNumbers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      region: z.enum(["east", "central", "mountain", "west"]),
      quantity: z.number().int().min(1).max(20),
      areaCodes: z.array(z.string().regex(/^\d{3}$/)).max(20).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Buying DIDs is a spend — admins/owners only.
    const { assertAction } = await import("./accountability.server");
    await assertAction(context.supabase, data.workspaceId, context.userId, "purchase_credits");
    const codes = data.areaCodes?.length ? data.areaCodes : REGION_AREA_CODES[data.region];
    const { isProviderConfigured, getProvider } = await import("@/lib/sms");
    const useReal = isProviderConfigured();
    const provider = useReal ? getProvider() : null;

    type Row = {
      workspace_id: string;
      phone: string;
      area_code: string;
      region: "east" | "central" | "mountain" | "west";
      health_score: number;
      optout_rate: number;
      status: "active";
      provider_sid: string;
    };
    const rows: Row[] = [];
    for (let i = 0; i < data.quantity; i++) {
      const area = codes[i % codes.length]!;
      let phone: string;
      let providerSid: string;
      if (provider) {
        try {
          const bought = await provider.buyNumber(area);
          phone = bought.phone;
          providerSid = bought.providerSid;
        } catch (e) {
          throw new Error(`Number purchase failed: ${(e as Error).message}`);
        }
      } else {
        // Stub fallback when Telnyx creds are absent — keeps the pool UI usable in dev.
        const mid = 200 + Math.floor(Math.random() * 799);
        const last = 1000 + Math.floor(Math.random() * 8999);
        phone = `+1${area}${mid}${last}`;
        providerSid = `stub_${crypto.randomUUID().slice(0, 12)}`;
      }
      rows.push({
        workspace_id: data.workspaceId,
        phone,
        area_code: area,
        region: data.region,
        health_score: 100,
        optout_rate: 0,
        status: "active" as const,
        provider_sid: providerSid,
      });
    }
    const { error } = await context.supabase.from("sending_numbers").insert(rows);
    if (error) throw error;
    return { added: rows.length, mode: useReal ? "telnyx" : "stub" };
  });

// Search live Telnyx inventory for available numbers in an area code so users
// can hand-pick specific numbers instead of relying on regional bulk buy.
export const searchInventory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      areaCode: z.string().regex(/^\d{3}$/),
      limit: z.number().int().min(1).max(50).default(20),
    }).parse(input),
  )
  .handler(async ({ data }) => {
    const { isProviderConfigured, getProvider } = await import("@/lib/sms");
    if (!isProviderConfigured()) return { configured: false, numbers: [] as { phone: string; areaCode: string; region?: string }[] };
    const provider = getProvider();
    if (!provider.searchAvailable) return { configured: true, numbers: [] };
    const numbers = await provider.searchAvailable(data.areaCode, data.limit);
    return { configured: true, numbers };
  });

// Purchase a specific phone the user picked from searchInventory.
export const buySpecificNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      phone: z.string().min(8),
      areaCode: z.string().regex(/^\d{3}$/),
      region: z.enum(["east", "central", "mountain", "west"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAction } = await import("./accountability.server");
    await assertAction(context.supabase, data.workspaceId, context.userId, "purchase_credits");
    const { isProviderConfigured, getProvider } = await import("@/lib/sms");
    if (!isProviderConfigured()) throw new Error("Telnyx not configured");
    const provider = getProvider();
    if (!provider.buySpecific) throw new Error("Provider does not support specific-number purchase");
    const bought = await provider.buySpecific(data.phone);
    const { error } = await context.supabase.from("sending_numbers").insert({
      workspace_id: data.workspaceId,
      phone: bought.phone,
      area_code: data.areaCode,
      region: data.region,
      health_score: 100,
      optout_rate: 0,
      status: "active",
      provider_sid: bought.providerSid,
    });
    if (error) throw error;
    {
      const { logActivity } = await import("./activity.server");
      await logActivity(context.supabase, data.workspaceId, {
        type: "number_added",
        summary: `Sending Number Added — ${bought.phone}`,
        detail: `Area Code ${data.areaCode}`,
        refType: "number",
      });
    }
    return { ok: true, phone: bought.phone };
  });

export const getRegistration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: reg } = await context.supabase
      .from("registrations")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    return { registration: reg };
  });

// On-demand poll of the carrier's 10DLC verdict. Vetting is asynchronous with
// no dependable callback, so users can pull the current status themselves and
// the nightly tick sweeps everyone else.
export const refreshRegistrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { syncRegistration } = await import("@/lib/registration-sync.server");
    return syncRegistration(context.supabase, data.workspaceId);
  });

export const advanceRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      brand_status: z.enum(["pending", "submitted", "approved", "rejected"]).optional(),
      campaign_status: z.enum(["pending", "submitted", "approved", "rejected"]).optional(),
      brand: z
        .object({
          legal_name: z.string().min(1),
          ein: z.string().min(1),
          website: z.string().url(),
          contact_email: z.string().email(),
        })
        .optional(),
      campaign: z
        .object({
          use_case: z.string().min(1),
          sample_messages: z.array(z.string()).min(1),
          opt_in_flow: z.string().min(1),
        })
        .optional(),
      business: z
        .object({
          legal_name: z.string(),
          ein: z.string(),
          website: z.string(),
          contact_email: z.string(),
          address: z.string(),
        })
        .partial()
        .optional(),
      wizard_step: z.number().int().min(1).max(5).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // 10DLC identity is workspace-level compliance data — admins/owners only.
    const { assertAction } = await import("./accountability.server");
    await assertAction(context.supabase, data.workspaceId, context.userId, "manage_limits");
    const { data: existing } = await context.supabase
      .from("registrations")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();

    const provider_refs = {
      ...((existing?.provider_refs as Record<string, unknown> | null) ?? {}),
      ...(data.brand ? { brand: data.brand } : {}),
      ...(data.campaign ? { campaign: data.campaign } : {}),
      ...(data.business ? { business: data.business } : {}),
      ...(data.wizard_step ? { wizard_step: data.wizard_step } : {}),
    };

    const payload = {
      workspace_id: data.workspaceId,
      brand_status: data.brand_status ?? existing?.brand_status ?? "pending",
      campaign_status: data.campaign_status ?? existing?.campaign_status ?? "pending",
      provider_refs: provider_refs as never,
    };

    const { error } = await context.supabase.from("registrations").upsert(payload);
    if (error) throw error;
    // Brand approval unlocks sending — the hub cares about this transition.
    if (data.brand_status === "approved" && existing?.brand_status !== "approved") {
      const { emitEvent } = await import("./events.server");
      await emitEvent(context.supabase, data.workspaceId, "brand.approved", {});
    }
    if (data.brand_status && data.brand_status !== existing?.brand_status) {
      const { logActivity } = await import("./activity.server");
      await logActivity(context.supabase, data.workspaceId, {
        type: "brand_status",
        summary: `10DLC Brand Status — ${data.brand_status.replace(/^./, (c) => c.toUpperCase())}`,
        refType: "registration",
      });
    }
    return { ok: true };
  });

// Submit the workspace's brand to Telnyx 10DLC. Persists the returned provider
// brand id so campaign submission can reference it later.
export const submitBrandToProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      brand: z.object({
        legal_name: z.string().min(1),
        ein: z.string().min(1),
        website: z.string().url(),
        contact_email: z.string().email(),
      }),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAction } = await import("./accountability.server");
    await assertAction(context.supabase, data.workspaceId, context.userId, "manage_limits");
    const { isProviderConfigured, getProvider } = await import("@/lib/sms");
    const { data: existing } = await context.supabase
      .from("registrations")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    const refs = (existing?.provider_refs as Record<string, unknown> | null) ?? {};

    let providerId: string | null = null;
    let status = "submitted";
    if (isProviderConfigured() && getProvider().submitBrand) {
      try {
        const r = await getProvider().submitBrand!({
          legalName: data.brand.legal_name,
          ein: data.brand.ein,
          website: data.brand.website,
          contactEmail: data.brand.contact_email,
        });
        providerId = r.providerId || null;
        status = r.status || "submitted";
      } catch (e) {
        throw new Error(`Brand submission failed: ${(e as Error).message}`);
      }
    }

    const nextRefs = { ...refs, brand: data.brand, brand_provider_id: providerId };
    const brandStatus = /approv/i.test(status) ? "approved" : /reject/i.test(status) ? "rejected" : "submitted";
    const { error } = await context.supabase.from("registrations").upsert({
      workspace_id: data.workspaceId,
      brand_status: brandStatus,
      campaign_status: existing?.campaign_status ?? "pending",
      provider_refs: nextRefs as never,
    });
    if (error) throw error;
    return { ok: true, providerId, status };
  });

// Submit the workspace's campaign (message samples + use case) to Telnyx 10DLC.
// Requires a previously-approved brand.
export const submitCampaignToProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      campaign: z.object({
        use_case: z.string().min(1),
        sample_messages: z.array(z.string()).min(1),
        opt_in_flow: z.string().min(1),
      }),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAction } = await import("./accountability.server");
    await assertAction(context.supabase, data.workspaceId, context.userId, "manage_limits");
    const { isProviderConfigured, getProvider } = await import("@/lib/sms");
    const { data: existing } = await context.supabase
      .from("registrations")
      .select("*")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    const refs = (existing?.provider_refs as Record<string, unknown> | null) ?? {};
    const brandProviderId = (refs.brand_provider_id as string | undefined) ?? "";

    let providerId: string | null = null;
    let status = "submitted";
    if (isProviderConfigured() && getProvider().submitCampaign && brandProviderId) {
      try {
        const r = await getProvider().submitCampaign!({
          brandProviderId,
          useCase: data.campaign.use_case,
          sampleMessages: data.campaign.sample_messages,
          optInFlow: data.campaign.opt_in_flow,
        });
        providerId = r.providerId || null;
        status = r.status || "submitted";
      } catch (e) {
        throw new Error(`Campaign submission failed: ${(e as Error).message}`);
      }
    }

    const nextRefs = { ...refs, campaign: data.campaign, campaign_provider_id: providerId };
    const campaignStatus = /approv/i.test(status) ? "approved" : /reject/i.test(status) ? "rejected" : "submitted";
    const { error } = await context.supabase.from("registrations").upsert({
      workspace_id: data.workspaceId,
      brand_status: existing?.brand_status ?? "pending",
      campaign_status: campaignStatus,
      provider_refs: nextRefs as never,
    });
    if (error) throw error;
    return { ok: true, providerId, status };
  });

// Server-enforced gate used by the campaign runner. Reads registration status
// and refuses to send until 10DLC campaign is approved.
export const isSendingAllowed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: reg } = await context.supabase
      .from("registrations")
      .select("campaign_status")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    return { allowed: reg?.campaign_status === "approved" };
  });
/**
 * Inbound call handling: forward to a real phone, or fall back to voicemail.
 * Scoped, not pool-hardcoded: "pool" is today's default, while "numbers" and
 * "campaign" reuse the same contract when narrower routing ships.
 */
export const updateInboundSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        scope: z.enum(["pool", "numbers", "campaign"]).default("pool"),
        numberIds: z.array(z.string().uuid()).min(1).optional(),
        campaignId: z.string().uuid().optional(),
        forwardCallsTo: z.string().max(20).nullable(),
        voicemailGreeting: z.string().max(500).nullable(),
        recordingEnabled: z.boolean().default(false),
        recordingDisclosure: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { assertAction } = await import("./accountability.server");
    await assertAction(context.supabase, data.workspaceId, context.userId, "manage_limits");
    const digits = data.forwardCallsTo?.replace(/[^0-9]/g, "") ?? "";
    if (data.forwardCallsTo && digits.length !== 10 && digits.length !== 11) {
      throw new Error("Enter a valid 10-digit forwarding number.");
    }
    const forward = digits ? (digits.length === 10 ? `+1${digits}` : `+${digits}`) : null;

    // Per-campaign routing: store the override on the campaign, leave the pool
    // default untouched so campaign callbacks can reach a different rep.
    if (data.scope === "campaign") {
      if (!data.campaignId) throw new Error("Pick a campaign to route callbacks for.");
      const { error: cErr } = await context.supabase
        .from("campaigns")
        .update({ forward_calls_to: forward } as never)
        .eq("id", data.campaignId)
        .eq("workspace_id", data.workspaceId);
      if (cErr) throw cErr;
      return { ok: true, forwardCallsTo: forward, scope: data.scope };
    }

    let q = context.supabase
      .from("sending_numbers")
      .update({
        forward_calls_to: forward,
        voicemail_greeting: data.voicemailGreeting?.trim() || null,
        recording_enabled: data.recordingEnabled,
        recording_disclosure: data.recordingEnabled ? data.recordingDisclosure : false,
      } as never)
      .eq("workspace_id", data.workspaceId);
    if (data.scope === "numbers" && data.numberIds?.length) q = q.in("id", data.numberIds);

    const { error } = await q;
    if (error) throw error;
    return { ok: true, forwardCallsTo: forward, scope: data.scope };
  });

/**
 * Per-number send limits and deliverability floor. The cap is enforced per DID
 * by the campaign runner, so lowering it here throttles that one number across
 * every campaign that shares it.
 */
export const updateNumberLimits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      numberId: z.string().uuid(),
      dailyCapOverride: z.number().int().min(1).max(50_000).nullable().optional(),
      minDeliveryRate: z.number().min(0).max(1).optional(),
      /** Clears an automatic pause and puts the number back in rotation. */
      resume: z.boolean().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.dailyCapOverride !== undefined) patch.daily_cap_override = data.dailyCapOverride;
    if (data.minDeliveryRate !== undefined) patch.min_delivery_rate = data.minDeliveryRate;
    if (data.resume) {
      patch.auto_paused_at = null;
      patch.auto_pause_reason = null;
      patch.status = "active";
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    // Throttles and un-pausing a number affect the whole workspace's sending.
    const { assertWriterByRow, assertAction } = await import("./accountability.server");
    const workspaceId = await assertWriterByRow(
      context.supabase, "sending_numbers", data.numberId, context.userId, "Change Number Limits",
    );
    await assertAction(context.supabase, workspaceId, context.userId, "manage_limits");
    const { error } = await context.supabase
      .from("sending_numbers")
      .update(patch as never)
      .eq("id", data.numberId);
    if (error) throw error;
    return { ok: true };
  });

/** Per-carrier delivery breakdown for one workspace's numbers. */
export const listCarrierStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ workspaceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("number_carrier_stats")
      .select("sending_number_id, carrier, sent_count, delivered_count, failed_count")
      .eq("workspace_id", data.workspaceId);
    if (error) throw error;
    return { rows: rows ?? [] };
  });
