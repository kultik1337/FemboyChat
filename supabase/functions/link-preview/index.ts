// link-preview — server-side Open Graph fetcher for FemboyChat message links.
//
// The browser can't read og:-tags of arbitrary sites because of CORS, so the
// client calls this function: POST { url } -> { ok, title, description, image,
// siteName }. Results are cached in-memory per instance.
//
// Safety: only http/https, no redirects to private hosts, small read limit and
// a short timeout. Requires a valid project JWT (verify_jwt = true).

const TIMEOUT_MS = 6000;
const MAX_BYTES = 400_000;
const cache = new Map<string, { at: number; data: Preview | null }>();
const TTL = 15 * 60_000;

type Preview = { title: string; description: string; image: string; siteName: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
    },
  });
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254)) return true;
  }
  if (h.includes(":")) return true; // raw IPv6 literals — just skip
  return false;
}

function pick(html: string, patterns: RegExp[]): string {
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeEntities(m[1].trim());
  }
  return "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function metaRe(prop: string): RegExp[] {
  return [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"),
  ];
}

/** YouTube blocks bots with consent pages, but its oEmbed endpoint is open. */
function youtubeVideoUrl(u: URL): string | null {
  const h = u.hostname.replace(/^www\.|^m\./, "");
  if (h === "youtu.be" && u.pathname.length > 1) return `https://www.youtube.com/watch?v=${u.pathname.slice(1)}`;
  if (h === "youtube.com") {
    if (u.pathname === "/watch" && u.searchParams.get("v")) return `https://www.youtube.com/watch?v=${u.searchParams.get("v")}`;
    const short = u.pathname.match(/^\/(shorts|embed|live)\/([\w-]{5,})/);
    if (short) return `https://www.youtube.com/watch?v=${short[2]}`;
  }
  return null;
}

async function fetchOEmbed(endpoint: string, videoUrl: string, siteName: string, ctrl: AbortController): Promise<Preview | null> {
  const r = await fetch(`${endpoint}?url=${encodeURIComponent(videoUrl)}&format=json`, {
    signal: ctrl.signal,
    headers: { accept: "application/json" },
  });
  if (!r.ok) return null;
  const d = await r.json();
  if (!d?.title) return null;
  return {
    title: String(d.title).slice(0, 200),
    description: d.author_name ? `${d.author_name}` : "",
    image: typeof d.thumbnail_url === "string" ? d.thumbnail_url : "",
    siteName,
  };
}

async function fetchPreview(target: string): Promise<Preview | null> {
  const u = new URL(target);
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (isPrivateHost(u.hostname)) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // YouTube: og-scraping hits consent/bot pages -> use the official oEmbed API.
    const yt = youtubeVideoUrl(u);
    if (yt) {
      const p = await fetchOEmbed("https://www.youtube.com/oembed", yt, "YouTube", ctrl).catch(() => null);
      if (p) return p;
    }
    const r = await fetch(u.toString(), {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!r.ok) return null;
    if (isPrivateHost(new URL(r.url).hostname)) return null;
    const ct = r.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) return null;

    // read at most MAX_BYTES
    const reader = r.body?.getReader();
    if (!reader) return null;
    let html = "";
    let bytes = 0;
    const dec = new TextDecoder();
    while (bytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      html += dec.decode(value, { stream: true });
      if (html.includes("</head>")) break;
    }
    void reader.cancel().catch(() => {});

    const title = pick(html, [...metaRe("og:title"), ...metaRe("twitter:title"), /<title[^>]*>([^<]{1,300})<\/title>/i]);
    const description = pick(html, [...metaRe("og:description"), ...metaRe("twitter:description"), ...metaRe("description")]);
    let image = pick(html, [...metaRe("og:image"), ...metaRe("twitter:image")]);
    const siteName = pick(html, metaRe("og:site_name")) || u.hostname.replace(/^www\./, "");
    if (image && !/^https?:\/\//i.test(image)) {
      try { image = new URL(image, r.url).toString(); } catch { image = ""; }
    }
    if (!title && !description) return null;
    return { title: title.slice(0, 200), description: description.slice(0, 300), image, siteName: siteName.slice(0, 80) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let url: string | null = null;
  try {
    const body = await req.json();
    url = typeof body?.url === "string" ? body.url.slice(0, 2000) : null;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!url) return json({ error: "url required" }, 400);

  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return json({ ok: true, preview: hit.data });

  let data: Preview | null = null;
  try {
    data = await fetchPreview(url);
  } catch {
    data = null;
  }
  cache.set(url, { at: Date.now(), data });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return json({ ok: true, preview: data });
});
