const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

const UNSUPPORTED_VIDEO_HOSTS = [
  'vimeo.com',
  'dailymotion.com',
  'dai.ly',
  'streamable.com',
  'twitch.tv',
];

function isHostOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function youtubeId(url: URL): string | null {
  const hostname = url.hostname.toLowerCase();
  let id: string | null = null;

  if (hostname === 'youtu.be') {
    const match = url.pathname.match(/^\/([A-Za-z0-9_-]{11})\/?$/);
    id = match?.[1] ?? null;
  } else if (isHostOrSubdomain(hostname, 'youtube.com')) {
    if (url.pathname === '/watch') {
      id = url.searchParams.get('v');
    } else {
      const match = url.pathname.match(/^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})\/?$/);
      id = match?.[1] ?? null;
    }
  }

  return id && YOUTUBE_ID.test(id) ? id : null;
}

function youtubeEmbed(id: string, href: string): string {
  return `<div class="yt-embed" style="position:relative;padding-bottom:56.25%;height:0;margin:8px 0;border-radius:8px;overflow:hidden;background:var(--card-bg);"><iframe src="https://www.youtube.com/embed/${id}" title="YouTube video player" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen loading="lazy"></iframe></div><p style="margin:6px 0 10px;"><a href="${href}" rel="noopener noreferrer nofollow">Open on YouTube</a></p>`;
}

function unsupportedVideoNotice(anchor: string): string {
  return `<div class="video-embed-notice" style="margin:8px 0;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--card-bg);color:var(--text-muted);">This video cannot be embedded here. ${anchor} Ask the author to add a YouTube mirror.</div>`;
}

/** Transform standalone video-link paragraphs produced by the sanitized Markdown renderer. */
export function transformVideoEmbeds(html: string): string {
  return html.replace(
    /<p>\s*(<a\s+href="([^"]+)"[^>]*>[\s\S]*?<\/a>)\s*<\/p>/gi,
    (paragraph, anchor: string, href: string) => {
      let url: URL;
      try {
        url = new URL(href.replace(/&amp;/g, '&'));
      } catch {
        return paragraph;
      }

      if (url.protocol !== 'http:' && url.protocol !== 'https:') return paragraph;

      const id = youtubeId(url);
      if (id) return youtubeEmbed(id, href);

      const hostname = url.hostname.toLowerCase();
      if (UNSUPPORTED_VIDEO_HOSTS.some(domain => isHostOrSubdomain(hostname, domain))) {
        return unsupportedVideoNotice(anchor);
      }

      return paragraph;
    },
  );
}
