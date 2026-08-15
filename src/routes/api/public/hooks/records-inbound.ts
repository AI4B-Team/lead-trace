// Inbox watcher for the dedicated records@ address. The mail provider posts
// replies here; we detect attachments, parse them, normalize to the records
// schema, and push them into the standard pipeline for every workspace
// subscribed to that county. Unparseable files queue for one-time mapping.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

type InboundAttachment = { filename?: string; content?: string; contentType?: string; encoding?: string };
type InboundPayload = { from?: string; subject?: string; text?: string; attachments?: InboundAttachment[] };

function verify(rawBody: string, signature: string | null): boolean {
  const secret = process.env["HUB_SIGNING_SECRET"];
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature.replace(/^sha256=/, ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function decode(att: InboundAttachment): string {
  const content = att.content ?? "";
  if ((att.encoding ?? "").toLowerCase() === "base64" || /^[A-Za-z0-9+/=\s]+$/.test(content) === false) {
    try {
      return Buffer.from(content, "base64").toString("utf8");
    } catch {
      return content;
    }
  }
  return content;
}

export const Route = createFileRoute("/api/public/hooks/records-inbound")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        if (!verify(raw, request.headers.get("x-signature") ?? request.headers.get("x-webhook-signature"))) {
          return Response.json({ error: "Invalid signature" }, { status: 401 });
        }
        let payload: InboundPayload;
        try {
          payload = JSON.parse(raw) as InboundPayload;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const from = (payload.from ?? "").toLowerCase().match(/[^<\s]+@[^>\s]+/)?.[0] ?? "";
        if (!from) return Response.json({ error: "No sender" }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: agency } = await supabaseAdmin
          .from("agency_contacts")
          .select("id")
          .ilike("email", from)
          .maybeSingle();
        if (!agency) {
          console.warn("records-inbound: unknown sender", from);
          return Response.json({ ok: true, matched: false });
        }

        const { ingestAgencyFile } = await import("@/lib/records-requests.server");
        const { agencyHandlesSurplus, ingestSurplusRequestFile } = await import(
          "@/lib/surplus/records-request-intake.server"
        );
        const agencyId = (agency as { id: string }).id;
        // Surplus lists are NOT leads: they become clerk-confirmed surplus_funds
        // rows in the distress feed, spreadsheets included.
        const surplus = await agencyHandlesSurplus(agencyId);
        const results = [];
        for (const att of payload.attachments ?? []) {
          const filename = att.filename ?? "attachment.csv";
          if (!/\.(csv|txt|xlsx|xls)$/i.test(filename)) continue;
          if (surplus) {
            try {
              results.push(
                await ingestSurplusRequestFile({
                  agencyId,
                  filename,
                  ...(/\.xlsx?$/i.test(filename)
                    ? { bytes: new Uint8Array(Buffer.from(att.content ?? "", "base64")) }
                    : { text: decode(att) }),
                }),
              );
            } catch (err) {
              results.push({ filename, status: "failed", error: err instanceof Error ? err.message : String(err) });
            }
            continue;
          }
          if (/\.xlsx?$/i.test(filename)) {
            // Spreadsheets are queued for a one-time mapping/extract by a human,
            // then remembered for that agency permanently.
            await supabaseAdmin.from("records_request_files").insert({
              agency_id: agencyId,
              filename,
              file_type: filename.split(".").pop()!.toLowerCase(),
              parse_status: "needs_mapping",
              parse_error: "Excel Attachment — Needs One-Time Extract",
            });
            results.push({ filename, status: "needs_mapping" });
            continue;
          }
          try {
            results.push(
              await ingestAgencyFile({
                agencyId,
                filename,
                text: decode(att),
              }),
            );
          } catch (err) {
            results.push({ filename, status: "failed", error: err instanceof Error ? err.message : String(err) });
          }
        }
        return Response.json({ ok: true, matched: true, results });
      },
    },
  },
});
