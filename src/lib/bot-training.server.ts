// Helpers for brand training sources. Kept out of the *.functions.ts wrapper so
// server-fn splitting cannot strip them.

const MAX_CHARS = 20000;

/** Collapse whitespace and hard-cap extracted text. */
export function normalizeContent(raw: string): string {
  return raw.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, MAX_CHARS);
}

/** Strip HTML to readable text without any DOM. */
export function htmlToText(html: string): string {
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return normalizeContent(
    body
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">"),
  );
}

export function titleFromHtml(html: string, fallback: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = m?.[1]?.trim();
  return (t && t.slice(0, 120)) || fallback;
}

/** Fetch a public page and return readable text. Never throws a raw network error. */
export async function fetchUrlText(url: string): Promise<{ title: string; content: string }> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": "LeadTraceBot/1.0 (+brand training)" } });
  } catch {
    throw new Error("Could Not Reach That URL");
  }
  if (!res.ok) throw new Error(`URL Returned ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  if (type.includes("html")) {
    const content = htmlToText(raw);
    if (!content) throw new Error("No Readable Text Found On That Page");
    return { title: titleFromHtml(raw, new URL(url).hostname), content };
  }
  const content = normalizeContent(raw);
  if (!content) throw new Error("No Readable Text Found At That URL");
  return { title: new URL(url).hostname, content };
}

/** Compact the knowledge rows into a prompt-safe brand brief. */
export function buildKnowledgeBrief(
  rows: Array<{ title: string; content: string; source_type: string; source_url?: string | null }>,
  budget = 8000,
): string {
  let used = 0;
  const parts: string[] = [];
  for (const r of rows) {
    const head = `# ${r.title}${r.source_url ? ` (${r.source_url})` : ""} [${r.source_type}]`;
    const remaining = budget - used;
    if (remaining <= 200) break;
    const body = r.content.slice(0, remaining - head.length - 2);
    parts.push(`${head}\n${body}`);
    used += head.length + body.length + 2;
  }
  return parts.join("\n\n");
}

/**
 * Answer a tire-kick question strictly from the fed knowledge. Returns
 * `answered: false` when the material does not cover it, so the UI can turn the
 * gap into a next action instead of a dead end.
 */
export async function answerFromKnowledge(opts: {
  question: string;
  knowledge: string;
  mode: "buyer" | "coaching";
}): Promise<{ answered: boolean; answer: string }> {
  if (!opts.knowledge.trim()) return { answered: false, answer: "" };
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { answered: false, answer: "" };

  const system =
    opts.mode === "buyer"
      ? `You are a business's AI assistant. Answer ONLY using the APPROVED KNOWLEDGE below. Never invent facts, prices, guarantees, or policies. If the knowledge does not clearly contain the answer, reply with exactly NO_KNOWLEDGE and nothing else. Otherwise answer in 1-3 short sentences.`
      : `You are a sales coach for the business's own team. Use the APPROVED KNOWLEDGE below for any factual claim. Never invent facts, prices, or promises. If you have no relevant material at all, reply with exactly NO_KNOWLEDGE. Otherwise give 2-4 short, concrete coaching lines.`;

  let text = "";
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        reasoning: { enabled: false },
        messages: [
          { role: "system", content: `${system}\n\nAPPROVED KNOWLEDGE:\n${opts.knowledge}` },
          { role: "user", content: opts.question },
        ],
      }),
    });
    if (!res.ok) return { answered: false, answer: "" };
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    text = (json.choices?.[0]?.message?.content ?? "").trim();
  } catch {
    return { answered: false, answer: "" };
  }
  if (!text || /NO_KNOWLEDGE/i.test(text)) return { answered: false, answer: "" };
  return { answered: true, answer: text.slice(0, 1200) };
}

/** Resolve which workspace / brand / campaign new knowledge rows belong to. */
export async function resolveKnowledgeScope(
  supabase: { from: (table: string) => any },
  data: { brandId?: string; campaignId?: string },
): Promise<{ workspace_id: string; brand_id: string | null; campaign_id: string | null }> {
  if (data.brandId) {
    const { data: brand, error } = await supabase
      .from("brands")
      .select("id, workspace_id")
      .eq("id", data.brandId)
      .maybeSingle();
    if (error) throw error;
    if (!brand) throw new Error("Brand Not Found");
    return { workspace_id: brand.workspace_id, brand_id: brand.id, campaign_id: null };
  }
  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("id, workspace_id")
    .eq("id", data.campaignId)
    .maybeSingle();
  if (error) throw error;
  if (!campaign) throw new Error("Campaign Not Found");
  return { workspace_id: campaign.workspace_id, brand_id: null, campaign_id: campaign.id };
}
