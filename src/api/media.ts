import type { AppContext } from '../types';
import { getMonthlyUploadUsage, addMonthlyUploadBytes, sumMonthlyUploadBytes, createModLog } from '../db';

const MAX_SIZE = 3 * 1024 * 1024; // 3MB
const PER_USER_MONTHLY_QUOTA = 50 * 1024 * 1024; // 50MB / user / month
const BUCKET_WARN_BYTES = 8 * 1024 * 1024 * 1024; // 8GB across all users this month

// Strict allowlist. Anything outside this set is rejected even if browser
// claims it. New entries require corresponding magic-byte coverage in
// sniffMime() below.
const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
]);

// Magic-byte sniff. Returns the canonical MIME the bytes actually are, or
// null when the prefix doesn't match a supported image. Used on upload so we
// store the truth (not the claim) and on read as a defense-in-depth for
// pre-existing objects.
function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 &&
    bytes[3] === 0x38 && (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61
  ) {
    return 'image/gif';
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  // ISO BMFF: "ftyp" at offset 4..7, brand at 8..11. AVIF brands: avif/avis.
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
  ) {
    const brand = String.fromCharCode(bytes[8]!, bytes[9]!, bytes[10]!, bytes[11]!);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  return null;
}

// UUID v4 shape - matches the format produced by crypto.randomUUID() so
// path traversal, double slashes, encoded characters, and shorter paths
// can't slip through.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function postUpload(
  req: Request,
  ctx: AppContext,
): Promise<Response> {
  if (!ctx.user) return new Response('Unauthorized', { status: 401 });
  if (ctx.user.is_banned === 1 || !ctx.user.is_approved) return new Response('Forbidden', { status: 403 });
  if (!ctx.env.MEDIA) return new Response('Uploads are not enabled.', { status: 503 });

  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return new Response('Invalid content-type', { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as any;
  if (!file || typeof file === 'string') return new Response('No file uploaded', { status: 400 });

  if (file.size > MAX_SIZE) {
    return new Response('File too large (max 3MB)', { status: 413 });
  }

  // Sniff the first bytes before storing. Browser-claimed type is advisory
  // only - we use sniff result as the source of truth for both storage and
  // serving.
  const headBuf = await file.slice(0, 16).arrayBuffer();
  const sniffed = sniffMime(new Uint8Array(headBuf));
  if (!sniffed || !ALLOWED_MIME.has(sniffed)) {
    return new Response('Unsupported file type (allowed: jpeg, png, gif, webp, avif)', { status: 415 });
  }

  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const isStaff = ctx.user.access_level === 'mod' || ctx.user.access_level === 'admin';

  if (!isStaff) {
    const row = await getMonthlyUploadUsage(ctx.env, ctx.user.id);
    const usedThisMonth = row?.monthly_upload_month === currentMonth ? row.monthly_upload_bytes : 0;
    if (usedThisMonth + file.size > PER_USER_MONTHLY_QUOTA) {
      return new Response('Monthly upload quota exceeded', { status: 413 });
    }
  }

  const id = crypto.randomUUID();
  const key = `uploads/${id}`;

  await ctx.env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: sniffed },
    customMetadata: {
      userId: String(ctx.user.id),
      originalName: file.name,
      sniffedType: sniffed,
    }
  });

  await addMonthlyUploadBytes(ctx.env, ctx.user.id, currentMonth, file.size);

  const totalBytes = await sumMonthlyUploadBytes(ctx.env, currentMonth);
  if (totalBytes > BUCKET_WARN_BYTES) {
    await createModLog(
      ctx.env,
      ctx.user.id,
      'quota_warning',
      'r2_bucket',
      null,
      `Monthly upload total ${totalBytes} bytes exceeds ${BUCKET_WARN_BYTES} for ${currentMonth}`,
    );
  }

  return new Response(JSON.stringify({ url: `/media/${id}` }), {
    headers: { 'content-type': 'application/json' },
  });
}

// Determine a safe Content-Type for serving an R2 object.
//
// Pre-magic-byte uploads have no sniffedType in customMetadata but their
// httpMetadata.contentType was taken from the browser claim. We do NOT trust
// that claim - we only serve a known-good content type by either:
//   1. Reading sniffedType from customMetadata (uploaded under the new code), or
//   2. Verifying httpMetadata.contentType is in the allowlist as a soft fall-
//      back. nosniff defangs the file even if the type is a lie because the
//      browser refuses to MIME-sniff and re-interpret as HTML.
// Anything outside the allowlist is served as octet-stream so browsers
// cannot render it as HTML.
function safeServeType(object: R2ObjectBody | R2Object | null): string {
  if (!object) return 'application/octet-stream';
  const sniffed = object.customMetadata?.sniffedType;
  if (sniffed && ALLOWED_MIME.has(sniffed)) return sniffed;
  const claimed = object.httpMetadata?.contentType;
  if (claimed && ALLOWED_MIME.has(claimed)) return claimed;
  return 'application/octet-stream';
}

function safeMediaHeaders(object: R2ObjectBody | R2Object | null): Headers {
  const headers = new Headers();
  const type = safeServeType(object);
  headers.set('Content-Type', type);
  // Browsers honor this and refuse to MIME-sniff. Without it a file served
  // as image/jpeg that contains <html> bytes can be rendered as HTML.
  headers.set('X-Content-Type-Options', 'nosniff');
  // Force download for the octet-stream fallback - if we couldn't verify it
  // as an allowlisted image, don't open it inline.
  if (type === 'application/octet-stream') {
    headers.set('Content-Disposition', 'attachment');
  } else {
    headers.set('Content-Disposition', 'inline');
  }
  if (object) {
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
  }
  return headers;
}

export async function getMedia(
  req: Request,
  ctx: AppContext,
  params: Record<string, string>,
): Promise<Response> {
  if (!ctx.env.MEDIA) return new Response('Not found', { status: 404 });
  const id = params.id;
  // Tight UUID v4 match - blocks path traversal, encoded chars, and any
  // shape crypto.randomUUID() doesn't produce.
  if (!id || !UUID_RE.test(id)) return new Response('Not found', { status: 404 });

  const key = `uploads/${id}`;
  const object = await ctx.env.MEDIA.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const url = new URL(req.url);
  const w = Math.min(Number(url.searchParams.get('w')) || 0, 1600);
  const fmtParam = url.searchParams.get('fmt');
  const fmt =
    fmtParam === 'avif' ? 'image/avif' :
    fmtParam === 'webp' ? 'image/webp' :
    null;

  // Original passthrough when no transform requested.
  if (!ctx.env.IMAGES || (w === 0 && fmt === null)) {
    return new Response(object.body, { headers: safeMediaHeaders(object) });
  }

  try {
    const r = await ctx.env.IMAGES.input(object.body)
      .transform({ width: w || undefined, fit: 'scale-down' })
      .output({ format: fmt ?? 'image/avif', quality: 78 });
    // Transformed output: type comes from the transform pipeline, which we
    // requested as a specific image format - already safe. Still set
    // nosniff for defense in depth.
    const outType = r.contentType();
    const headers = new Headers({
      'Content-Type': ALLOWED_MIME.has(outType) ? outType : 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': ALLOWED_MIME.has(outType) ? 'inline' : 'attachment',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    return new Response(r.image(), { headers });
  } catch {
    // Fail open to original - never break the page over a transform error.
    // object.body was consumed by IMAGES.input above, so re-fetch.
    const fallback = await ctx.env.MEDIA.get(key);
    if (!fallback) return new Response('Not found', { status: 404 });
    return new Response(fallback.body, { headers: safeMediaHeaders(fallback) });
  }
}
