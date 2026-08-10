// ---------------------------------------------------------------------------
// Raw HTTP CONNECT tunnel for the residential proxy.
//
// Why: Deno Deploy does not honour `Deno.createHttpClient({ proxy })` — the
// request leaves un-proxied and the vendor's load balancer closes the TLS
// handshake ("tls handshake eof"). Deno.connect + Deno.startTls IS supported
// there, and unlike Cloudflare Workers, startTls accepts an explicit hostname,
// so SNI matches the vendor and the handshake succeeds.
//
// PROXY_URL and its credentials are never logged or returned.
// ---------------------------------------------------------------------------

export type TunnelResponse = {
  status: number;
  contentType: string;
  body: string;
  bytes: number;
};

function proxyParts(proxyUrl: string) {
  const u = new URL(proxyUrl);
  const port = Number(u.port || (u.protocol === "https:" ? 443 : 80));
  const auth =
    u.username || u.password
      ? btoa(`${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}`)
      : null;
  return { hostname: u.hostname, port, auth };
}

async function readUntilHeadersEnd(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const chunks: Uint8Array[] = [];
  let buf = new Uint8Array(0);
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    const merged = new Uint8Array(buf.length + value.length);
    merged.set(buf);
    merged.set(value, buf.length);
    buf = merged;
    const text = new TextDecoder().decode(buf);
    const idx = text.indexOf("\r\n\r\n");
    if (idx >= 0) return { head: text.slice(0, idx), rest: buf.slice(new TextEncoder().encode(text.slice(0, idx + 4)).length) };
  }
  return { head: new TextDecoder().decode(buf), rest: new Uint8Array(0) };
}

async function drain(reader: ReadableStreamDefaultReader<Uint8Array>, first: Uint8Array, limit: number) {
  const parts: Uint8Array[] = first.length ? [first] : [];
  let total = first.length;
  while (total < limit) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    parts.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p.subarray(0, Math.min(p.length, total - off)), off);
    off += p.length;
  }
  return out;
}

function dechunk(body: string): string {
  let out = "";
  let i = 0;
  for (;;) {
    const nl = body.indexOf("\r\n", i);
    if (nl < 0) break;
    const size = parseInt(body.slice(i, nl).trim().split(";")[0] ?? "", 16);
    if (!Number.isFinite(size) || size <= 0) break;
    out += body.slice(nl + 2, nl + 2 + size);
    i = nl + 2 + size + 2;
  }
  return out || body;
}

/** One GET through the proxy using CONNECT + TLS. Follows same-vendor redirects. */
export async function tunnelGet(
  proxyUrl: string,
  target: string,
  headers: Record<string, string>,
  limit: number,
  hops = 3,
): Promise<TunnelResponse> {
  const url = new URL(target);
  const port = Number(url.port || (url.protocol === "http:" ? 80 : 443));
  const p = proxyParts(proxyUrl);

  const raw = await Deno.connect({ hostname: p.hostname, port: p.port });
  let conn: Deno.Conn = raw;
  try {
    if (url.protocol === "https:") {
      const lines = [
        `CONNECT ${url.hostname}:${port} HTTP/1.1`,
        `Host: ${url.hostname}:${port}`,
      ];
      if (p.auth) lines.push(`Proxy-Authorization: Basic ${p.auth}`);
      lines.push("Proxy-Connection: keep-alive", "", "");
      await raw.write(new TextEncoder().encode(lines.join("\r\n")));
      const rawReader = raw.readable.getReader();
      const { head } = await readUntilHeadersEnd(rawReader);
      rawReader.releaseLock();
      const code = Number(/HTTP\/1\.[01] (\d{3})/.exec(head)?.[1] ?? 0);
      if (code !== 200) throw new Error(`proxy CONNECT refused with status ${code || "unknown"}`);
      conn = await Deno.startTls(raw, { hostname: url.hostname });
    }

    const reqLines = [
      `GET ${url.pathname}${url.search} HTTP/1.1`,
      `Host: ${url.hostname}`,
      "Connection: close",
      "Accept-Encoding: identity",
      ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
      "",
      "",
    ];
    await conn.write(new TextEncoder().encode(reqLines.join("\r\n")));

    const reader = conn.readable.getReader();
    const { head, rest } = await readUntilHeadersEnd(reader);
    const bodyBytes = await drain(reader, rest, limit);
    reader.releaseLock();

    const status = Number(/HTTP\/1\.[01] (\d{3})/.exec(head)?.[1] ?? 0);
    const headerLines = head.split("\r\n").slice(1);
    const get = (name: string) =>
      headerLines.find((l) => l.toLowerCase().startsWith(`${name}:`))?.slice(name.length + 1).trim() ?? "";
    const location = get("location");
    if (status >= 300 && status < 400 && location && hops > 0) {
      const next = new URL(location, url).toString();
      try { conn.close(); } catch { /* already closed */ }
      return tunnelGet(proxyUrl, next, headers, limit, hops - 1);
    }

    let body = new TextDecoder().decode(bodyBytes);
    if (get("transfer-encoding").toLowerCase().includes("chunked")) body = dechunk(body);
    return {
      status,
      contentType: get("content-type") || "text/html",
      body,
      bytes: bodyBytes.length,
    };
  } finally {
    try { conn.close(); } catch { /* already closed */ }
  }
}