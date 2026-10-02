# Layout: widths and breakpoints

Shared layout guidance for EXTB. Keep layout decisions in tracked documentation so every contributor can use them.

## Why this exists

Until 2026-07-29 there was **no width spec at all**. The only `:root` in the
codebase (`src/views/layout.ts`) held colours plus `--base-font-size`, and every
view invented its own number:

| Surface | Desktop | Mobile |
|---|---|---|
| Chat message | 92% | 95% |
| DM bubble | 60% | 85% |
| Topic/post | none (90% via legacy `#forum`) | none |
| Static pages | 800px (inlined 9x) | same |
| Auth forms | 480px (inlined 10x) | same |
| ToS | 1100px | same |
| `.main` shell | **uncapped** | uncapped |

That is how the DM thread ended up using half the page on desktop while
ballooning to 1418px on a 2560px monitor.

## Rules

1. **The mobile switch is `768px`, sitewide.**
   - Mobile: `@media (max-width: 768px)`
   - Desktop: `@media not all and (max-width: 768px)`

2. **Never pair `max-width: 768px` with `min-width: 769px`.** A fractional
   viewport (768.5px - routine under browser zoom and HiDPI) matches *neither*,
   so the view silently falls back to unstyled defaults. This shipped in
   `dms.ts` and went unnoticed.

3. **An epsilon does not fix it.** `min-width: 768.02px` merely shrinks the dead
   zone to `(768, 768.02)`; 768.01px still matches neither. Any `min-width`
   leaves some gap - only `not all and (...)` is provably complementary.

4. **Do not move the mobile edge to `767.98px` either.** The page shell in
   `layout.ts` switches at `max-width: 768px`; at exactly 768px the shell would
   go mobile while your view went desktop.

5. **Content caps come from a `:root` token, never a literal in a view.**
   Chat-shaped surfaces (DM, chat) use
   `max-width: min(var(--measure-chat), var(--measure-chat-max))`.

6. **`.main` is intentionally uncapped** - it sets padding only, no max-width.
   Any column needing a cap sets its own from a token.

7. **A bare `%` cap is a percentage of an uncapped column**, so it behaves
   differently on every monitor. Always pair it with a `ch`/`px` ceiling via
   `min()`.

## Tokens

Defined in `src/views/layout.ts` `:root`:

| Token | Value | Meaning |
|---|---|---|
| `--measure-chat` | `92%` | share of the column a chat-shaped bubble may use |
| `--measure-chat-max` | `110ch` | ceiling so ultrawide monitors don't produce 1400px lines |
| `--chat-win-h` | `380px` | phone floating chat window, default size |
| `--chat-dock-pct` | `25vw` | viewer's chosen dock width (drag divider, 15-75vw, saved per device) |
| `--chat-dock-w` | `clamp(280px, var(--chat-dock-pct), calc(100vw - 720px))` | docked column width: >=280px, and `.main` keeps >=480px beside the 240px sidebar |

## The chat dock and its 1200px edge

`src/views/chat-dock.ts` adds one more switch, used **only** by the dock:

| Viewport | Dock mode | Query |
|---|---|---|
| >= 1200px | third `.layout` grid column, open by default | `@media not all and (max-width: 1199px)` |
| 769-1199px | fixed overlay from the right, closed by default | `@media (max-width: 1199px)` |
| <= 768px | floating window 12px inside the screen edges, 12px above the tab bar (which never moves): default `--chat-win-h` (380px, capped to the viewport), large = up to 12px under the topnav. Opened from a round chat button stacked 12px above the + button; size button cycles default -> large -> closed | `@media (max-width: 768px)` |

Same rule as the 768 switch: the docked and overlay queries are an exact
complement, so a fractional viewport (1199.5px) is always in exactly one mode.
Why 1200: below it, the 240px sidebar plus a usable dock leave `.main` too narrow.

The width is the viewer's to set: a drag divider on the dock's left edge
writes `--chat-dock-pct` (default 25vw). The docked column clamps it via
`--chat-dock-w`; the overlay uses `clamp(280px, var(--chat-dock-pct),
calc(100vw - 60px))`. Phones keep a full-width drawer with no divider.

Measured (docked, sidebar collapsed): `.main` is 800px at 1200, 1040px at
1440; the dock never causes horizontal overflow at any of 390 / 768 / 769 /
900 / 1024 / 1199 / 1200 / 1440 / 1920 / 2560. The 72px overflow at 769px is
the pre-existing topnav issue below, present with the dock closed.

Measured effect on the DM thread:

| Viewport | Before | After |
|---|---|---|
| 390px | 304px | 304px (unchanged) |
| 768px | 626px | 626px (unchanged) |
| 1200px | 602px | 918px |
| 1920px | 1034px | 918px |
| 2560px | 1418px | 918px |

## Verifying layout changes

Use a local development installation with neutral fixture members and conversations:

```sh
npm run db:local
npm run dev
```

Complete setup, invite a second fixture member, and create a discussion and DM through the interface. Check the same pages at 390, 768, 768.5, 769, 1199.5, 1200, 1920, and 2560 pixel viewport widths.

Check that exactly one complementary breakpoint matches, bubbles stay within their columns, the chat dock opens in the correct mode, navigation stays accessible, and dark mode uses readable token colors. Also test HTMX navigation into each changed page because it can skip full-page initialization.

The original project's standalone width scripts are not included in EXTB. Do not use production databases or member data as fixtures. Keep test screenshots and local data outside the committed source. The curated README image is a neutral documentation fixture.

## Areas to review when changing layout

- Navigation between mobile and wide desktop widths, especially near 769 pixels.
- Chat surfaces that still use literal percentage widths instead of shared tokens.
- Duplicate `.card` declarations in the main layout stylesheet.
- Legacy colors and sizing in `public/css/forum.css`.
- Per-view breakpoints across admin and static views.

These are inherited implementation details to inspect when modifying affected surfaces, not assertions of a newly measured defect.
