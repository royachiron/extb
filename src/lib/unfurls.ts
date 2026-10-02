export interface OGData {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  domain?: string;
}

const PRIVATE_IP_RANGES: RegExp[] = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fe80:/i,
];

export function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_RANGES.some((re) => re.test(ip));
}

// Best-effort SSRF guard. Rejects literal private/loopback/link-local IPs
// outright, and for hostnames does a DNS-over-HTTPS pre-check against
// Cloudflare's own resolver. This does not eliminate a DNS-rebinding race
// between this check and the fetch() below - not achievable from a stock
// Workers fetch() without a custom connect hook - but it stops the common
// case (a URL/IP literal pointed at a private range).
export async function resolvesToPrivateIp(hostname: string): Promise<boolean> {
  if (/^[\d.]+$/.test(hostname) || hostname.includes(':')) {
    return isPrivateIp(hostname);
  }
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`, {
      headers: { accept: 'application/dns-json' },
    });
    const data = await res.json() as { Answer?: { data: string }[] };
    return (data.Answer ?? []).some((a) => isPrivateIp(a.data));
  } catch {
    return true; // fail closed: if we can't verify, don't fetch.
  }
}

export async function fetchOGData(url: string, timeout = 5000): Promise<OGData | null> {
  try {
    const hostname = new URL(url).hostname;
    if (await resolvesToPrivateIp(hostname)) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) return null;

    const html = await res.text();
    const og = parseOG(html);

    if (og.url || og.title) {
      og.domain = new URL(url).hostname;
      return og;
    }
    return null;
  } catch (_err) {
    return null;
  }
}

function parseOG(html: string): OGData {
  const og: OGData = {};
  const ogRegex = /<meta\s+property="og:(\w+)"\s+content="([^"]*)"/gi;
  let match;

  while ((match = ogRegex.exec(html)) !== null) {
    const [, prop, content] = match;
    if (!prop) continue;
    const key = prop.toLowerCase();
    if (key === 'title') og.title = content;
    else if (key === 'description') og.description = content;
    else if (key === 'image') og.image = content;
    else if (key === 'url') og.url = content;
  }

  return og;
}

export function renderOGCard(ogData: OGData, linkUrl: string): string {
  const title = ogData.title || linkUrl;
  const desc = ogData.description ? `<p style="margin:4px 0;font-size:13px;color:var(--text-muted);line-height:1.4;">${escapeHtml(ogData.description)}</p>` : '';
  const img = ogData.image ? `<img src="${escapeHtml(ogData.image)}" alt="" style="width:100%;max-height:200px;object-fit:cover;border-radius:6px;margin-bottom:8px;" loading="lazy">` : '';

  return `
    <a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener noreferrer" style="display:block;border:1px solid var(--border-color);border-radius:8px;padding:12px;margin:8px 0;text-decoration:none;color:inherit;background:var(--card-bg);transition:border-color 0.2s;">
      ${img}
      <p style="margin:0 0 4px;font-weight:600;color:var(--text-main);font-size:14px;">${escapeHtml(title)}</p>
      ${desc}
      <p style="margin:4px 0 0;font-size:12px;color:var(--text-muted);">${escapeHtml(ogData.domain || new URL(linkUrl).hostname)}</p>
    </a>`;
}

// intentionally distinct from layout-utils esc: emits &#039; (leading zero) for
// single quotes, so merging would change rendered output bytes.
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (c) => map[c]!);
}
