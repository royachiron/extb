// extb.achiron.fyi portal: a 2002-style web portal for a 2026 forum engine.
// Feature claims here must match the shipped forum; check src/ before adding one.
export type PortalLang = 'en' | 'he';

const REPO = 'https://github.com/royachiron/extb';

export function resolvePortalLang(url: URL, acceptLanguage?: string | null): PortalLang {
  const param = url.searchParams.get('lang')?.toLowerCase();
  if (param === 'he' || param === 'en') return param;
  return /^\s*he\b/i.test(acceptLanguage ?? '') ? 'he' : 'en';
}

/** The pinned release (e.g. v0.4.1) taken from the installer's manifest URL; '' when unknown. */
export function releaseVersion(manifestUrl?: string): string {
  return manifestUrl?.match(/\/releases\/download\/(v\d+\.\d+\.\d+[A-Za-z0-9.-]*)\//)?.[1] ?? '';
}

function releaseUrl(version: string): string {
  return version ? `${REPO}/releases/tag/${version}` : `${REPO}/releases/latest`;
}

// Start buttons always begin a new forum, so a browser with an earlier install gets a way back to it.
function resumeNotice(lang: PortalLang): string {
  return lang === 'he'
    ? '<p class="portal-resume">כבר התחלתם להקים פורום בדפדפן הזה? <a href="/wizard">חזרה להתקנה הקודמת &raquo;</a></p>'
    : '<p class="portal-resume">Already started a forum in this browser? <a href="/wizard">Return to your previous install &raquo;</a></p>';
}

export function renderLandingPage(lang: PortalLang = 'en', version = '', resume = false): string {
  const page = lang === 'he' ? landingPageHe(version) : landingPageEn(version);
  return resume ? page.replace('<div class="portal-ticker"', resumeNotice(lang) + '\n  <div class="portal-ticker"') : page;
}

// The landing page remembers an explicit language choice so the setup wizard can follow it.
export const LANG_COOKIE = '__Host-extb_lang';
export function langCookie(lang: PortalLang): string {
  return `${LANG_COOKIE}=${lang}; Path=/; Secure; SameSite=Lax; Max-Age=31536000`;
}
export function resolveWizardLang(request: Request): PortalLang {
  const chosen = request.headers.get('Cookie')?.match(/(?:^|; )__Host-extb_lang=(he|en)(?:;|$)/)?.[1];
  return chosen === 'he' || chosen === 'en' ? chosen : resolvePortalLang(new URL(request.url), request.headers.get('Accept-Language'));
}

const landingPageEn = (version: string) => `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/wizard.css">
<title>EXTB · EXTra Board Portal - Free Community Forum on Your Own Edge</title>
</head>
<body class="portal-body">
<div class="portal-shell">

  <!-- TOP PORTAL UTILITY BAR -->
  <div class="portal-eyebrow">
    <div class="portal-eyebrow-left">
      <span class="portal-dot" aria-hidden="true"></span>
      <strong>EXTB NETWORK PORTAL</strong> &middot; Directory: <a href="#features">Software</a> &raquo; <a href="#architecture">Edge Forums</a> &raquo; <a href="#presets">Community Starter</a>
    </div>
    <div class="portal-eyebrow-right">
      <span>Release: <strong>${version || 'latest'}</strong></span> &middot;
      <span>License: <strong>MIT Open Source</strong></span> &middot;
      <span class="portal-lang-switch" aria-label="Language switch">
        <a class="portal-lang-pill portal-lang-active" href="/?lang=en">EN</a>
        <a class="portal-lang-pill" href="/?lang=he" dir="rtl" lang="he">עברית (HE)</a>
      </span> &middot;
      <a href="/oauth/start?new=1">Start Your Forum &raquo;</a>
    </div>
  </div>

  <!-- MASTHEAD BANNER -->
  <header class="portal-masthead">
    <div class="portal-brand">
      <div class="portal-badge" aria-hidden="true">
        <span class="portal-badge-top">EXTB</span>
        <span class="portal-badge-sub">EST &middot; EDGE</span>
      </div>
      <div>
        <h1 class="portal-title">EXTra Board <span class="portal-title-tag">Community Engine</span></h1>
        <p class="portal-subtitle">The classic golden-era web forum, reborn on zero-maintenance serverless infrastructure. Your community. Your database. Live in one click.</p>
      </div>
    </div>
    <div class="portal-cta-box">
      <div class="portal-cta-header">INSTANT PROVISIONING WIZARD</div>
      <div class="portal-cta-body">
        <a class="portal-btn-primary" href="/oauth/start?new=1">Create Your Community &raquo;</a>
        <div class="portal-cta-meta">$0/mo on Cloudflare&#39;s free plan &middot; No server to rent</div>
      </div>
    </div>
  </header>

  <!-- CHANNEL TAB STRIP -->
  <nav class="portal-tabs" aria-label="Portal sections">
    <a class="portal-tab portal-tab-active" href="#overview">Home &amp; Overview</a>
    <a class="portal-tab" href="#topics">Forum Ideas</a>
    <a class="portal-tab" href="#features">Feature Directory</a>
    <a class="portal-tab" href="#board-preview">Live Board Preview</a>
    <a class="portal-tab" href="#architecture">2026 Edge Specs</a>
    <a class="portal-tab" href="#agent-mcp">MCP Admin</a>
    <a class="portal-tab" href="https://github.com/royachiron/extb" target="_blank" rel="noopener">Source Code (GitHub)</a>
  </nav>

  <!-- TICKER / STATUS RIBBON -->
  <div class="portal-ticker" id="overview">
    <span class="portal-ticker-label">WHAT'S NEW</span>
    <span class="portal-ticker-text">
      Richer Feed Cards &bull; Poll Peek &amp; Undo &bull; Duplicate Topic Guard &bull; Read-Only Freeze Mode &bull; Smoother First-Time Setup &bull; Full Hebrew RTL &amp; English LTR
    </span>
  </div>

  <!-- 3-COLUMN PORTAL GRID -->
  <div class="portal-grid">

    <!-- LEFT SIDEBAR: DIRECTORY & QUICK SPECS -->
    <aside class="portal-col-left">
      <div class="portal-box">
        <div class="portal-box-header">1-Click Setup Steps</div>
        <div class="portal-box-body">
          <ol class="portal-steps">
            <li><strong>Authorize Cloudflare:</strong> Connect via official PKCE OAuth. Credentials are sealed and auto-revoked after deploy.</li>
            <li><strong>Shape Your Board:</strong> Pick a name, purpose, language (EN / HE), and starter preset.</li>
            <li><strong>Preview &amp; Approve:</strong> Inspect or customize starter rooms and welcome threads before anything is created, or copy a ready-made prompt into your favorite AI and paste back what it writes.</li>
            <li><strong>Claim Ownership:</strong> Your Worker + D1 database deploy automatically. Create your admin account directly on your forum.</li>
          </ol>
          <div class="portal-mini-cta">
            <a class="portal-btn-bevel" href="/oauth/start?new=1">Launch Installer &raquo;</a>
          </div>
        </div>
      </div>

      <div class="portal-box" id="architecture">
        <div class="portal-box-header">System Specifications</div>
        <div class="portal-box-body">
          <table class="portal-spec-table">
            <tbody>
              <tr><th>Runtime</th><td>Cloudflare Workers (ES2022)</td></tr>
              <tr><th>Database</th><td>Cloudflare D1 (SQLite Edge)</td></tr>
              <tr><th>Real-Time</th><td>Hibernatable WebSockets DO</td></tr>
              <tr><th>Auth Crypto</th><td>PBKDF2-SHA256 (Durable Object)</td></tr>
              <tr><th>Frontend</th><td>SSR HTML + HTMX 2.0</td></tr>
              <tr><th>Themes</th><td>Light &amp; Dark Mode (CSS Vars)</td></tr>
              <tr><th>Languages</th><td>English (LTR) &amp; Hebrew (RTL)</td></tr>
              <tr><th>Admin API</th><td>MCP server (bring your own AI)</td></tr>
              <tr><th>Monthly Cost</th><td><strong>$0</strong> on the free plan</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="portal-box" id="presets">
        <div class="portal-box-header">5 Ready-Made Presets</div>
        <div class="portal-box-body">
          <ul class="portal-list">
            <li><strong>General Community</strong><span>Town square, introductions, announcements, and live lounge.</span></li>
            <li><strong>Club / Local Group</strong><span>Neighborhoods, hobby clubs, meetups, and member coordination.</span></li>
            <li><strong>Creator Community</strong><span>Showcases, feedback threads, behind-the-scenes, and fan chat.</span></li>
            <li><strong>Project Community</strong><span>Releases, roadmaps, bug reports, and contributor discussions.</span></li>
            <li><strong>Support Community</strong><span>Troubleshooting, Q&amp;A knowledge base, and peer assistance.</span></li>
          </ul>
        </div>
      </div>
    </aside>

    <!-- CENTER COLUMN: HERO PITCH, DIRECTORY OF FEATURES, SIMULATED BOARD -->
    <main class="portal-col-main">

      <!-- HERO PANEL -->
      <section class="portal-hero-card">
        <div class="portal-hero-banner">
          <div class="portal-hero-kicker">REMEMBER WANTING A FORUM OF YOUR OWN?</div>
          <h2 class="portal-hero-headline">It Looks Like 2002. It Runs Like 2026. And It's 100% Yours.</h2>
          <p class="portal-hero-lead">
            Your band, your guild, your street, your favorite show &mdash; every great forum started with one topic someone cared about. <strong>EXTB (EXTra Board)</strong> gives you yours, free: real rooms and threads, a live chat room, polls and private messages, with the clarity and permanence of classic forums, running on edge computing that costs nothing to run and needs no server.
          </p>
          <div class="portal-hero-actions">
            <a class="portal-btn-primary portal-btn-lg" href="/oauth/start?new=1">Click Here to Get Your Free Forum &raquo;</a>
            <a class="portal-btn-secondary" href="https://deploy.workers.cloudflare.com/?url=https://github.com/royachiron/extb" target="_blank" rel="noopener">Manual GitHub Deploy</a>
          </div>
        </div>
      </section>


      <!-- WHAT WILL YOURS BE ABOUT? (DIRECTORY OF COMMUNITIES) -->
      <section class="portal-box" id="topics">
        <div class="portal-box-header">
          <span>What Will Yours Be About? &mdash; Community Directory</span>
          <span class="portal-header-right">Pick a Topic &middot; Click to Start</span>
        </div>
        <div class="portal-box-body">
          <ul class="portal-topic-grid">
            <li><a href="/oauth/start?new=1">Games &amp; Guilds</a><span>D&amp;D nights, Minecraft servers, speedrunners</span></li>
            <li><a href="/oauth/start?new=1">Music &amp; Bands</a><span>Your band, fan clubs, gear talk</span></li>
            <li><a href="/oauth/start?new=1">Fandoms</a><span>Anime, sci-fi, that one show</span></li>
            <li><a href="/oauth/start?new=1">Neighborhood</a><span>Your building, your street, local events</span></li>
            <li><a href="/oauth/start?new=1">School &amp; Study</a><span>Classes, study groups, alumni</span></li>
            <li><a href="/oauth/start?new=1">Clubs &amp; Hobbies</a><span>Photography, cars, gardening</span></li>
            <li><a href="/oauth/start?new=1">Creators</a><span>Your audience, behind the scenes</span></li>
            <li><a href="/oauth/start?new=1">Projects</a><span>Open source, makers, side projects</span></li>
            <li><a href="/oauth/start?new=1">Support Circles</a><span>Parents, recovery, peer help</span></li>
          </ul>
          <p class="portal-small-copy portal-topic-note">Choose a starter style (community, club, creator, project or support) and EXTB writes your first rooms, rules and welcome threads. You approve all of it before anything is created.</p>
        </div>
      </section>

      <!-- LYCOS-STYLE DIRECTORY OF FEATURES -->
      <section class="portal-box" id="features">
        <div class="portal-box-header">
          <span>Webmaster's Feature Directory &mdash; Everything Included Out of the Box</span>
          <span class="portal-header-right">6 Core Modules &middot; All Included</span>
        </div>
        <div class="portal-box-body">
          <div class="portal-directory-grid">

            <div class="portal-dir-item">
              <h3><span class="portal-folder" aria-hidden="true">&#9638;</span> Structured Forum Rooms</h3>
              <p class="portal-dir-links">
                Pinned &amp; Locked Topics &middot; Rich Markdown &amp; Quotes &middot; Inline Polls &middot; Reactions &amp; Likes &middot; Unread Tracking &middot; Search
              </p>
              <p class="portal-dir-desc">
                Real threads that stay organized for years. Includes inline poll voting directly from the home feed, optional image uploads, and instant deep-link reply highlighting.
              </p>
            </div>

            <div class="portal-dir-item">
              <h3><span class="portal-folder" aria-hidden="true">&#9638;</span> Hibernating Live Chat</h3>
              <p class="portal-dir-links">
                WebSocket Rooms &middot; Online Presence &middot; Chat-to-Topic Promotion &middot; Zero Idle Cost
              </p>
              <p class="portal-dir-desc">
                Every community gets real-time chat rooms backed by Cloudflare Durable Objects. When nobody is chatting, rooms hibernate automatically so you never pay for idle compute.
              </p>
            </div>

            <div class="portal-dir-item">
              <h3><span class="portal-folder" aria-hidden="true">&#9638;</span> Private Messages &amp; Mentions</h3>
              <p class="portal-dir-links">
                Private DMs &amp; Typing &middot; @Mentions &middot; Thread Subscriptions &middot; Web Push (Optional)
              </p>
              <p class="portal-dir-desc">
                Members can message each other privately, follow topics, get browser push notifications (optional), and customize their profiles, avatars, and bios.
              </p>
            </div>

            <div class="portal-dir-item">
              <h3><span class="portal-folder" aria-hidden="true">&#9638;</span> Invitation &amp; Intake System</h3>
              <p class="portal-dir-links">
                Invite Codes &middot; Membership Applications &middot; Private Boards &middot; Staff Announcements
              </p>
              <p class="portal-dir-desc">
                Run an open town square, an application-reviewed club, or a strictly private room. Single-use invites and customizable intake questions keep spam out.
              </p>
            </div>

            <div class="portal-dir-item">
              <h3><span class="portal-folder" aria-hidden="true">&#9638;</span> Practical Moderation Suite</h3>
              <p class="portal-dir-links">
                Reports Queue &middot; Warnings &amp; Bans &middot; Ban Appeals &middot; Audit Log &middot; Read-Only Freeze Mode
              </p>
              <p class="portal-dir-desc">
                Full moderator toolkit with transparent audit history, content review queues, and a one-switch Read-Only mode for maintenance or archiving.
              </p>
            </div>

            <div class="portal-dir-item" id="agent-mcp">
              <h3><span class="portal-folder" aria-hidden="true">&#9638;</span> Built-In MCP Server</h3>
              <p class="portal-dir-links">
                Model Context Protocol (<code>/mcp</code>) &middot; Scoped Tokens &middot; Claude / Cursor / CLI Ready
              </p>
              <p class="portal-dir-desc">
                Administer your board from your favorite AI coding agent. Create rooms, update branding, review moderation reports, or seed starter threads via natural language.
              </p>
            </div>

          </div>
        </div>
      </section>

      <!-- REAL FEATURE SCREENSHOTS SHOWCASE -->
      <section class="portal-box" id="screenshots">
        <div class="portal-box-header">
          <span>Inside a Live EXTB Community &mdash; Real Feature Screenshots</span>
          <span class="portal-header-right">Click Any Screen to Enlarge</span>
        </div>
        <div class="portal-box-body">
          <div class="portal-shots-grid">

            <figure class="portal-shot-card">
              <div class="portal-shot-winbar">
                <span class="portal-shot-title">&#9638; Main Feed + Docked Live WebSocket Chat</span>
                <a class="portal-shot-zoom" href="/screenshots/feed-chat.png" target="_blank" rel="noopener">[Full Size &nearr;]</a>
              </div>
              <a class="portal-shot-img-link" href="/screenshots/feed-chat.png" target="_blank" rel="noopener">
                <img class="portal-shot-img" src="/screenshots/feed-chat.png" alt="EXTB main feed with active labels, participant avatars, and docked live WebSocket chat" loading="lazy" width="1280" height="760">
              </a>
              <figcaption class="portal-shot-caption">
                <strong>Rich Activity Feed &amp; Persistent Chat Dock:</strong> Unread tracking, 24h "Active" badges, participant avatars, and a hibernating WebSocket chat sidebar that stays connected while navigating via HTMX.
              </figcaption>
            </figure>

            <figure class="portal-shot-card">
              <div class="portal-shot-winbar">
                <span class="portal-shot-title">&#9638; Discussion Thread + Interactive Polls</span>
                <a class="portal-shot-zoom" href="/screenshots/topic-poll.png" target="_blank" rel="noopener">[Full Size &nearr;]</a>
              </div>
              <a class="portal-shot-img-link" href="/screenshots/topic-poll.png" target="_blank" rel="noopener">
                <img class="portal-shot-img" src="/screenshots/topic-poll.png" alt="EXTB discussion thread with live interactive poll bars, vote percentages, and thread follow controls" loading="lazy" width="1280" height="760">
              </a>
              <figcaption class="portal-shot-caption">
                <strong>Structured Threads &amp; Polls:</strong> Single or multi-choice polls with instant HTMX voting, peek-before-voting, undo support, thread subscriptions, and deep-linked replies.
              </figcaption>
            </figure>

            <figure class="portal-shot-card">
              <div class="portal-shot-winbar">
                <span class="portal-shot-title">&#9638; Admin cPanel: People, Spaces, Moderation &amp; MCP</span>
                <a class="portal-shot-zoom" href="/screenshots/admin-cpanel.png" target="_blank" rel="noopener">[Full Size &nearr;]</a>
              </div>
              <a class="portal-shot-img-link" href="/screenshots/admin-cpanel.png" target="_blank" rel="noopener">
                <img class="portal-shot-img" src="/screenshots/admin-cpanel.png" alt="EXTB Admin cPanel showing user management, roles, invitations, and MCP tokens" loading="lazy" width="1280" height="760">
              </a>
              <figcaption class="portal-shot-caption">
                <strong>Complete Control Panel (cPanel):</strong> Manage member roles, room permissions, membership intake applications, invitation links, moderation queues, and scoped AI/MCP tokens.
              </figcaption>
            </figure>

            <figure class="portal-shot-card">
              <div class="portal-shot-winbar">
                <span class="portal-shot-title">&#9638; Native Hebrew (RTL) &amp; Bilingual UI</span>
                <a class="portal-shot-zoom" href="/screenshots/hebrew-rtl.png" target="_blank" rel="noopener">[Full Size &nearr;]</a>
              </div>
              <a class="portal-shot-img-link" href="/screenshots/hebrew-rtl.png" target="_blank" rel="noopener">
                <img class="portal-shot-img" src="/screenshots/hebrew-rtl.png" alt="EXTB running in full Hebrew Right-to-Left layout" loading="lazy" width="1280" height="760">
              </a>
              <figcaption class="portal-shot-caption">
                <strong>First-Class Bilingual Support:</strong> Built-in 1-click toggle between English (LTR) and Hebrew (RTL), plus full Light &amp; Dark theme support across desktop and mobile.
              </figcaption>
            </figure>

          </div>
        </div>
      </section>

      <!-- LIVE BOARD INDEX PREVIEW (2002 vBulletin / phpBB style table!) -->
      <section class="portal-box" id="board-preview">
        <div class="portal-box-header">
          <span>What You Get: Classic Board Structure + Real-Time Activity</span>
          <span class="portal-header-right">Sample Provisioned Community</span>
        </div>
        <div class="portal-box-body portal-box-flush">
          <table class="portal-board-table" aria-label="Sample forum rooms">
            <thead>
              <tr>
                <th>Forum / Room</th>
                <th class="portal-num">Capabilities</th>
                <th>Latest Activity Preview</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div class="portal-room-name">&#9733; Announcements &amp; Rules</div>
                  <div class="portal-room-desc">Official updates from community staff. Public reading, staff-only posting.</div>
                </td>
                <td class="portal-num"><span class="portal-tag">Staff Post</span></td>
                <td class="portal-lastpost">
                  <strong>Welcome to our new home!</strong><br>
                  <span>Pinned charter &amp; community guidelines</span>
                </td>
              </tr>
              <tr>
                <td>
                  <div class="portal-room-name">&#9993; Introductions &amp; Intake</div>
                  <div class="portal-room-desc">Say hello, share what you're working on, and meet fellow members.</div>
                </td>
                <td class="portal-num"><span class="portal-tag">Threads + Polls</span></td>
                <td class="portal-lastpost">
                  <strong>Introduce yourself to the board</strong><br>
                  <span>Starter thread pre-populated on setup</span>
                </td>
              </tr>
              <tr>
                <td>
                  <div class="portal-room-name">&#9881; General Discussion</div>
                  <div class="portal-room-desc">Long-form conversations, polls, project showcases, and deep dives.</div>
                </td>
                <td class="portal-num"><span class="portal-tag">Markdown + Push</span></td>
                <td class="portal-lastpost">
                  <strong>What should we build next? [Poll]</strong><br>
                  <span>Inline feed voting &amp; instant HTMX replies</span>
                </td>
              </tr>
              <tr>
                <td>
                  <div class="portal-room-name">&#9889; Community Live Lounge</div>
                  <div class="portal-room-desc">Real-time WebSocket chat room with online presence and message history.</div>
                </td>
                <td class="portal-num"><span class="portal-tag">Live WebSocket</span></td>
                <td class="portal-lastpost">
                  <strong>Hibernating Durable Object</strong><br>
                  <span>Sleeps when quiet, wakes when members join</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 2026 EDGE / MCP CONSOLE PREVIEW -->
      <section class="portal-box">
        <div class="portal-box-header">
          <span>2002 Interface Outside &mdash; 2026 Agentic Engine Inside</span>
          <span class="portal-header-right">Built-In MCP Endpoint (<code>/mcp</code>)</span>
        </div>
        <div class="portal-box-body">
          <div class="portal-console-split">
            <div>
              <p class="portal-small-copy">
                <strong>Run your community with or without AI:</strong> Connect Claude Code, Cursor, or any MCP client using a scoped admin token from <em>Admin &rarr; MCP</em>.
              </p>
              <p class="portal-small-copy">
                Create rooms, customize colors, review moderation reports, or draft starter topics from your terminal-while every action is logged in the board's audit trail.
              </p>
            </div>
            <pre class="portal-code-box" dir="ltr">claude mcp add --transport http my-forum \\
  https://your-forum.workers.dev/mcp \\
  --header "Authorization: Bearer &lt;token&gt;"</pre>
          </div>
        </div>
      </section>

    </main>

    <!-- RIGHT SIDEBAR: WHY OWN YOUR BOARD, COMPARISON, SECURITY -->
    <aside class="portal-col-right">

      <div class="portal-box portal-box-highlight">
        <div class="portal-box-header">Why Webmasters Choose EXTB</div>
        <div class="portal-box-body">
          <ul class="portal-check-list">
            <li><strong>No SaaS Lock-In:</strong> Runs in <em>your</em> Cloudflare account on <em>your</em> D1 SQLite database.</li>
            <li><strong>Indexable &amp; Permanent:</strong> Unlike chat silos, threads have real URLs, clean HTML, and structured knowledge.</li>
            <li><strong>Zero Server Maintenance:</strong> No Linux VPS to patch, no Redis daemon to crash, no Docker containers to babysit.</li>
            <li><strong>GitHub Optional:</strong> Start with 1-click browser provisioning; connect a private GitHub repo later if you want to customize code.</li>
          </ul>
        </div>
      </div>

      <div class="portal-box">
        <div class="portal-box-header">Security &amp; Zero-Trust Setup</div>
        <div class="portal-box-body">
          <p class="portal-small-copy">
            <strong>Your password never touches this installer.</strong>
          </p>
          <p class="portal-small-copy">
            EXTB provisions checksum-verified release artifacts${version ? ` (<code>${version}</code>)` : ''} directly to your Cloudflare account via PKCE OAuth. Temporary tokens are encrypted with AES-GCM and automatically revoked the moment your forum is live.
          </p>
          <p class="portal-small-copy">
            You create your owner account directly on your newly deployed forum over an encrypted one-time handoff.
          </p>
        </div>
      </div>

      <div class="portal-box">
        <div class="portal-box-header">Compare the Era</div>
        <div class="portal-box-body portal-box-flush">
          <table class="portal-compare-table">
            <thead>
              <tr><th>Feature</th><th>2002 PHP</th><th>EXTB</th></tr>
            </thead>
            <tbody>
              <tr><td>Setup</td><td>FTP + MySQL</td><td><strong>A Few Clicks</strong></td></tr>
              <tr><td>Hosting Bill</td><td>Paid Host</td><td><strong>$0 Free Plan</strong></td></tr>
              <tr><td>Live Chat</td><td>Plugin</td><td><strong>Built-In</strong></td></tr>
              <tr><td>Mobile UI</td><td>None</td><td><strong>Native</strong></td></tr>
              <tr><td>MCP Admin API</td><td>None</td><td><strong>Built-In</strong></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="portal-box">
        <div class="portal-box-header">Quick Links &amp; Docs</div>
        <div class="portal-box-body">
          <ul class="portal-links-list">
            <li>&raquo; <a href="/oauth/start?new=1"><strong>Start Web Installer</strong></a></li>
            <li>&raquo; <a href="https://github.com/royachiron/extb" target="_blank" rel="noopener">EXTB GitHub Repository</a></li>
            <li>&raquo; <a href="${releaseUrl(version)}" target="_blank" rel="noopener">Release Notes (${version || 'latest'})</a></li>
            <li>&raquo; <a href="https://github.com/royachiron/extb/blob/main/docs/WEB_INSTALLER.md" target="_blank" rel="noopener">Installer Architecture</a></li>
            <li>&raquo; <a href="https://github.com/royachiron/extb/blob/main/docs/INSTALLATION.md" target="_blank" rel="noopener">Manual CLI Setup Guide</a></li>
          </ul>
        </div>
      </div>

    </aside>

  </div>

  <!-- BOTTOM BANNER CTA -->
  <section class="portal-bottom-cta">
    <div>
      <h2>Ready to Open Your Doors?</h2>
      <p>Launch a real forum, live chat, and private community space in your own Cloudflare account right now.</p>
    </div>
    <div class="portal-bottom-cta-buttons">
      <a class="portal-btn-primary portal-btn-lg" href="/oauth/start?new=1">Continue with Cloudflare &raquo;</a>
    </div>
  </section>

  <!-- CLASSIC PORTAL FOOTER -->
  <footer class="portal-footer">
    <div class="portal-footer-badges">
      <span class="portal-micro-badge">EXTB <strong>${version || 'latest'}</strong></span>
      <span class="portal-micro-badge">CLOUDFLARE <strong>WORKERS + D1</strong></span>
      <span class="portal-micro-badge">HTMX <strong>2.0 SSR</strong></span>
      <span class="portal-micro-badge">MCP <strong>AGENT READY</strong></span>
      <span class="portal-micro-badge">LICENSE <strong>MIT</strong></span>
    </div>
    <p>
      <strong>EXTB &middot; EXTra Board</strong> &mdash; Open-source community software created by Roy Achiron. Each installation is 100% independent and owned by its operator.
    </p>
  </footer>

</div>
</body>
</html>`;

const landingPageHe = (version: string) => `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/wizard.css">
<title>EXTB · פורטל EXTra Board - מערכת פורומים וקהילה בחינם בחשבון ה-Edge שלך</title>
</head>
<body class="portal-body portal-rtl">
<div class="portal-shell">

  <!-- TOP PORTAL UTILITY BAR -->
  <div class="portal-eyebrow">
    <div class="portal-eyebrow-left">
      <span class="portal-dot" aria-hidden="true"></span>
      <strong>פורטל הרשת EXTB</strong> &middot; אינדקס: <a href="#features">תוכנה</a> &raquo; <a href="#architecture">פורומים ב-Edge</a> &raquo; <a href="#presets">ערכות קהילה</a>
    </div>
    <div class="portal-eyebrow-right">
      <span>גרסה: <strong>${version || 'latest'}</strong></span> &middot;
      <span>רישיון: <strong>קוד פתוח MIT</strong></span> &middot;
      <span class="portal-lang-switch" aria-label="החלפת שפה">
        <a class="portal-lang-pill" href="/?lang=en" dir="ltr" lang="en">English (EN)</a>
        <a class="portal-lang-pill portal-lang-active" href="/?lang=he">עברית</a>
      </span> &middot;
      <a href="/oauth/start?new=1">הקמת פורום &raquo;</a>
    </div>
  </div>

  <!-- MASTHEAD BANNER -->
  <header class="portal-masthead">
    <div class="portal-brand">
      <div class="portal-badge" aria-hidden="true" dir="ltr">
        <span class="portal-badge-top">EXTB</span>
        <span class="portal-badge-sub">EST &middot; EDGE</span>
      </div>
      <div>
        <h1 class="portal-title">EXTra Board <span class="portal-title-tag">מנוע קהילות</span></h1>
        <p class="portal-subtitle">הפורום הקלאסי של תור הזהב באינטרנט, נולד מחדש על תשתית Serverless ללא תחזוקה. הקהילה שלך. מסד הנתונים שלך. באוויר בלחיצת כפתור.</p>
      </div>
    </div>
    <div class="portal-cta-box">
      <div class="portal-cta-header">אשף הקמה אוטומטי בלחיצה אחת</div>
      <div class="portal-cta-body">
        <a class="portal-btn-primary" href="/oauth/start?new=1">יצירת הקהילה שלך עכשיו &raquo;</a>
        <div class="portal-cta-meta">0 ₪ לחודש במסלול החינמי של Cloudflare &middot; בלי לשכור שרת</div>
      </div>
    </div>
  </header>

  <!-- CHANNEL TAB STRIP -->
  <nav class="portal-tabs" aria-label="מדורי הפורטל">
    <a class="portal-tab portal-tab-active" href="#overview">ראשי וסקירה</a>
    <a class="portal-tab" href="#topics">רעיונות לפורום</a>
    <a class="portal-tab" href="#features">אינדקס יכולות</a>
    <a class="portal-tab" href="#board-preview">תצוגת לוח הפורומים</a>
    <a class="portal-tab" href="#architecture">מפרט טכני 2026</a>
    <a class="portal-tab" href="#agent-mcp">ניהול MCP</a>
    <a class="portal-tab" href="https://github.com/royachiron/extb" target="_blank" rel="noopener">קוד מקור (GitHub)</a>
  </nav>

  <!-- TICKER / STATUS RIBBON -->
  <div class="portal-ticker" id="overview">
    <span class="portal-ticker-label">מה חדש</span>
    <span class="portal-ticker-text">
      כרטיסי פיד עשירים &bull; הצצה וביטול בסקרים &bull; מניעת נושאים כפולים &bull; מצב קריאה בלבד &bull; הקמה ראשונה חלקה יותר &bull; עברית (RTL) ואנגלית מלאות
    </span>
  </div>

  <!-- 3-COLUMN PORTAL GRID -->
  <div class="portal-grid">

    <!-- RIGHT SIDEBAR IN RTL (STEPS, SPECS, PRESETS) -->
    <aside class="portal-col-left">
      <div class="portal-box">
        <div class="portal-box-header">4 שלבים להקמת קהילה</div>
        <div class="portal-box-body">
          <ol class="portal-steps">
            <li><strong>חיבור Cloudflare:</strong> אימות רשמי ומאובטח (PKCE OAuth). ההרשאה מוצפנת ומתבטלת אוטומטית מיד בסיום ההתקנה.</li>
            <li><strong>עיצוב הקהילה:</strong> בחירת שם, מטרה, שפת ממשק (עברית / אנגלית) וערכת נושא מוכנה.</li>
            <li><strong>תצוגה מקדימה ואישור:</strong> צפייה ועריכה של החדרים ונושאי הפתיחה לפני שנוצר משאב כלשהו, או העתקת פרומפט מוכן ל-AI האהוב עליכם והדבקת מה שהוא כותב.</li>
            <li><strong>קבלת בעלות מלאה:</strong> ה-Worker ומסד הנתונים (D1) עולים אוטומטית. יצירת חשבון המנהל מתבצעת ישירות בפורום שלך.</li>
          </ol>
          <div class="portal-mini-cta">
            <a class="portal-btn-bevel" href="/oauth/start?new=1">הפעלת אשף ההתקנה &raquo;</a>
          </div>
        </div>
      </div>

      <div class="portal-box" id="architecture">
        <div class="portal-box-header">מפרט מערכת טכני</div>
        <div class="portal-box-body">
          <table class="portal-spec-table">
            <tbody>
              <tr><th>סביבת ריצה</th><td>Cloudflare Workers (ES2022)</td></tr>
              <tr><th>מסד נתונים</th><td>Cloudflare D1 (SQLite Edge)</td></tr>
              <tr><th>זמן אמת</th><td>WebSockets ב-Durable Objects</td></tr>
              <tr><th>הצפנה ואימות</th><td>PBKDF2-SHA256 (Durable Object)</td></tr>
              <tr><th>ממשק משתמש</th><td>SSR HTML + HTMX 2.0</td></tr>
              <tr><th>ערכות צבע</th><td>מצב בהיר ומצב כהה מובנים</td></tr>
              <tr><th>שפות וכיווניות</th><td>עברית (RTL) ואנגלית (LTR)</td></tr>
              <tr><th>API לניהול</th><td>שרת MCP (עם ה-AI שלכם)</td></tr>
              <tr><th>עלות חודשית</th><td><strong>0 ₪</strong> במסלול החינמי</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="portal-box" id="presets">
        <div class="portal-box-header">5 ערכות פתיחה מוכנות</div>
        <div class="portal-box-body">
          <ul class="portal-list">
            <li><strong>קהילה כללית (General)</strong><span>כיכר העיר, היכרות, הכרזות הנהלה וטרקלין צ׳אט חי.</span></li>
            <li><strong>מועדון / קבוצה מקומית</strong><span>שכונות, מועדוני תחביבים, מפגשים ותיאום בין חברים.</span></li>
            <li><strong>קהילת יוצרים (Creator)</strong><span>שיתוף יצירות, משוב, מאחורי הקלעים וצ׳אט קהילתי.</span></li>
            <li><strong>קהילת פרויקט (Project)</strong><span>עדכוני גרסאות, מפת דרכים, דיווחי באגים ודיוני פיתוח.</span></li>
            <li><strong>קהילת תמיכה (Support)</strong><span>פתרון תקלות, מאגר שאלות ותשובות ועזרה הדדית.</span></li>
          </ul>
        </div>
      </div>
    </aside>

    <!-- CENTER COLUMN: HERO PITCH, DIRECTORY OF FEATURES, SIMULATED BOARD -->
    <main class="portal-col-main">

      <!-- HERO PANEL -->
      <section class="portal-hero-card">
        <div class="portal-hero-banner">
          <div class="portal-hero-kicker">זוכרים שרציתם פורום משלכם?</div>
          <h2 class="portal-hero-headline">נראה כמו 2002. טס כמו 2026. ו-100% בבעלותך.</h2>
          <p class="portal-hero-lead">
            ללהקה, לגילדה, לשכונה, לסדרה האהובה &mdash; כל פורום גדול התחיל מנושא אחד שמישהו אהב. <strong>EXTB (EXTra Board)</strong> נותן לכם את שלכם, בחינם: חדרים ושרשורים אמיתיים, חדר צ׳אט חי, סקרים והודעות פרטיות, עם הסדר והקביעות של פורומי תור הזהב, על תשתית Edge שלא עולה שקל לתפעול ולא דורשת שרת.
          </p>
          <div class="portal-hero-actions">
            <a class="portal-btn-primary portal-btn-lg" href="/oauth/start?new=1">לחצו כאן להקמת הפורום החינמי שלכם &raquo;</a>
            <a class="portal-btn-secondary" href="https://deploy.workers.cloudflare.com/?url=https://github.com/royachiron/extb" target="_blank" rel="noopener">התקנה ידנית דרך GitHub</a>
          </div>
        </div>
      </section>


      <!-- WHAT WILL YOURS BE ABOUT? (DIRECTORY OF COMMUNITIES) -->
      <section class="portal-box" id="topics">
        <div class="portal-box-header">
          <span>על מה יהיה הפורום שלכם? &mdash; אינדקס קהילות</span>
          <span class="portal-header-right">בחרו נושא &middot; לחצו להתחלה</span>
        </div>
        <div class="portal-box-body">
          <ul class="portal-topic-grid">
            <li><a href="/oauth/start?new=1">משחקים וגילדות</a><span>ערבי D&amp;D, שרתי מיינקראפט, ספידראנרים</span></li>
            <li><a href="/oauth/start?new=1">מוזיקה ולהקות</a><span>הלהקה שלכם, מועדוני מעריצים, ציוד</span></li>
            <li><a href="/oauth/start?new=1">פאנדומים</a><span>אנימה, מדע בדיוני, הסדרה ההיא</span></li>
            <li><a href="/oauth/start?new=1">שכונה</a><span>הבניין, הרחוב, אירועים מקומיים</span></li>
            <li><a href="/oauth/start?new=1">לימודים</a><span>כיתות, קבוצות למידה, בוגרים</span></li>
            <li><a href="/oauth/start?new=1">מועדונים ותחביבים</a><span>צילום, רכבים, גינון</span></li>
            <li><a href="/oauth/start?new=1">יוצרים</a><span>הקהל שלכם, מאחורי הקלעים</span></li>
            <li><a href="/oauth/start?new=1">פרויקטים</a><span>קוד פתוח, מייקרים, פרויקטים צדדיים</span></li>
            <li><a href="/oauth/start?new=1">מעגלי תמיכה</a><span>הורים, החלמה, עזרה הדדית</span></li>
          </ul>
          <p class="portal-small-copy portal-topic-note">בחרו סגנון פתיחה (קהילה, מועדון, יוצרים, פרויקט או תמיכה) ו-EXTB יכתוב בשבילכם את החדרים, הכללים ושרשורי הפתיחה. אתם מאשרים הכול לפני שמשהו נוצר.</p>
        </div>
      </section>

      <!-- LYCOS-STYLE DIRECTORY OF FEATURES -->
      <section class="portal-box" id="features">
        <div class="portal-box-header">
          <span>אינדקס יכולות למנהלי קהילות &mdash; הכל כלול מהרגע הראשון</span>
          <span class="portal-header-right">6 מודולים מרכזיים &middot; הכל כלול</span>
        </div>
        <div class="portal-box-body">
          <div class="portal-directory-grid">

            <div class="portal-dir-item">
              <h3><span class="portal-folder" aria-hidden="true">&#9638;</span> חדרי פורום ודיונים מובנים</h3>
              <p class="portal-dir-links">
                נעץ ונעילת אשכולות &middot; Markdown וציטוטים &middot; סקרים מובנים &middot; לייקים ותגובות &middot; מעקב הודעות שלא נקראו &middot; חיפוש
              </p>
              <p class="portal-dir-desc">
                אשכולות אמיתיים שנשארים מסודרים לשנים. כולל הצבעה בסקרים ישירות מהפיד הראשי, העלאת תמונות (אופציונלי) והדגשת תגובות בקישור ישיר.
              </p>
            </div>

            <div class="portal-dir-item">
              <h3><span class="portal-folder" aria-hidden="true">&#9638;</span> צ׳אט חי עם תרדמת אוטומטית</h3>
              <p class="portal-dir-links">
                חדרי WebSocket &middot; חיווי מחוברים &middot; הפיכת הודעת צ׳אט לאשכול &middot; אפס עלות במצב המתנה
              </p>
              <p class="portal-dir-desc">
                לכל קהילה יש חדרי צ׳אט בזמן אמת על בסיס Durable Objects. כשאף אחד לא משוחח, החדר נכנס לתרדמת אוטומטית כך שאינך משלם על זמן סרק.
              </p>
            </div>

            <div class="portal-dir-item">
              <h3><span class="portal-folder" aria-hidden="true">&#9638;</span> הודעות פרטיות והתראות</h3>
              <p class="portal-dir-links">
                שיחות פרטיות וחיווי הקלדה &middot; תיוג @משתמשים &middot; מעקב אשכולות &middot; התראות Web Push (אופציונלי)
              </p>
              <p class="portal-dir-desc">
                חברי הקהילה יכולים לשלוח הודעות פרטיות, לעקוב אחרי נושאים, לקבל התראות דחיפה לדפדפן (אופציונלי), ולעצב פרופיל אישי ותמונת אווטאר.
              </p>
            </div>

            <div class="portal-dir-item">
              <h3><span class="portal-folder" aria-hidden="true">&#9638;</span> הזמנות, קליטה וחדרים פרטיים</h3>
              <p class="portal-dir-links">
                קודי הזמנה &middot; טופס בקשת הצטרפות &middot; חדרים סגורים &middot; חדרי הכרזות צוות
              </p>
              <p class="portal-dir-desc">
                נהלו פורום פתוח לכולם, מועדון עם אישור בקשות הצטרפות, או חדרים סודיים לחברים בלבד. הזמנות חד־פעמיות ושאלון היכרות מותאם אישית מונעים ספאם.
              </p>
            </div>

            <div class="portal-dir-item">
              <h3><span class="portal-folder" aria-hidden="true">&#9638;</span> כלי ניהול ומודרציה מלאים</h3>
              <p class="portal-dir-links">
                תור דיווחים &middot; אזהרות והרחקות &middot; ערעורים &middot; יומן ביקורת (Audit) &middot; מצב הקפאה לקריאה בלבד
              </p>
              <p class="portal-dir-desc">
                ארגז כלים שלם למנהלים עם היסטוריית פעולות שקופה, סינון תוכן ומתג הפעלה מהיר של מצב קריאה בלבד לתחזוקה או ארכיון.
              </p>
            </div>

            <div class="portal-dir-item" id="agent-mcp">
              <h3><span class="portal-folder" aria-hidden="true">&#9638;</span> שרת MCP מובנה</h3>
              <p class="portal-dir-links">
                פרוטוקול Model Context Protocol (<code>/mcp</code>) &middot; אסימונים מוגבלי הרשאות &middot; תמיכה ב-Claude ו-Cursor
              </p>
              <p class="portal-dir-desc">
                נהלו את הפורום ישירות מסוכן ה-AI שלכם. פתחו חדרים חדשים, עדכנו עיצוב וחוקים, טפלו בדיווחים או צרו אשכולות פתיחה בפקודה פשוטה בשפה טבעית.
              </p>
            </div>

          </div>
        </div>
      </section>

      <!-- REAL FEATURE SCREENSHOTS SHOWCASE (HEBREW) -->
      <section class="portal-box" id="screenshots">
        <div class="portal-box-header">
          <span>הצצה מבפנים לקהילה חיה &mdash; צילומי מסך אמיתיים מהמערכת</span>
          <span class="portal-header-right">לחצו על כל תמונה להגדלה</span>
        </div>
        <div class="portal-box-body">
          <div class="portal-shots-grid">

            <figure class="portal-shot-card">
              <div class="portal-shot-winbar">
                <span class="portal-shot-title">&#9638; פיד ראשי + חלון צ׳אט WebSocket חי</span>
                <a class="portal-shot-zoom" href="/screenshots/feed-chat.png" target="_blank" rel="noopener">[גודל מלא &nwarr;]</a>
              </div>
              <a class="portal-shot-img-link" href="/screenshots/feed-chat.png" target="_blank" rel="noopener">
                <img class="portal-shot-img" src="/screenshots/feed-chat.png" alt="הפיד הראשי של EXTB עם תגיות פעילות, אווטארים וצ׳אט חי בצד" loading="lazy" width="1280" height="760">
              </a>
              <figcaption class="portal-shot-caption">
                <strong>פיד פעילות עשיר וצ׳אט קבוע:</strong> מעקב הודעות שלא נקראו, חיווי אשכולות חמים ב-24 השעות האחרונות, אווטארים של משתתפים וצ׳אט שנשאר מחובר בזמן מעבר בין דפים.
              </figcaption>
            </figure>

            <figure class="portal-shot-card">
              <div class="portal-shot-winbar">
                <span class="portal-shot-title">&#9638; אשכול דיון + סקרים אינטראקטיביים</span>
                <a class="portal-shot-zoom" href="/screenshots/topic-poll.png" target="_blank" rel="noopener">[גודל מלא &nwarr;]</a>
              </div>
              <a class="portal-shot-img-link" href="/screenshots/topic-poll.png" target="_blank" rel="noopener">
                <img class="portal-shot-img" src="/screenshots/topic-poll.png" alt="אשכול דיון ב-EXTB עם סקר מובנה ואחוזי הצבעה" loading="lazy" width="1280" height="760">
              </a>
              <figcaption class="portal-shot-caption">
                <strong>דיונים מובנים וסקרים חיים:</strong> הצבעה מיידית ב-HTMX ללא טעינת עמוד, אפשרות לצפות בתוצאות או לשנות הצבעה, מעקב אחרי אשכולות וקישורים ישירים לתגובות.
              </figcaption>
            </figure>

            <figure class="portal-shot-card">
              <div class="portal-shot-winbar">
                <span class="portal-shot-title">&#9638; לוח בקרה למנהלים (cPanel): חברים, חדרים ו-MCP</span>
                <a class="portal-shot-zoom" href="/screenshots/admin-cpanel.png" target="_blank" rel="noopener">[גודל מלא &nwarr;]</a>
              </div>
              <a class="portal-shot-img-link" href="/screenshots/admin-cpanel.png" target="_blank" rel="noopener">
                <img class="portal-shot-img" src="/screenshots/admin-cpanel.png" alt="לוח הבקרה של EXTB לניהול משתמשים, הרשאות ואסימוני MCP" loading="lazy" width="1280" height="760">
              </a>
              <figcaption class="portal-shot-caption">
                <strong>לוח ניהול מלא (cPanel):</strong> ניהול דרגות חברים, הרשאות חדרים, טופסי קליטה, קישורי הזמנה, תור דיווחים ואסימוני גישה מאובטחים לסוכני AI/MCP.
              </figcaption>
            </figure>

            <figure class="portal-shot-card">
              <div class="portal-shot-winbar">
                <span class="portal-shot-title">&#9638; ממשק עברי מלא (RTL) ודו־לשוניות מובנית</span>
                <a class="portal-shot-zoom" href="/screenshots/hebrew-rtl.png" target="_blank" rel="noopener">[גודל מלא &nwarr;]</a>
              </div>
              <a class="portal-shot-img-link" href="/screenshots/hebrew-rtl.png" target="_blank" rel="noopener">
                <img class="portal-shot-img" src="/screenshots/hebrew-rtl.png" alt="מערכת EXTB בממשק עברי מלא מימין לשמאל" loading="lazy" width="1280" height="760">
              </a>
              <figcaption class="portal-shot-caption">
                <strong>תמיכה מלאה בעברית ובאנגלית:</strong> מעבר בלחיצה אחת בין עברית (RTL) לאנגלית (LTR), יחד עם מצב בהיר וכהה מובנה בנייד ובמחשב.
              </figcaption>
            </figure>

          </div>
        </div>
      </section>

      <!-- LIVE BOARD INDEX PREVIEW -->
      <section class="portal-box" id="board-preview">
        <div class="portal-box-header">
          <span>מה מקבלים מיד עם ההתקנה: מבנה פורום קלאסי + פעילות חיה</span>
          <span class="portal-header-right">דוגמה לקהילה מותקנת</span>
        </div>
        <div class="portal-box-body portal-box-flush">
          <table class="portal-board-table" aria-label="דוגמה לחדרי פורום">
            <thead>
              <tr>
                <th>פורום / חדר</th>
                <th class="portal-num">יכולות</th>
                <th>תצוגת פעילות אחרונה</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div class="portal-room-name">&#9733; הכרזות וכללי הקהילה</div>
                  <div class="portal-room-desc">עדכונים רשמיים מצוות הקהילה. פתוח לקריאה לכולם, פרסום לצוות בלבד.</div>
                </td>
                <td class="portal-num"><span class="portal-tag">פרסום צוות</span></td>
                <td class="portal-lastpost">
                  <strong>ברוכים הבאים לבית החדש שלנו!</strong><br>
                  <span>אמנת הקהילה וכללי ההשתתפות נעוצים בראש החדר</span>
                </td>
              </tr>
              <tr>
                <td>
                  <div class="portal-room-name">&#9993; היכרות וחברים חדשים</div>
                  <div class="portal-room-desc">בואו להגיד שלום, לספר על עצמכם ולהכיר את חברי הקהילה.</div>
                </td>
                <td class="portal-num"><span class="portal-tag">אשכולות + סקרים</span></td>
                <td class="portal-lastpost">
                  <strong>הציגו את עצמכם לקהילה</strong><br>
                  <span>אשכול פתיחה מוכן מראש עם סיום ההתקנה</span>
                </td>
              </tr>
              <tr>
                <td>
                  <div class="portal-room-name">&#9881; דיונים כלליים</div>
                  <div class="portal-room-desc">שיחות עומק, סקרים, שיתוף פרויקטים ודיונים פתוחים.</div>
                </td>
                <td class="portal-num"><span class="portal-tag">Markdown + Push</span></td>
                <td class="portal-lastpost">
                  <strong>מה כדאי לנו לבנות בהמשך? [סקר]</strong><br>
                  <span>הצבעה ישירות מהפיד ותגובות HTMX מהירות</span>
                </td>
              </tr>
              <tr>
                <td>
                  <div class="portal-room-name">&#9889; טרקלין צ׳אט חי</div>
                  <div class="portal-room-desc">חדר צ׳אט בזמן אמת (WebSocket) עם חיווי מחוברים והיסטוריית הודעות.</div>
                </td>
                <td class="portal-num"><span class="portal-tag">WebSocket חי</span></td>
                <td class="portal-lastpost">
                  <strong>Durable Object חסכוני</strong><br>
                  <span>נרדם כשאין שיחה ומתעורר כשחברים נכנסים</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 2026 EDGE / MCP CONSOLE PREVIEW -->
      <section class="portal-box">
        <div class="portal-box-header">
          <span>מבחוץ פורטל 2002 &mdash; מבפנים מנוע Agentic 2026</span>
          <span class="portal-header-right">נקודת קצה מובנית (<code>/mcp</code>)</span>
        </div>
        <div class="portal-box-body">
          <div class="portal-console-split">
            <div>
              <p class="portal-small-copy">
                <strong>ניהול קהילה עם או בלי AI:</strong> חברו את Claude Code, Cursor או כל לקוח MCP באמצעות אסימון הרשאה מתוך <em>ניהול &larr; MCP</em>.
              </p>
              <p class="portal-small-copy">
                צרו חדרים, עדכנו צבעים, בדקו דיווחי תוכן או נסחו אשכולות פתיחה ישירות מהטרמינל - כשכל פעולה מתועדת ביומן הביקורת של הפורום.
              </p>
            </div>
            <pre class="portal-code-box" dir="ltr">claude mcp add --transport http my-forum \\
  https://your-forum.workers.dev/mcp \\
  --header "Authorization: Bearer &lt;token&gt;"</pre>
          </div>
        </div>
      </section>

    </main>

    <!-- LEFT SIDEBAR IN RTL: WHY OWN YOUR BOARD, COMPARISON, SECURITY -->
    <aside class="portal-col-right">

      <div class="portal-box portal-box-highlight">
        <div class="portal-box-header">למה לבחור ב-EXTB?</div>
        <div class="portal-box-body">
          <ul class="portal-check-list">
            <li><strong>ללא נעילת ספק (No Lock-In):</strong> הפורום רץ בחשבון ה-Cloudflare <em>שלך</em> ועל מסד הנתונים D1 SQLite <em>שלך</em>.</li>
            <li><strong>תוכן קבוע ונגיש:</strong> בניגוד לקבוצות צ׳אט סגורות, לדיונים יש כתובות URL אמיתיות, HTML נקי וידע שנשמר לאורך זמן.</li>
            <li><strong>אפס תחזוקת שרתים:</strong> בלי לעדכן שרתי לינוקס, בלי תהליכי Redis שקורסים ובלי לתחזק קונטיינרים של Docker.</li>
            <li><strong>GitHub אופציונלי בלבד:</strong> מתחילים בהתקנה בדפדפן בלחיצה אחת; ניתן לחבר מאגר GitHub פרטי בהמשך אם תרצו לערוך קוד.</li>
          </ul>
        </div>
      </div>

      <div class="portal-box">
        <div class="portal-box-header">אבטחה והקמה ב-Zero-Trust</div>
        <div class="portal-box-body">
          <p class="portal-small-copy">
            <strong>הסיסמה שלך לעולם לא עוברת דרך המתקין.</strong>
          </p>
          <p class="portal-small-copy">
            המתקין פורס חבילת שחרור חתומה ומאומתת${version ? ` (<code>${version}</code>)` : ''} ישירות לחשבון ה-Cloudflare שלך באמצעות PKCE OAuth. אסימוני הגישה הזמניים מוצפנים ב-AES-GCM ומתבטלים אוטומטית ברגע שהפורום באוויר.
          </p>
          <p class="portal-small-copy">
            את חשבון הבעלים והסיסמה תיצרו ישירות בפורום החדש שלכם דרך אסימון העברת בעלות חד־פעמי.
          </p>
        </div>
      </div>

      <div class="portal-box">
        <div class="portal-box-header">השוואת תקופות</div>
        <div class="portal-box-body portal-box-flush">
          <table class="portal-compare-table">
            <thead>
              <tr><th>יכולת</th><th>PHP ב-2002</th><th>EXTB</th></tr>
            </thead>
            <tbody>
              <tr><td>הקמה</td><td>FTP + MySQL</td><td><strong>כמה קליקים</strong></td></tr>
              <tr><td>עלות אחסון</td><td>אחסון בתשלום</td><td><strong>0 ₪ במסלול החינמי</strong></td></tr>
              <tr><td>צ׳אט חי</td><td>תוסף חיצוני</td><td><strong>מובנה</strong></td></tr>
              <tr><td>ממשק נייד</td><td>אין</td><td><strong>מותאם מלא</strong></td></tr>
              <tr><td>API ניהול (MCP)</td><td>אין</td><td><strong>מובנה</strong></td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="portal-box">
        <div class="portal-box-header">קישורים מהירים ותיעוד</div>
        <div class="portal-box-body">
          <ul class="portal-links-list">
            <li>&raquo; <a href="/oauth/start?new=1"><strong>התחלת התקנה אוטומטית</strong></a></li>
            <li>&raquo; <a href="https://github.com/royachiron/extb" target="_blank" rel="noopener">מאגר הקוד ב-GitHub</a></li>
            <li>&raquo; <a href="${releaseUrl(version)}" target="_blank" rel="noopener">הערות שחרור (${version || 'latest'})</a></li>
            <li>&raquo; <a href="https://github.com/royachiron/extb/blob/main/docs/WEB_INSTALLER.md" target="_blank" rel="noopener">ארכיטקטורת המתקין</a></li>
            <li>&raquo; <a href="https://github.com/royachiron/extb/blob/main/docs/INSTALLATION.md" target="_blank" rel="noopener">מדריך התקנה ידנית (CLI)</a></li>
          </ul>
        </div>
      </div>

    </aside>

  </div>

  <!-- BOTTOM BANNER CTA -->
  <section class="portal-bottom-cta">
    <div>
      <h2>מוכנים לפתוח את שערי הקהילה שלכם?</h2>
      <p>הקימו פורום אמיתי, צ׳אט חי ומרחב קהילתי פרטי בחשבון ה-Cloudflare שלכם כבר עכשיו.</p>
    </div>
    <div class="portal-bottom-cta-buttons">
      <a class="portal-btn-primary portal-btn-lg" href="/oauth/start?new=1">המשך עם Cloudflare &raquo;</a>
    </div>
  </section>

  <!-- CLASSIC PORTAL FOOTER -->
  <footer class="portal-footer">
    <div class="portal-footer-badges" dir="ltr">
      <span class="portal-micro-badge">EXTB <strong>${version || 'latest'}</strong></span>
      <span class="portal-micro-badge">CLOUDFLARE <strong>WORKERS + D1</strong></span>
      <span class="portal-micro-badge">HTMX <strong>2.0 SSR</strong></span>
      <span class="portal-micro-badge">MCP <strong>AGENT READY</strong></span>
      <span class="portal-micro-badge">LICENSE <strong>MIT</strong></span>
    </div>
    <p>
      <strong>EXTB &middot; EXTra Board</strong> &mdash; מערכת קהילות בקוד פתוח שנוצרה על ידי Roy Achiron. כל התקנה היא עצמאית ב-100% ובבעלות המפעיל שלה.
    </p>
  </footer>

</div>
</body>
</html>`;

const wizardCopy = {
  en: {
    dir: 'ltr', title: 'Community Setup', loading: 'Loading&hellip;', back: 'Back to the portal &raquo;',
    network: 'EXTB NETWORK PORTAL', tag: 'Community Engine',
    motto: 'Your own forum, about anything. Free, in your own Cloudflare account.',
    stepsTitle: 'Setup Steps',
    steps: [
      ['Authorize Cloudflare:', 'Temporary, encrypted access, revoked once your forum is live.'],
      ['Shape Your Board:', 'Name, purpose, language and starter style.'],
      ['Preview &amp; Approve:', 'Check the starter rooms and welcome threads first.'],
      ['Claim Ownership:', 'Create your admin account directly on your new forum.'],
    ],
    safeTitle: 'Security &amp; Zero-Trust Setup',
    safe: '<strong>Your password never touches this installer.</strong> Only checksum-verified EXTB releases are installed into your account.',
    footer: 'Open-source community software created by Roy Achiron. Each installation is 100% independent and owned by its operator.',
  },
  he: {
    dir: 'rtl', title: 'הקמת קהילה', loading: 'טוען&hellip;', back: 'חזרה לפורטל &raquo;',
    network: 'פורטל הרשת EXTB', tag: 'מנוע קהילות',
    motto: 'פורום משלכם, על כל נושא. בחינם, בחשבון ה-Cloudflare שלכם.',
    stepsTitle: 'שלבי ההקמה',
    steps: [
      ['חיבור Cloudflare:', 'גישה זמנית ומוצפנת שמתבטלת ברגע שהפורום באוויר.'],
      ['עיצוב הקהילה:', 'שם, מטרה, שפה וסגנון פתיחה.'],
      ['תצוגה מקדימה ואישור:', 'בודקים קודם את החדרים ושרשורי הפתיחה.'],
      ['קבלת בעלות:', 'יוצרים חשבון מנהל ישירות בפורום החדש.'],
    ],
    safeTitle: 'אבטחה והקמה ב-Zero-Trust',
    safe: '<strong>הסיסמה שלכם לעולם לא עוברת דרך המתקין.</strong> רק גרסאות EXTB עם checksum מאומת מותקנות בחשבון שלכם.',
    footer: 'מערכת קהילות בקוד פתוח שנוצרה על ידי Roy Achiron. כל התקנה היא עצמאית ב-100% ובבעלות המפעיל שלה.',
  },
} as const;

export function renderWizardPage(lang: PortalLang): string {
  const t = wizardCopy[lang];
  return `<!doctype html>
<html lang="${lang}" dir="${t.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/wizard.css">
<title>EXTB &middot; ${t.title}</title>
</head>
<body class="portal-body${lang === 'he' ? ' portal-rtl' : ''}">
<div class="portal-shell">
  <div class="portal-eyebrow">
    <div class="portal-eyebrow-left"><span class="portal-dot" aria-hidden="true"></span><strong>${t.network}</strong></div>
    <div class="portal-eyebrow-right"><a href="/?lang=${lang}">${t.back}</a></div>
  </div>
  <header class="portal-masthead">
    <div class="portal-brand">
      <div class="portal-badge" aria-hidden="true" dir="ltr"><span class="portal-badge-top">EXTB</span><span class="portal-badge-sub">EST &middot; EDGE</span></div>
      <div>
        <div class="portal-title">EXTra Board <span class="portal-title-tag">${t.tag}</span></div>
        <p class="portal-subtitle">${t.motto}</p>
      </div>
    </div>
  </header>
  <div class="portal-grid portal-grid-wizard">
    <div class="portal-col-main">
      <section class="portal-box portal-wizard">
        <h1 class="portal-box-header">${t.title}</h1>
        <div class="portal-box-body"><main id="app">${t.loading}</main></div>
      </section>
    </div>
    <aside class="portal-col-right">
      <div class="portal-box portal-box-highlight">
        <div class="portal-box-header">${t.stepsTitle}</div>
        <div class="portal-box-body"><ol class="portal-steps">${t.steps.map(([title, text]) => `<li><strong>${title}</strong> ${text}</li>`).join('')}</ol></div>
      </div>
      <div class="portal-box">
        <div class="portal-box-header">${t.safeTitle}</div>
        <div class="portal-box-body"><p class="portal-small-copy">${t.safe}</p></div>
      </div>
    </aside>
  </div>
  <footer class="portal-footer"><p><strong>EXTB &middot; EXTra Board</strong> &mdash; ${t.footer}</p></footer>
</div>
<script type="module" src="/wizard.js"></script>
</body>
</html>`;
}

// Setup wizard: wizard.js builds plain form elements inside #app; give them the portal's 2002 controls.
const wizardStyles = String.raw`
/* SETUP WIZARD */
.portal-wizard {
  --pt-ink: #0f172a;
  --pt-navy: #003366;
  --pt-muted: #334155;
  --pt-paper: #ffffff;
  --pt-soft: #f8fafc;
  --pt-line: #cbd5e1;
  --pt-bevel: #94a3b8;
  --pt-gold-hi: #ffdd57;
  --pt-gold: #f59e0b;
  --pt-gold-edge: #fde68a;
  --pt-code-bg: #0f172a;
  --pt-code-ink: #86efac;
}
.portal-grid-wizard {
  grid-template-columns: minmax(0, 1fr) 280px;
}
.portal-wizard .portal-box-header {
  margin: 0;
  font-size: 13px;
}
.portal-body .portal-wizard #app { display: block; padding: 0; margin: 0; border: 0; background: none; }
.portal-body .portal-wizard p { margin: 6px 0; color: var(--pt-ink); }
.portal-body .portal-wizard form { display: grid; gap: 6px; }
.portal-body .portal-wizard label { display: block; margin-top: 6px; font-weight: 700; color: var(--pt-navy); }
.portal-body .portal-wizard input,
.portal-body .portal-wizard select,
.portal-body .portal-wizard textarea {
  width: 100%;
  padding: 6px 8px;
  font: inherit;
  color: var(--pt-ink);
  background: var(--pt-paper);
  border: 2px inset var(--pt-line);
  border-radius: 0;
}
.portal-body .portal-wizard input:focus,
.portal-body .portal-wizard select:focus,
.portal-body .portal-wizard textarea:focus { outline: 2px solid var(--pt-gold); outline-offset: 0; }
.portal-body .portal-wizard button,
.portal-body .portal-wizard a.wizard-new {
  display: inline-block;
  min-height: 40px;
  margin: 8px 0 0;
  margin-inline-end: 8px;
  padding: 7px 16px;
  font: inherit;
  font-weight: 700;
  color: var(--pt-ink);
  cursor: pointer;
  background: linear-gradient(180deg, var(--pt-gold-hi) 0%, var(--pt-gold) 100%);
  border: 2px outset var(--pt-gold-edge);
  border-radius: 0;
}
.portal-body .portal-wizard button:hover { text-decoration: underline; }
.portal-body .portal-wizard button:active { border-style: inset; }
.portal-body .portal-wizard button:disabled { opacity: .55; cursor: default; text-decoration: none; }
.portal-body .portal-wizard a.wizard-new { text-decoration: none; line-height: 22px; }
.portal-body .portal-wizard a.wizard-new:hover { text-decoration: underline; }
/* Each line of the prompt picks its own direction, so the JSON stays readable inside Hebrew text. */
.portal-body .portal-wizard #draft-prompt { unicode-bidi: plaintext; }
.portal-body .portal-wizard .wizard-headline { margin: 0 0 10px; font-size: 20px; font-weight: 700; color: var(--pt-navy); }
.portal-body .portal-wizard .wizard-bar { height: 18px; margin: 0 0 14px; background: var(--pt-paper); border: 2px inset var(--pt-gold-edge); }
.portal-body .portal-wizard .wizard-bar span { display: block; height: 100%; background: repeating-linear-gradient(45deg, var(--pt-gold-hi) 0 10px, var(--pt-gold) 10px 20px); background-size: 28px 28px; transition: width .6s ease; animation: wizard-stripes 1s linear infinite; }
@keyframes wizard-stripes { to { background-position: 28px 0; } }
.portal-body .portal-wizard .wizard-steps { margin: 0 0 12px; padding: 0; list-style: none; }
.portal-body .portal-wizard .wizard-steps li { position: relative; padding: 5px 0; padding-inline-start: 28px; }
.portal-body .portal-wizard .wizard-steps li::before { position: absolute; inset-inline-start: 4px; font-weight: 700; }
.portal-body .portal-wizard .wizard-steps li.done::before { content: "\2713"; color: var(--pt-navy); }
.portal-body .portal-wizard .wizard-steps li.current { font-weight: 700; }
.portal-body .portal-wizard .wizard-steps li.current::before { content: ""; top: 9px; width: 10px; height: 10px; border: 2px solid var(--pt-navy); border-top-color: transparent; border-radius: 50%; animation: wizard-spin .8s linear infinite; }
.portal-body .portal-wizard .wizard-steps li.todo { opacity: .5; }
.portal-body .portal-wizard .wizard-steps li.todo::before { content: "\2022"; }
.portal-body .portal-wizard .wizard-steps li.failed::before { content: "!"; color: var(--pt-ink); }
@keyframes wizard-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .portal-body .portal-wizard .wizard-bar span, .portal-body .portal-wizard .wizard-steps li.current::before { animation: none; } }
.portal-body .portal-wizard .wizard-note { margin: 8px 0 0; font-style: italic; }
.portal-body .portal-wizard .wizard-url { display: block; margin: 4px 0 12px; font-size: 16px; overflow-wrap: anywhere; }
.portal-body .portal-wizard .wizard-creds { margin: 0 0 8px; padding: 12px 14px; background: linear-gradient(180deg, var(--pt-gold-hi) 0%, var(--pt-gold) 100%); border: 2px outset var(--pt-gold-edge); }
.portal-body .portal-wizard .wizard-creds-title { margin: 0 0 8px; font-weight: 700; }
.portal-body .portal-wizard .wizard-creds dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 12px; margin: 0 0 8px; }
.portal-body .portal-wizard .wizard-creds dt { font-weight: 700; }
.portal-body .portal-wizard .wizard-creds dd { margin: 0; }
.portal-body .portal-wizard .wizard-creds code { padding: 2px 6px; font-size: 15px; background: var(--pt-paper); border: 1px inset var(--pt-gold-edge); user-select: all; overflow-wrap: anywhere; }
.portal-body .portal-wizard .wizard-new-row { margin-top: 18px; padding-top: 12px; border-top: 1px dotted var(--pt-navy); }
.portal-body .portal-wizard a { display: inline-block; margin: 8px 0 0; margin-inline-end: 8px; font-weight: 700; color: var(--pt-navy); }
.portal-body .portal-wizard section,
.portal-body .portal-wizard details { display: block; margin: 10px 0; padding: 10px; background: var(--pt-soft); border: 1px solid var(--pt-line); border-radius: 0; }
.portal-body .portal-wizard summary { font-weight: 700; color: var(--pt-navy); cursor: pointer; }
.portal-body .portal-wizard pre { padding: 8px 10px; font: 12.5px/1.45 "Courier New", Consolas, monospace; color: var(--pt-code-ink); background: var(--pt-code-bg); border: 2px inset var(--pt-muted); overflow: auto; }
@media (max-width: 960px) {
  .portal-grid-wizard { grid-template-columns: minmax(0, 1fr); }
}
`;

export const landingStyles = String.raw`
/* === 2002 PORTAL MEETS 2026 EDGE STYLING === */
body.portal-body {
  margin: 0;
  padding: 0;
  max-width: none;
  background-color: #d8dee9;
  background-image: radial-gradient(#bac3d4 1px, transparent 1px);
  background-size: 16px 16px;
  color: #111827;
  font: 14px/1.5 Verdana, Tahoma, "Segoe UI", system-ui, Arial, sans-serif;
}
body.portal-body.portal-rtl {
  font: 15px/1.55 Tahoma, Arial, "Segoe UI", system-ui, sans-serif;
}
.portal-shell {
  max-width: 1200px;
  margin: 0 auto;
  padding: 10px 12px 28px;
}
.portal-shell main,
.portal-shell section,
.portal-shell details {
  padding: 0;
  margin-block: 0;
  border: none;
  border-radius: 0;
  background: transparent;
}
.portal-eyebrow {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  background: #0f172a;
  color: #e2e8f0;
  padding: 5px 10px;
  border: 1px solid #020617;
  border-bottom: none;
  font-size: 12.5px;
}
.portal-eyebrow a {
  color: #93c5fd;
  text-decoration: underline;
}
.portal-eyebrow a:hover {
  color: #fde047;
}
.portal-lang-switch {
  display: inline-flex;
  gap: 4px;
  vertical-align: middle;
}
.portal-lang-pill {
  display: inline-block;
  padding: 1px 6px;
  background: #1e293b;
  color: #e2e8f0 !important;
  border: 1px solid #475569;
  text-decoration: none !important;
  font-weight: 700;
  font-size: 12px;
}
.portal-lang-pill:hover {
  background: #334155;
  color: #fde047 !important;
}
.portal-lang-active {
  background: #ffcc00;
  color: #0f172a !important;
  border-color: #fde047;
}
.portal-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #22c55e;
  border: 1px solid #86efac;
  margin-inline-end: 5px;
  vertical-align: middle;
}
.portal-masthead {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  background: linear-gradient(180deg, #003366 0%, #002244 65%, #001833 100%);
  color: #ffffff;
  padding: 14px 16px;
  border: 2px solid #001226;
  box-shadow: inset 0 1px 0 #3b82f6;
}
.portal-brand {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1 1 460px;
}
.portal-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  height: 68px;
  background: #ffcc00;
  color: #001833;
  border: 2px outset #fef08a;
  font-family: "Trebuchet MS", Impact, Arial Black, sans-serif;
  text-align: center;
  padding: 4px;
}
.portal-badge-top {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 0.5px;
  line-height: 1;
}
.portal-badge-sub {
  font-size: 10px;
  font-weight: 700;
  margin-top: 4px;
  padding-top: 3px;
  border-top: 1px solid #001833;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
.portal-title {
  margin: 0;
  font: 700 27px/1.15 "Trebuchet MS", Verdana, Tahoma, "Segoe UI", sans-serif;
  color: #ffffff;
  letter-spacing: -0.2px;
  text-shadow: 1px 1px 0 #000d1a;
}
.portal-title-tag {
  display: inline-block;
  font: 700 12px/1 Tahoma, Verdana, sans-serif;
  background: #1d4ed8;
  color: #fef08a;
  border: 1px solid #60a5fa;
  padding: 2px 6px;
  vertical-align: middle;
  margin-inline-start: 6px;
  text-transform: uppercase;
}
.portal-subtitle {
  margin: 5px 0 0;
  font-size: 13.5px;
  color: #cbd5e1;
  max-width: 560px;
}
.portal-cta-box {
  flex: 0 1 320px;
  background: #f8fafc;
  color: #0f172a;
  border: 2px outset #cbd5e1;
}
.portal-cta-header {
  background: #ffcc00;
  color: #0f172a;
  font-weight: 700;
  font-size: 11.5px;
  letter-spacing: 0.6px;
  padding: 3px 8px;
  border-bottom: 1px solid #94a3b8;
  text-align: center;
}
.portal-cta-body {
  padding: 8px 10px;
  text-align: center;
}
.portal-btn-primary {
  display: inline-block;
  background: linear-gradient(180deg, #ffdd57 0%, #f59e0b 100%);
  color: #0f172a !important;
  font-weight: 700;
  font-size: 14.5px;
  text-decoration: none;
  padding: 7px 14px;
  border: 2px outset #fde68a;
  cursor: pointer;
}
.portal-btn-primary:hover {
  background: linear-gradient(180deg, #fef08a 0%, #fbbf24 100%);
  text-decoration: underline;
}
.portal-btn-primary:active {
  border-style: inset;
}
.portal-btn-lg {
  font-size: 15.5px;
  padding: 9px 18px;
}
.portal-btn-secondary {
  display: inline-block;
  background: #e2e8f0;
  color: #0f172a !important;
  font-weight: 700;
  font-size: 13.5px;
  text-decoration: none;
  padding: 8px 12px;
  border: 2px outset #f8fafc;
}
.portal-btn-secondary:hover {
  background: #f1f5f9;
  text-decoration: underline;
}
.portal-btn-bevel {
  display: block;
  text-align: center;
  background: #003366;
  color: #ffffff !important;
  font-weight: 700;
  font-size: 13.5px;
  text-decoration: none;
  padding: 6px 10px;
  border: 2px outset #3b82f6;
}
.portal-btn-bevel:hover {
  background: #004080;
  color: #fde047 !important;
}
.portal-cta-he {
  margin-top: 5px;
  font-size: 13px;
  font-weight: 700;
}
.portal-cta-he a {
  color: #003366;
  text-decoration: underline;
}
.portal-cta-meta {
  margin-top: 4px;
  font-size: 11.5px;
  color: #475569;
}

/* CHANNEL TABS */
.portal-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  background: #94a3b8;
  padding: 4px 6px 0;
  border-left: 2px solid #001226;
  border-right: 2px solid #001226;
}
.portal-tab {
  display: inline-block;
  padding: 5px 12px;
  background: #dce3ee;
  color: #0f172a;
  font-weight: 700;
  font-size: 12.5px;
  text-decoration: none;
  border: 1px solid #475569;
  border-bottom: none;
}
.portal-tab:hover {
  background: #ffffff;
  color: #003366;
}
.portal-tab-active {
  background: #ffffff;
  color: #003366;
  border-top: 2px solid #f59e0b;
}
.portal-tab-lang {
  margin-inline-start: auto;
  background: #fef08a;
  color: #0f172a;
}

/* TICKER RIBBON */
.portal-resume {
  margin: 0 0 8px;
  padding: 6px 10px;
  font-weight: 700;
  color: var(--pt-ink);
  background: linear-gradient(180deg, var(--pt-gold-hi) 0%, var(--pt-gold) 100%);
  border: 2px outset var(--pt-gold-edge);
}
.portal-resume a { color: var(--pt-navy); }
.portal-ticker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  background: #fefce8;
  border: 1px solid #64748b;
  padding: 5px 10px;
  margin-bottom: 10px;
  font-size: 12.5px;
}
.portal-ticker-label {
  background: #b91c1c;
  color: #ffffff;
  font-weight: 700;
  font-size: 11.5px;
  padding: 1px 6px;
  letter-spacing: 0.4px;
}
.portal-ticker-text {
  color: #1e293b;
}

/* 3-COLUMN PORTAL LAYOUT */
.portal-grid {
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr) 260px;
  gap: 10px;
  align-items: start;
}
.portal-col-left,
.portal-col-main,
.portal-col-right {
  display: grid;
  min-width: 0;
  gap: 10px;
}

/* SCREENSHOT GALLERY: 2x2 portal windows */
.portal-shots-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-width: 0;
  gap: 10px;
}
.portal-shot-card {
  min-width: 0;
  margin: 0;
  background: #ffffff;
  border: 1px solid #64748b;
  box-shadow: 1px 1px 0 #94a3b8;
}
.portal-shot-winbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 3px 6px;
  background: linear-gradient(90deg, #003366 0%, #1e3a8a 100%);
  color: #ffffff;
  font-size: 12px;
}
.portal-shot-title {
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.portal-shot-zoom {
  flex: none;
  color: #fde047;
  font-size: 11.5px;
}
.portal-shot-img-link {
  display: block;
}
.portal-shot-img {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
}
.portal-shot-caption {
  padding: 6px 8px;
  font-size: 12.5px;
  color: #334155;
  line-height: 1.45;
  border-top: 1px solid #cbd5e1;
}
.portal-shot-caption strong {
  color: #003366;
}

/* PORTAL BOXES */
.portal-box {
  background: #ffffff;
  border: 1px solid #64748b;
  box-shadow: 1px 1px 0 #94a3b8;
}
.portal-box-highlight {
  border-color: #003366;
  background: #f8fafc;
}
.portal-box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  background: linear-gradient(90deg, #003366 0%, #1e3a8a 100%);
  color: #ffffff;
  font-weight: 700;
  font-size: 12.5px;
  padding: 5px 8px;
  border-bottom: 1px solid #0f172a;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.portal-header-right {
  font-weight: 400;
  font-size: 11.5px;
  color: #fde047;
  text-transform: none;
}
.portal-box-body {
  padding: 10px;
}
.portal-box-flush {
  padding: 0;
}

/* HERO CARD */
.portal-hero-card {
  background: #ffffff !important;
  border: 2px solid #003366 !important;
  box-shadow: 2px 2px 0 #94a3b8;
}
.portal-hero-banner {
  padding: 14px 16px;
  background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);
}
.portal-hero-kicker {
  font-size: 11.5px;
  font-weight: 700;
  color: #1d4ed8;
  letter-spacing: 0.7px;
  margin-bottom: 4px;
}
.portal-hero-headline {
  margin: 0 0 8px;
  font: 700 24px/1.25 "Trebuchet MS", Verdana, Tahoma, "Segoe UI", sans-serif;
  color: #0f172a;
}
.portal-hero-lead {
  margin: 0 0 12px;
  font-size: 14.5px;
  line-height: 1.5;
  color: #1e293b;
}
.portal-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding-top: 8px;
  border-top: 1px dotted #94a3b8;
}

/* LYCOS-STYLE DIRECTORY GRID */
.portal-directory-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.portal-dir-item {
  padding: 8px;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
}
.portal-dir-item h3 {
  margin: 0 0 3px;
  font-size: 14.5px;
  color: #003366;
}
.portal-folder {
  color: #d97706;
  margin-inline-end: 4px;
}
.portal-dir-links {
  margin: 0 0 5px;
  font-size: 12.5px;
  font-weight: 700;
  color: #1d4ed8;
}
.portal-dir-desc {
  margin: 0;
  font-size: 13px;
  color: #334155;
}

/* COMMUNITY DIRECTORY (WHAT WILL YOURS BE ABOUT?) */
.portal-topic-grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 14px;
}
.portal-topic-grid li {
  padding-inline-start: 8px;
  border-inline-start: 3px solid #f59e0b;
}
.portal-topic-grid a {
  font-weight: 700;
  color: #003366;
  text-decoration: underline;
}
.portal-topic-grid a:hover {
  color: #b91c1c;
}
.portal-topic-grid span {
  display: block;
  font-size: 12.5px;
  color: #475569;
}
.portal-topic-note {
  margin-top: 10px !important;
  padding-top: 8px;
  border-top: 1px dotted #94a3b8;
}

/* CLASSIC FORUM TABLE PREVIEW */
.portal-board-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.portal-board-table th {
  background: #dce3ee;
  color: #0f172a;
  text-align: start;
  padding: 5px 8px;
  border-bottom: 1px solid #64748b;
  font-size: 12.5px;
}
.portal-board-table td {
  padding: 7px 8px;
  border-bottom: 1px solid #cbd5e1;
  vertical-align: top;
}
.portal-board-table tr:nth-child(even) td {
  background: #f8fafc;
}
.portal-room-name {
  font-weight: 700;
  color: #003366;
  font-size: 13.5px;
}
.portal-room-desc {
  color: #475569;
  font-size: 12.5px;
  margin-top: 2px;
}
.portal-num {
  text-align: center !important;
  white-space: nowrap;
}
.portal-tag {
  display: inline-block;
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #7dd3fc;
  padding: 1px 5px;
  font-size: 11.5px;
  font-weight: 700;
}
.portal-lastpost {
  font-size: 12.5px;
  color: #334155;
}
.portal-lastpost span {
  color: #64748b;
  font-size: 12px;
}

/* SIDEBAR LISTS & TABLES */
.portal-steps {
  margin: 0;
  padding-inline-start: 18px;
  font-size: 13px;
  display: grid;
  gap: 6px;
}
.portal-mini-cta {
  margin-top: 10px;
}
.portal-spec-table,
.portal-compare-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.portal-spec-table th,
.portal-spec-table td,
.portal-compare-table th,
.portal-compare-table td {
  padding: 4px 6px;
  border-bottom: 1px solid #e2e8f0;
  text-align: start;
}
.portal-spec-table th {
  color: #475569;
  font-weight: 700;
  width: 42%;
  background: #f8fafc;
}
.portal-compare-table th {
  background: #dce3ee;
  color: #0f172a;
  border-bottom: 1px solid #64748b;
}
.portal-list,
.portal-check-list,
.portal-links-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 7px;
  font-size: 13px;
}
.portal-list li strong {
  display: block;
  color: #003366;
}
.portal-list li span {
  color: #475569;
  font-size: 12.5px;
}
.portal-check-list li {
  padding-inline-start: 14px;
  position: relative;
}
.portal-check-list li::before {
  content: "■";
  color: #003366;
  position: absolute;
  inset-inline-start: 0;
  top: 0;
  font-size: 11.5px;
}
.portal-small-copy {
  margin: 0 0 7px;
  font-size: 13px;
  color: #334155;
}
.portal-small-copy:last-child {
  margin-bottom: 0;
}
.portal-he-note {
  margin: 0 0 6px;
  font-size: 13.5px;
  line-height: 1.45;
}
.portal-he-note:last-child {
  margin-bottom: 0;
}
.portal-links-list a {
  color: #003366;
  text-decoration: underline;
}
.portal-links-list a:hover {
  color: #b91c1c;
}
.portal-console-split {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-items: center;
}
.portal-code-box {
  margin: 0;
  padding: 8px 10px;
  background: #0f172a;
  color: #86efac;
  border: 2px inset #334155;
  font: 12.5px/1.45 "Courier New", Consolas, monospace;
  text-align: left;
  white-space: pre;
  overflow-wrap: normal;
  overflow-x: auto;
}

/* BOTTOM BANNER */
.portal-bottom-cta {
  margin-top: 12px;
  padding: 12px 16px !important;
  background: linear-gradient(90deg, #002244 0%, #003366 100%) !important;
  color: #ffffff;
  border: 2px solid #001226 !important;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.portal-bottom-cta h2 {
  margin: 0 0 2px;
  font-size: 18px;
  color: #fde047;
}
.portal-bottom-cta p {
  margin: 0;
  font-size: 13.5px;
  color: #e2e8f0;
}

/* FOOTER */
.portal-footer {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #94a3b8;
  text-align: center;
  font-size: 12.5px;
  color: #475569;
}
.portal-footer-badges {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin-bottom: 6px;
}
.portal-micro-badge {
  display: inline-block;
  font: 11px/1.2 Tahoma, Verdana, sans-serif;
  background: #e2e8f0;
  color: #0f172a;
  border: 1px solid #64748b;
  padding: 2px 6px;
}
.portal-micro-badge strong {
  color: #003366;
}

/* RESPONSIVE BREAKPOINTS */
@media (max-width: 960px) {
  .portal-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .portal-col-main {
    order: -1;
  }
}
@media (max-width: 640px) {
  .portal-shell {
    overflow-wrap: anywhere;
  }
  .portal-box-header {
    flex-wrap: wrap;
  }
  .portal-board-table {
    table-layout: fixed;
  }
  .portal-directory-grid,
  .portal-console-split,
  .portal-shots-grid {
    grid-template-columns: 1fr;
  }
  .portal-topic-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .portal-tab {
    padding: 8px 12px;
  }
  .portal-masthead {
    padding: 12px;
  }
  .portal-cta-box {
    flex: 1 1 100%;
  }
}
${wizardStyles}`;
