// ---------------------------------------------------------------------------
// HTTP CONNECT tunnel for the Cloudflare Workers runtime.
//
// Workers `fetch()` has no proxy option, so a residential-proxy request is done
// by hand: open a TCP socket to the proxy, CONNECT to the target host, upgrade
// the tunnel to TLS, then speak one plain HTTP/1.1 request over it.
//
// Deliberately minimal: single GET, no keep-alive, identity encoding only. It
// exists for one vendor (RealAuction) that refuses datacenter IPs.
// ---------------------------------------------------------------------------

type CfSocket = {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close: () => Promise<void>;
};

export function hasSocketRuntime(): boolean {
  return typeof (globalThis as { WebSocketPair?: unknown }).WebSocketPair !== "undefined";
}

function basicAuth(user: string, pass: string): string {
  return btoa(`${decodeURIComponent(user)}:${decodeURIComponent(pass)}`);
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function indexOfSequence(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(a.length + b.length));
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

const CRLF2 = encoder.encode("\r\n\r\n");

/** Read until the end of the HTTP header block; returns headers plus leftovers. */
async function readHead(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  seed = new Uint8Array(0),
): Promise<{ head: string; rest: Uint8Array<ArrayBuffer> }> {
  let buf = concat(seed, new Uint8Array(0));
  for (;;) {
    const at = indexOfSequence(buf, CRLF2);
    if (at >= 0) {
      return {
        head: decoder.decode(buf.slice(0, at)),
        rest: concat(buf.slice(at + 4), new Uint8Array(0)),
      };
    }
    const { value, done } = await reader.read();
    if (done) throw new Error("proxy closed the connection before headers completed");
    buf = concat(buf, value!);
  }
}

function parseChunked(body: Uint8Array): Uint8Array<ArrayBuffer> {
  let out = concat(new Uint8Array(0), new Uint8Array(0));
  let i = 0;
  for (;;) {
    const nl = indexOfSequence(body, encoder.encode("\r\n"), i);
    if (nl < 0) break;
    const size = parseInt(decoder.decode(body.slice(i, nl)).trim().split(";")[0] ?? "", 16);
    if (!Number.isFinite(size) || size === 0) break;
    const start = nl + 2;
    out = concat(out, body.slice(start, start + size));
    i = start + size + 2;
  }
  return out;
}

/**
 * One proxied GET in forward-proxy mode: the request line carries the absolute
 * URI and the proxy fetches it for us.
 *
 * Why not CONNECT + TLS: Workers' `startTls()` derives its SNI from the socket's
 * original hostname (the proxy), so the vendor rejects the handshake. The vendor
 * serves the identical public-records pages over plain HTTP on the same host, so
 * the proxy hop is made in the clear and the tunnel problem disappears. Nothing
 * confidential is sent — no credentials, no query beyond the auction date.
 */
export async function tunnelFetch(
  targetUrl: string,
  proxyUrl: string,
  headers: Record<string, string>,
): Promise<Response> {
  const target = new URL(targetUrl);
  target.protocol = "http:";
  const proxy = new URL(proxyUrl);

  const { connect } = (await import(/* @vite-ignore */ "cloudflare:sockets" as string)) as {
    connect: (a: { hostname: string; port: number }) => CfSocket;
  };
  const socket = connect({ hostname: proxy.hostname, port: Number(proxy.port || 8080) });

  const lines = [
    `GET ${target.href} HTTP/1.1`,
    `Host: ${target.host}`,
    "Connection: close",
    "Accept-Encoding: identity",
  ];
  if (proxy.username) {
    lines.push(`Proxy-Authorization: Basic ${basicAuth(proxy.username, proxy.password)}`);
  }
  for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);

  const writer = socket.writable.getWriter();
  await writer.write(encoder.encode(`${lines.join("\r\n")}\r\n\r\n`));
  writer.releaseLock();

  const reader = socket.readable.getReader();
  const { head, rest } = await readHead(reader);
  let body: Uint8Array<ArrayBuffer> = rest;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    body = concat(body, value!);
  }
  reader.releaseLock();
  await socket.close().catch(() => {});

  const headLines = head.split("\r\n");
  const status = Number(headLines[0]?.split(" ")[1] ?? 0) || 502;
  const resHeaders = new Headers();
  for (const line of headLines.slice(1)) {
    const at = line.indexOf(":");
    if (at > 0) {
      const name = line.slice(0, at).trim();
      // Hop-by-hop / body-framing headers describe the proxy hop, not our Response.
      if (/^(transfer-encoding|connection|content-length|content-encoding)$/i.test(name)) continue;
      resHeaders.append(name, line.slice(at + 1).trim());
    }
  }
  if (/transfer-encoding:\s*chunked/i.test(head)) body = parseChunked(body);

  return new Response(body as BodyInit, { status, headers: resHeaders });
}
