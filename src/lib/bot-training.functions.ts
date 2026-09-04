import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { knowledgeScope } from "@/lib/bot-training.shared";

/** List every brand-training source in the given scope. */
export const listBotKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => knowledgeScope.parse(input))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("bot_knowledge")
      .select("id, source_type, category, title, source_url, content, created_at")
      .order("created_at", { ascending: false });
    q = data.brandId ? q.eq("brand_id", data.brandId) : q.eq("campaign_id", data.campaignId!);
    const { data: rows, error } = await q;
    if (error) throw error;
    return (rows ?? []).map((r) => ({
      id: r.id,
      source_type: r.source_type,
      category: r.category ?? "other",
      title: r.title,
      source_url: r.source_url,
      created_at: r.created_at,
      chars: (r.content ?? "").length,
      excerpt: (r.content ?? "").slice(0, 240),
    }));
  });

/** Add one or many pasted / dictated / file-extracted sources in a single call. */
export const addBotKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      brandId: z.string().uuid().optional(),
      campaignId: z.string().uuid().optional(),
      items: z
        .array(
          z.object({
            source_type: z.enum(["text", "voice", "file", "url"]),
            category: z.string().max(40).optional(),
            title: z.string().min(1).max(160),
            content: z.string().min(1).max(200000),
            source_url: z.string().max(600).optional(),
          }),
        )
        .min(1)
        .max(25),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { resolveKnowledgeScope } = await import("@/lib/bot-training.server");
    const target = await resolveKnowledgeScope(context.supabase, data);
    const { normalizeContent } = await import("@/lib/bot-training.server");
    const rows = data.items
      .map((i) => ({
        ...target,
        source_type: i.source_type,
        category: i.category?.trim() || "other",
        title: i.title.trim(),
        source_url: i.source_url?.trim() || null,
        content: normalizeContent(i.content),
      }))
      .filter((r) => r.content.length > 0);

    if (!rows.length) throw new Error("Nothing Readable To Train On");
    const { error } = await context.supabase.from("bot_knowledge").insert(rows as never);
    if (error) throw error;
    return { added: rows.length };
  });

/** Crawl one or more public URLs server-side and store the readable text. */
export const addBotKnowledgeFromUrls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      brandId: z.string().uuid().optional(),
      campaignId: z.string().uuid().optional(),
      category: z.string().max(40).optional(),
      urls: z.array(z.string().url().max(600)).min(1).max(10),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { resolveKnowledgeScope } = await import("@/lib/bot-training.server");
    const target = await resolveKnowledgeScope(context.supabase, data);
    const { fetchUrlText } = await import("@/lib/bot-training.server");
    const ok: Array<{ title: string; content: string; url: string }> = [];
    const failed: Array<{ url: string; reason: string }> = [];
    for (const url of data.urls) {
      try {
        const r = await fetchUrlText(url);
        ok.push({ ...r, url });
      } catch (e) {
        failed.push({ url, reason: e instanceof Error ? e.message : "Fetch Failed" });
      }
    }
    if (ok.length) {
      const { error } = await context.supabase.from("bot_knowledge").insert(
        ok.map((r) => ({
          ...target,
          source_type: "url",
          category: data.category?.trim() || "website",
          title: r.title,
          source_url: r.url,
          content: r.content,
        })) as never,
      );
      if (error) throw error;
    }
    return { added: ok.length, failed };
  });

export const deleteBotKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("bot_knowledge").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Tire-kick the agent: answer strictly from the brand's approved knowledge. */
export const askAgentQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        brandId: z.string().uuid(),
        question: z.string().min(1).max(400),
        mode: z.enum(["buyer", "coaching"]).default("buyer"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("bot_knowledge")
      .select("title, content, source_type, source_url")
      .eq("brand_id", data.brandId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    const { buildKnowledgeBrief, answerFromKnowledge } = await import("@/lib/bot-training.server");
    const outcome = await answerFromKnowledge({
      question: data.question,
      mode: data.mode,
      knowledge: buildKnowledgeBrief(rows ?? []),
    });
    return { ...outcome, sourceCount: rows?.length ?? 0 };
  });
