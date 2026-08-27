# Brand

This application follows the **WordLift Core Brand** design system. The rules below are the parts
that constrain the code; the full system lives with the WordLift team.

## Colour

| Token | Hex | Where it is used here |
|---|---|---|
| Sky | `#3452DB` | The only primary interactive colour: buttons, links, focus rings, the highlighted word in a title, the agent-readiness score card |
| Neutral 900 | `#191919` | Body text, dark surfaces (contract viewer, sidecar output) |
| Neutral 500 | `#A1A7AF` | Tertiary text, unsupported states |
| Neutral 100 | `#F6F6F7` | Page tint, stage columns, inset panels |
| Neutral 0 | `#FFFFFF` | Cards and panels |
| Leaf | `#22A286` | `agent-ready` state, WebMCP live badge |
| Sand | `#C2A41D` | `unverified` state, partial-report banner |
| Moss | `#125054` | `human-only` state, supported-evidence text |
| Petal | `#A10269` | `sidecar-enabled` state and the approved-sidecar panel — the hero moment |
| Danger | `#C53030` | `missing` state (non-brand red, per the system's status guidance) |

**Contrast is paired, not guessed.** Each state fill carries the text colour that clears WCAG AA
against it, from the brand book's verified table: black on Leaf and Sand, white on Moss, Petal, and
the danger red. That pairing is encoded in `--state-*-ink` tokens in
[`src/client/styles/app.css`](../src/client/styles/app.css) — change a state colour and you must
change its ink token with it.

Berry (`#D55471`) is deliberately unused: it clears AA at neither body size against white nor black,
and every state colour here carries small uppercase label text.

## Typography

| Role | Family | Treatment |
|---|---|---|
| Display and headings | Bricolage Grotesque | `-0.02em` tracking at ≥36px |
| Body | Open Sauce Sans | 16px / 1.5 |
| Labels, badges, metadata, code | DM Mono | **UPPERCASE**, `0.12em` tracking |

### Why not Denim INK

Denim INK is WordLift's licensed display face (Pangram Pangram, commercial). It is **not**
redistributed in this public repository. The build uses **Bricolage Grotesque**, the metric-similar
fallback the WordLift design system names for exactly this case. The `--font-display` stack lists
Denim INK first, so a WordLift-internal deployment that installs the licensed file gets the real
face with no code change.

All three shipped families are self-hosted under `public/fonts/` and are OFL-licensed
(Bricolage Grotesque, Open Sauce Sans, DM Mono). Nothing is fetched from a font CDN at runtime,
which keeps the Content-Security-Policy restricted to `'self'`.

## The marks

`public/brand/` carries the wordmark (Sky and white) and the icon (Sky). Rules that apply here:

- The icon's W is optically corrected for a contained square. It is **not** a cropped wordmark, and
  the two are not interchangeable.
- Clearspace is ½ the W height on every side; the header reserves it with margin.
- The wordmark is never below 80px wide on screen, and the icon never below 24px (16px as a favicon).
- The wordmark exists in Sky, black, and white only — never recoloured, stretched, or rotated.

WordLift marks and branding remain the property of WordLift. The Apache-2.0 licence covers the code,
not the trademarks.
