import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatLocation } from "@/lib/location";

// 30-day rollup: outbound sent, delivered, replies, opt-outs bucketed by day.
// Also returns per-campaign funnels and per-number health.
export const getWorkspaceAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      days: z.number().int().min(7).max(90).default(30),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const since = new Date();
    since.setDate(since.getDate() - data.days);
    const sinceIso = since.toISOString();

    const { data: msgs, error } = await context.supabase
      .from("messages")
      .select("direction, status, is_optout, created_at, sending_number_id, campaign_id")
      .eq("workspace_id", data.workspaceId)
      .gte("created_at", sinceIso);
    if (error) throw error;

    // Daily buckets
    const daily = new Map<string, { day: string; sent: number; delivered: number; replies: number; optOuts: number }>();
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      daily.set(key, { day: key, sent: 0, delivered: 0, replies: 0, optOuts: 0 });
    }
    for (const m of msgs ?? []) {
      const key = (m.created_at ?? "").slice(0, 10);
      const bucket = daily.get(key);
      if (!bucket) continue;
      if (m.direction === "outbound") bucket.sent += 1;
      if (m.status === "delivered") bucket.delivered += 1;
      if (m.direction === "inbound") bucket.replies += 1;
      if (m.is_optout) bucket.optOuts += 1;
    }

    // Totals
    const totals = { sent: 0, delivered: 0, replies: 0, optOuts: 0 };
    for (const b of daily.values()) {
      totals.sent += b.sent;
      totals.delivered += b.delivered;
      totals.replies += b.replies;
      totals.optOuts += b.optOuts;
    }
    const replyRate = totals.sent ? totals.replies / totals.sent : 0;
    const deliverRate = totals.sent ? totals.delivered / totals.sent : 0;
    const optOutRate = totals.sent ? totals.optOuts / totals.sent : 0;

    // Per-campaign funnel
    const campaignAgg = new Map<string, { sent: number; delivered: number; replies: number; optOuts: number }>();
    for (const m of msgs ?? []) {
      if (!m.campaign_id) continue;
      const cur = campaignAgg.get(m.campaign_id) ?? { sent: 0, delivered: 0, replies: 0, optOuts: 0 };
      if (m.direction === "outbound") cur.sent += 1;
      if (m.status === "delivered") cur.delivered += 1;
      if (m.direction === "inbound") cur.replies += 1;
      if (m.is_optout) cur.optOuts += 1;
      campaignAgg.set(m.campaign_id, cur);
    }
    const campaignIds = Array.from(campaignAgg.keys());
    const { data: campRows } = campaignIds.length
      ? await context.supabase.from("campaigns").select("id, name, status").in("id", campaignIds)
      : { data: [] as { id: string; name: string; status: string | null }[] };
    const campaigns = (campRows ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status ?? "draft",
      ...(campaignAgg.get(c.id) ?? { sent: 0, delivered: 0, replies: 0, optOuts: 0 }),
    })).sort((a, b) => b.sent - a.sent).slice(0, 10);

    // Per-number health snapshot
    const { data: numbers } = await context.supabase
      .from("sending_numbers")
      .select("id, phone, status, health_score, activated_at")
      .eq("workspace_id", data.workspaceId)
      .order("health_score", { ascending: false })
      .limit(20);

    return {
      daily: Array.from(daily.values()),
      totals,
      rates: { replyRate, deliverRate, optOutRate },
      campaigns,
      numbers: numbers ?? [],
    };
  });
