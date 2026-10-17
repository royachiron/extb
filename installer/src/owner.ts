// Creates the forum's first admin through the forum's own setup endpoints, so the
// installer never duplicates the forum's owner, seeding and session logic.

export const ADMIN_USERNAME = 'admin';
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Random, readable admin password, e.g. EXTB2026-k7Qm-x3Lp-9fRw. */
export function adminPassword(year = new Date().getUTCFullYear()): string {
  let out = '';
  while (out.length < 12) {
    for (const byte of crypto.getRandomValues(new Uint8Array(16))) {
      // Rejection sampling keeps every character equally likely.
      if (byte < 256 - (256 % ALPHABET.length) && out.length < 12) out += ALPHABET[byte % ALPHABET.length];
    }
  }
  return `EXTB${year}-${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8)}`;
}

function setCookie(response: Response, name: string): string | undefined {
  const headers = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [response.headers.get('Set-Cookie') || ''];
  for (const header of headers) {
    const match = header.match(new RegExp(`(?:^|,\\s*)${name}=([^;,]+)`));
    if (match) return match[1];
  }
  return undefined;
}

function unescapeHtml(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** Exchanges a fresh ownership token for a setup session and submits the owner form. */
export async function createForumAdmin(url: string, ownership: string, password: string): Promise<void> {
  const csrf = crypto.randomUUID();
  const signal = () => AbortSignal.timeout(20000);
  const claim = await fetch(url + '/setup/claim', {
    method: 'POST', redirect: 'manual', signal: signal(),
    headers: { Cookie: `csrf=${csrf}`, 'Content-Type': 'application/json', 'x-csrf-token': csrf },
    body: JSON.stringify({ token: ownership }),
  });
  const setup = claim.ok ? setCookie(claim, 'extb_setup') : undefined;
  if (!setup) throw new Error(`Forum setup failed (ownership claim ${claim.status})`);
  const cookies = `csrf=${csrf}; extb_setup=${setup}`;
  const page = await fetch(url + '/setup', { redirect: 'manual', signal: signal(), headers: { Cookie: cookies } });
  const html = page.ok ? await page.text() : '';
  const draft = html.match(/name="approved_draft" value="([^"]*)"/)?.[1];
  const name = html.match(/name="community_name" value="([^"]*)"/)?.[1];
  if (!draft || name === undefined) throw new Error(`Forum setup failed (owner form ${page.status})`);
  const done = await fetch(url + '/setup', {
    method: 'POST', redirect: 'manual', signal: signal(),
    headers: { Cookie: cookies, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ csrf, username: ADMIN_USERNAME, password, approve_draft: '1', approved_draft: unescapeHtml(draft), community_name: unescapeHtml(name) }),
  });
  if (done.status !== 302) throw new Error(`Forum setup failed (owner creation ${done.status})`);
}