// Business-level performance rollup: conversations, qualified replies,
// appointments and projected pipeline, plus prior-period comparison, intent
// funnel, best-performing copy, live conversation feed and AI insights.
export const getWorkspacePerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      workspaceId: z.string().uuid(),
      days: z.number().int().min(7).max(90).default(30),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const {
      classifyIntent,
      pipelineValue,
      projectedClosed,
      delta,
      MIN_HISTORY_EVENTS,
      HOUR_BANDS,
      WEEKDAYS,
    } = await import("@/lib/performance-intel");

    const now = new Date();
    const since = new Date(now);
    since.setDate(since.getDate() - data.days);
    const prevSince = new Date(now);
    prevSince.setDate(prevSince.getDate() - data.days * 2);

    const { data: msgs, error } = await context.supabase
      .from("messages")
      .select("id, body, direction, status, is_optout, is_bot, created_at, campaign_id, lead_id, thread_key, sending_number_id")
      .eq("workspace_id", data.workspaceId)
      .gte("created_at", prevSince.toISOString())
      .order("created_at", { ascending: false });
    if (error) throw error;

    const all = msgs ?? [];
    const inWindow = all.filter((m) => new Date(m.created_at) >= since);
    const prevWindow = all.filter((m) => new Date(m.created_at) < since);

    type Bucket = {
      sent: number;
      delivered: number;
      replies: number;
      optOuts: number;
      conversations: number;
      qualified: number;
      appointments: number;
    };
    const emptyBucket = (): Bucket => ({
      sent: 0, delivered: 0, replies: 0, optOuts: 0, conversations: 0, qualified: 0, appointments: 0,
    });

    const summarize = (rows: typeof all) => {
      const b = emptyBucket();
      const threads = new Set<string>();
      for (const m of rows) {
        if (m.direction === "outbound") b.sent += 1;
        if (m.status === "delivered") b.delivered += 1;
        if (m.is_optout) b.optOuts += 1;
        if (m.direction === "inbound") {
          b.replies += 1;
          threads.add(m.thread_key ?? m.lead_id ?? m.id);
          const intent = classifyIntent(m.body, m.is_optout);
          if (intent === "appointment") b.appointments += 1;
          if (intent === "appointment" || intent === "qualified") b.qualified += 1;
        }
      }
      b.conversations = threads.size;
      return b;
    };

    const current = summarize(inWindow);
    const previous = summarize(prevWindow);

    // Daily series with business metrics layered on top of volume.
    const dailyMap = new Map<string, Bucket & { day: string; revenue: number }>();
    const threadsByDay = new Map<string, Set<string>>();
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, { day: key, revenue: 0, ...emptyBucket() });
      threadsByDay.set(key, new Set());
    }
    for (const m of inWindow) {
      const key = m.created_at.slice(0, 10);
      const b = dailyMap.get(key);
      if (!b) continue;
      if (m.direction === "outbound") b.sent += 1;
      if (m.status === "delivered") b.delivered += 1;
      if (m.is_optout) b.optOuts += 1;
      if (m.direction === "inbound") {
        b.replies += 1;
        threadsByDay.get(key)?.add(m.thread_key ?? m.lead_id ?? m.id);
        const intent = classifyIntent(m.body, m.is_optout);
        if (intent === "appointment") b.appointments += 1;
        if (intent === "appointment" || intent === "qualified") b.qualified += 1;
      }
    }
    for (const [key, b] of dailyMap) {
      b.conversations = threadsByDay.get(key)?.size ?? 0;
      b.revenue = pipelineValue(b.appointments);
    }

    // Campaign leaderboard ranked by appointments, then replies.
    const campAgg = new Map<string, Bucket>();
    for (const m of inWindow) {
      if (!m.campaign_id) continue;
      const cur = campAgg.get(m.campaign_id) ?? emptyBucket();
      if (m.direction === "outbound") cur.sent += 1;
      if (m.status === "delivered") cur.delivered += 1;
      if (m.is_optout) cur.optOuts += 1;
      if (m.direction === "inbound") {
        cur.replies += 1;
        const intent = classifyIntent(m.body, m.is_optout);
        if (intent === "appointment") cur.appointments += 1;
        if (intent === "appointment" || intent === "qualified") cur.qualified += 1;
      }
      campAgg.set(m.campaign_id, cur);
    }
    const campaignIds = Array.from(campAgg.keys());
    const { data: campRows } = campaignIds.length
      ? await context.supabase.from("campaigns").select("id, name, status").in("id", campaignIds)
      : { data: [] as { id: string; name: string; status: string | null }[] };
    const campaigns = (campRows ?? [])
      .map((c) => {
        const b = campAgg.get(c.id) ?? emptyBucket();
        return {
          id: c.id,
          name: c.name,
          status: c.status ?? "draft",
          ...b,
          replyRate: b.sent ? b.replies / b.sent : 0,
          optOutRate: b.sent ? b.optOuts / b.sent : 0,
        };
      })
      .sort((a, b) => b.appointments - a.appointments || b.replies - a.replies)
      .slice(0, 6);

    // Best-performing outbound copy: reply rate of the thread it opened.
    const repliedThreads = new Set(
      inWindow.filter((m) => m.direction === "inbound").map((m) => m.thread_key ?? m.lead_id ?? m.id),
    );
    const copyAgg = new Map<string, { body: string; sent: number; replies: number; campaigns: Set<string> }>();
    for (const m of inWindow) {
      if (m.direction !== "outbound" || !m.body) continue;
      const key = m.body.slice(0, 160);
      const cur = copyAgg.get(key) ?? { body: m.body, sent: 0, replies: 0, campaigns: new Set<string>() };
      cur.sent += 1;
      if (repliedThreads.has(m.thread_key ?? m.lead_id ?? m.id)) cur.replies += 1;
      if (m.campaign_id) cur.campaigns.add(m.campaign_id);
      copyAgg.set(key, cur);
    }
    const bestMessage = Array.from(copyAgg.values())
      .filter((c) => c.sent >= 1)
      .map((c) => ({
        body: c.body,
        sent: c.sent,
        replies: c.replies,
        replyRate: c.sent ? c.replies / c.sent : 0,
        campaigns: c.campaigns.size,
      }))
      .sort((a, b) => b.replyRate - a.replyRate || b.sent - a.sent)[0] ?? null;

    // Live conversation feed: newest inbound per thread with intent label.
    const seenThreads = new Set<string>();
    const inboundRows = inWindow.filter((m) => m.direction === "inbound");
    const leadIds = Array.from(new Set(inboundRows.map((m) => m.lead_id).filter((v): v is string => !!v))).slice(0, 40);
    const { data: leadRows } = leadIds.length
      ? await context.supabase.from("leads").select("id, full_name, business_name, city, state").in("id", leadIds)
      : { data: [] as Array<{ id: string; full_name: string | null; business_name: string | null; city: string | null; state: string | null }> };
    const leadMap = new Map((leadRows ?? []).map((l) => [l.id, l]));
    const recent: Array<{ id: string; name: string; place: string; body: string; intent: string; at: string }> = [];
    for (const m of inboundRows) {
      const tk = m.thread_key ?? m.lead_id ?? m.id;
      if (seenThreads.has(tk)) continue;
      seenThreads.add(tk);
      const lead = m.lead_id ? leadMap.get(m.lead_id) : undefined;
      recent.push({
        id: m.id,
        name: lead?.full_name ?? lead?.business_name ?? "Unknown Lead",
        place: formatLocation(lead?.city, lead?.state),
        body: m.body ?? "",
        intent: classifyIntent(m.body, m.is_optout),
        at: m.created_at,
      });
      if (recent.length >= 8) break;
    }

    // Timing intelligence: which hour band and weekday reply best.
    const bandStats = HOUR_BANDS.map((band) => ({ label: band.label, sent: 0, replies: 0 }));
    const dayStats = WEEKDAYS.map((label) => ({ label, sent: 0, replies: 0 }));
    for (const m of inWindow) {
      const d = new Date(m.created_at);
      const bandIdx = HOUR_BANDS.findIndex((b) => d.getHours() >= b.from && d.getHours() < b.to);
      const band = bandIdx >= 0 ? bandStats[bandIdx] : undefined;
      const dayRow = dayStats[d.getDay()];
      if (m.direction === "outbound") {
        if (band) band.sent += 1;
        if (dayRow) dayRow.sent += 1;
      } else if (m.direction === "inbound") {
        if (band) band.replies += 1;
        if (dayRow) dayRow.replies += 1;
      }
    }
    const rate = (r: { sent: number; replies: number }) => (r.sent ? r.replies / r.sent : 0);
    const bestBand = [...bandStats].sort((a, b) => rate(b) - rate(a))[0] ?? null;
    const bestDay = [...dayStats].sort((a, b) => rate(b) - rate(a))[0] ?? null;

    // Number health buckets.
    const { data: numbers } = await context.supabase
      .from("sending_numbers")
      .select("id, phone, status, health_score, optout_rate, activated_at")
      .eq("workspace_id", data.workspaceId)
      .order("health_score", { ascending: false })
      .limit(24);
    const numberRows = numbers ?? [];
    const healthy = numberRows.filter((n) => (n.health_score ?? 0) >= 80 && n.status !== "cooling").length;
    const cooling = numberRows.filter((n) => n.status === "cooling").length;
    const flagged = numberRows.filter((n) => (n.health_score ?? 100) < 50).length;
    const avgReputation = numberRows.length
      ? Math.round(numberRows.reduce((n, r) => n + Number(r.health_score ?? 0), 0) / numberRows.length)
      : 0;

    /**
     * Per-number deliverability. Outbound rows attribute sends/delivery, and
     * an inbound reply is credited to the number it came back on, so rotation
     * problems ("one DID is eating the opt-outs") are visible per DID.
     */
    const numAgg = new Map<string, Bucket>();
    for (const m of inWindow) {
      if (!m.sending_number_id) continue;
      const cur = numAgg.get(m.sending_number_id) ?? emptyBucket();
      if (m.direction === "outbound") cur.sent += 1;
      if (m.status === "delivered") cur.delivered += 1;
      if (m.is_optout) cur.optOuts += 1;
      if (m.direction === "inbound") cur.replies += 1;
      numAgg.set(m.sending_number_id, cur);
    }
    const byNumber = numberRows
      .map((n) => {
        const b = numAgg.get(n.id) ?? emptyBucket();
        return {
          id: n.id,
          phone: n.phone,
          status: n.status ?? "active",
          health: Number(n.health_score ?? 0),
          sent: b.sent,
          delivered: Math.min(b.delivered, b.sent),
          replies: b.replies,
          optOuts: b.optOuts,
          deliverRate: b.sent ? Math.min(b.delivered, b.sent) / b.sent : 0,
          replyRate: b.sent ? b.replies / b.sent : 0,
          optOutRate: b.sent ? b.optOuts / b.sent : 0,
        };
      })
      .filter((n) => n.sent > 0)
      .sort((a, b) => b.sent - a.sent);

    /**
     * A/B variant table: distinct outbound openers ranked by reply rate. Each
     * distinct body is a variant, which is exactly what spintax / A-B copy
     * produces, so no separate variant column is needed to compare them.
     */
    const variants = Array.from(copyAgg.values())
      .map((c) => ({
        body: c.body,
        sent: c.sent,
        replies: c.replies,
        replyRate: c.sent ? c.replies / c.sent : 0,
        campaigns: c.campaigns.size,
      }))
      .sort((a, b) => b.sent - a.sent || b.replyRate - a.replyRate)
      .slice(0, 8);

    // Contacts reached in the window (unique threads touched outbound).
    const contacts = new Set(
      inWindow.filter((m) => m.direction === "outbound").map((m) => m.thread_key ?? m.lead_id ?? m.id),
    ).size;

    const kpis = {
      conversations: current.conversations,
      qualified: current.qualified,
      appointments: current.appointments,
      pipeline: pipelineValue(current.appointments),
      sent: current.sent,
      delivered: current.delivered,
      replies: current.replies,
      optOuts: current.optOuts,
      replyRate: current.sent ? current.replies / current.sent : 0,
      deliverRate: current.sent ? current.delivered / current.sent : 0,
      optOutRate: current.sent ? current.optOuts / current.sent : 0,
    };
    // Comparisons are only honest when the prior period actually has history.
    const historyReady = previous.sent >= MIN_HISTORY_EVENTS;
    const cmp = (c: number, p: number) => (historyReady ? delta(c, p) : null);
    const deltas = {
      conversations: cmp(current.conversations, previous.conversations),
      qualified: cmp(current.qualified, previous.qualified),
      appointments: cmp(current.appointments, previous.appointments),
      pipeline: cmp(pipelineValue(current.appointments), pipelineValue(previous.appointments)),
      sent: cmp(current.sent, previous.sent),
      replyRate: cmp(
        current.sent ? current.replies / current.sent : 0,
        previous.sent ? previous.replies / previous.sent : 0,
      ),
      deliverRate: cmp(
        current.sent ? current.delivered / current.sent : 0,
        previous.sent ? previous.delivered / previous.sent : 0,
      ),
      optOutRate: cmp(
        current.sent ? current.optOuts / current.sent : 0,
        previous.sent ? previous.optOuts / previous.sent : 0,
      ),
    };

    /**
     * Funnel stages. Multiple touches per contact is legitimate, so the send
     * stage carries a per-contact ratio instead of a ">100% of previous" read.
     * Every later stage is a true subset and clamped to its parent.
     */
    const delivered = Math.min(current.delivered, current.sent);
    const replies = Math.min(current.replies, Math.max(delivered, 0));
    const qualified = Math.min(current.qualified, replies);
    const appointments = Math.min(current.appointments, qualified);
    const closed = Math.min(projectedClosed(appointments), appointments);
    const funnel = [
      { label: "Contacts Messaged", value: contacts, basis: "top" as const },
      {
        label: "Messages Sent",
        value: current.sent,
        basis: "perContact" as const,
        note: contacts ? `${(current.sent / contacts).toFixed(1)} Msgs/Contact` : undefined,
      },
      { label: "Delivered", value: delivered, basis: "subset" as const },
      { label: "Replies", value: replies, basis: "subset" as const },
      { label: "Qualified", value: qualified, basis: "subset" as const },
      {
        label: "Appointments",
        value: appointments,
        basis: "subset" as const,
        empty: "No Appointments Booked Yet — They Appear Here Once Leads Schedule.",
      },
      {
        label: "Projected Closed",
        value: closed,
        basis: "subset" as const,
        empty: "Projected Closes Build From Booked Appointments.",
      },
    ];

    // AI insights derived from the same aggregates.
    const insights: Array<{ text: string; action?: string; campaignId?: string }> = [];
    // Thin samples are labelled as early signals rather than stated as fact.
    const thin = current.replies < 10;
    const sampleNote = ` (Early Signal, ${current.replies} Repl${current.replies === 1 ? "y" : "ies"})`;
    if (bestBand && bestBand.sent >= 3 && bestBand.replies > 0) {
      insights.push({
        text: `Replies Peak Between ${bestBand.label} — ${(rate(bestBand) * 100).toFixed(0)}% Reply Rate In That Window.${thin ? sampleNote : ""}`,
      });
    }
    if (bestDay && bestDay.sent >= 3 && bestDay.replies > 0) {
      insights.push({
        text: `${bestDay.label} Is Your Strongest Send Day At ${(rate(bestDay) * 100).toFixed(0)}% Reply Rate.${thin ? sampleNote : ""}`,
      });
    }
    const winner = campaigns[0];
    if (winner && winner.appointments > 0) {
      insights.push({ text: `"${winner.name}" Leads With ${winner.appointments} Appointment${winner.appointments === 1 ? "" : "s"} At ${(winner.replyRate * 100).toFixed(0)}% Reply Rate.` });
    }
    const laggard = [...campaigns].filter((c) => c.sent >= 10).sort((a, b) => a.replyRate - b.replyRate)[0];
    if (laggard && laggard.replyRate < 0.05) {
      insights.push({
        text: `"${laggard.name}" Is Underperforming At ${(laggard.replyRate * 100).toFixed(0)}% Reply Rate.`,
        action: "Rewrite Touch 1",
        campaignId: laggard.id,
      });
    }
    const hotOptOut = campaigns.find((c) => c.optOutRate > 0.05);
    if (hotOptOut) {
      insights.push({ text: `"${hotOptOut.name}" Opt-Outs Are Above 5% — Cool The Pool Or Soften The Opener.`, action: "Review Campaign", campaignId: hotOptOut.id });
    }
    if (bestMessage && bestMessage.replyRate > 0) {
      insights.push({
        text: `Your Best Opener Replies At ${(bestMessage.replyRate * 100).toFixed(0)}% — Reuse It Across New Campaigns.${
          bestMessage.sent < 10 ? ` (Early Signal, ${bestMessage.sent} Sent)` : ""
        }`,
      });
    }
    if (!insights.length) {
      insights.push({ text: "Not Enough Sending History Yet — Launch A Campaign And Insights Appear Within A Day." });
    }

    return {
      days: data.days,
      kpis,
      deltas,
      historyReady,
      daily: Array.from(dailyMap.values()),
      funnel,
      campaigns,
      bestMessage,
      recent,
      insights,
      timing: { bands: bandStats.map((b) => ({ ...b, rate: rate(b) })), bestBand: bestBand?.label ?? null, bestDay: bestDay?.label ?? null },
      numbers: { rows: numberRows, healthy, cooling, flagged, avgReputation, rotation: numberRows.length > 1 },
      byNumber,
      variants,
    };
  });
