---
name: Refined-X
description: Refined-X black-and-white editorial personal site; Ask entry with restrained tech motion
colors:
  bg: "#ffffff"
  bg-sunken: "#f5f5f3"
  surface: "#ffffff"
  ink: "#161618"
  text: "rgba(22, 22, 24, 0.84)"
  muted: "rgba(22, 22, 24, 0.7)"
  faint: "rgba(22, 22, 24, 0.62)"
  line: "rgba(22, 22, 24, 0.13)"
  line-soft: "rgba(22, 22, 24, 0.07)"
  field: "#ffffff"
  invert-bg: "#161618"
  invert-text: "#fafafa"
  focus: "#005fcc"
  bg-dark: "#0c0c0e"
  ink-dark: "#f3f3f4"
  bg-canvas-light: "linear-gradient(180deg, #d5e6fb 0%, #ffffff 100%)"
  bg-canvas-dark: "linear-gradient(180deg, #17243d 0%, #0c0c0e 100%)"
typography:
  display:
    fontFamily: "Spectral, Songti SC, Noto Serif SC, Georgia, serif"
    fontSize: "clamp(32px, 4.8vw, 52px)"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.008em"
  title:
    fontFamily: "Spectral, Songti SC, Noto Serif SC, Georgia, serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, Noto Sans SC, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.65
  ask-input:
    fontFamily: "{typography.body.fontFamily}"
    fontSize: "clamp(18px, 2.4vw, 22px)"
    fontWeight: 400
    letterSpacing: "-0.012em"
  mono:
    fontFamily: "SF Mono, ui-monospace, JetBrains Mono, Roboto Mono, Menlo, Consolas, monospace"
    fontSize: "11px"
rounded:
  sm: "4px"
  lg: "10px"
  pill: "100px"
spacing:
  wrap-x: "32px"
  section: "64px"
  ask-stage-y: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "6px 13px"
  ask-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "22px 28px"
---

## Overview

**The Monochrome Signal**: a personal editorial site that reads like a carefully typeset notebook, with AI entry points that feel alive but never loud.

Mood: forward-looking engineer, calm desk, high contrast, no color accents. Hierarchy comes from Spectral display type, ink-on-paper contrast, and spacing rhythm. Conversational surfaces (`/ask`, header overlay) may use moderate motion (focus glow, subtle breathe, input feedback) while articles and archives stay static.

Anti-feel: SaaS cream, purple gradients, glass cards, gradient text, hero metrics, corporate carousels, dev-blog clutter, neon Web3.

## Colors

Neutral-only system, plus one blue wash: the page canvas fades from a cool blue at the top of the viewport into the flat page color (`bg-canvas`), so the top of every page reads slightly colder than the body. Light theme: warm off-white sunken bands (`bg-sunken`), ink text, hairline borders (`line`, `line-soft`). Dark theme inverts via `[data-theme="dark"]` with deep charcoal bases, never pure `#000` / `#fff`.

| Role | Token | Use |
|------|-------|-----|
| Canvas | `bg`, `bg-sunken` | Page ground, ask-stage band |
| Ink | `ink`, `text`, `muted`, `faint` | Hierarchy through opacity |
| Structure | `line`, `line-soft` | Borders, dividers |
| Fields | `field` | Inputs, panels |
| Invert | `invert-bg` / `invert-text` | Primary buttons |
| Focus | `focus` | `:focus-visible` rings |

No chromatic accent in v1. AI "tech" feeling comes from elevation, motion, and scale on ask surfaces, not hue.

**Sanctioned blues.** Three surfaces are allowed to leave the neutral system, all derived from the same two anchors (`#d5e6fb` canvas blue, `#005fcc` focus blue): the reading-progress `.water-ball`; the home-page deep-sea intro — a bounded set of ocean blues (`--ds-shallow #7fb4d8`, `--ds-mid #2d6f9c`, `--ds-deep #0b2942`, `--ds-abyss #061c2e`, lifting to the canvas blue `#d5e6fb` as it hands off to the hero, with `#04121f` / `#17243d` in the dark theme); and the `/links/` sonar — `#005fcc` for the signals, the sweep and the centre node in the light theme, `#7fb4d8` in the dark one, at low opacity, with every ring, tick and hairline mixed from `--ink`. The intro never uses pure black, never neon, and exists only on `/` and `/en/`; the sonar exists only on `/links/` and `/en/links/` and never turns into a neon radar.

## Typography

- **Display / section titles**: Spectral, medium weight, tight tracking on heroes and page headings.
- **Body**: System sans stack, 16px / 1.65, max ~65–75ch in prose.
- **Ask input**: Oversized sans (18–22px), placeholder carries page intent on `/ask`.
- **Meta / machine links**: Mono at 11–13px for agent footers and labels.

Scale contrast between display and body should stay ≥1.25. Avoid flat same-size headings.

## Elevation

Two-tier shadow vocabulary:

- `--shadow`: ambient card lift (panels, results)
- `--shadow-lift`: ask hero, primary conversational block

Flat elsewhere. No nested cards. Ask stage uses full-width sunken band + lifted input, not a card inside a card.

**AI motion (moderate, ask zones only)**

- Focus: 4px ink-tinted outer ring + border snap to `ink`
- Optional: subtle icon opacity transition on focus-within
- Future: light breathe / particle on `/ask` stage only; gate with `prefers-reduced-motion`
- Never animate layout properties (width, height, margin)

## Components

| Component | Notes |
|-----------|-------|
| `.ask` / `.ask-stage` | Signature conversation box; spark icon, large input, solid ink submit |
| `.chip` | Pill outline, muted default, ink border on hover |
| `.icon-btn` | 36×36 chrome actions (spark, theme) |
| `.btn-solid` / `.btn-ghost` | Ink fill vs outline |
| `.answer-index-item` | Full-width FAQ rows, no side stripes |
| `.prose` | Article body, editorial measure |
| `.water-ball` | Reading progress ball on articles, `/projects/`, `/about/`; one of the three sanctioned blue surfaces |
| `.gb-*` | Guestbook composer, message rows, emoji popover; chrome stays monochrome so the picked emoji read as the only colour |
| `.ls-*` | `/links/` sonar: ring and scale hairlines, one slowly sweeping sector, a dot per signal (each lit as the sweep crosses it), a centre `◎ HYD` node and a HUD card clamped inside the stage. Dots carry a 26px hit area; blue lives only in the signal layer |
| `.deep-intro` / `.ds-*` | Home-page deep-sea intro: one fine-ticked pressure dial, three readouts, four quiet corner labels, marine snow, slow water ripples, a `SKIP INTRO` control. Home only, 7.5 s, removed from the DOM when it ends |

Header wordmark: Spectral, from `site.config.mjs` `brand[locale].wordmark`. User-facing persona comes from `brand[locale].persona` (per-locale brand copy, default locale `zh-CN`).

**Guestbook** (`/guestbook/`): one composer for every message (`Enter` keeps its newline, the button sends), a floating emoji picker, and a quiet message list. Replies indent one level and carry no side stripes; the neutral chrome is deliberate, keep it that way.

**Reading progress ball** (articles, `/projects/`, `/about/`): a fixed bottom-right ball that fills with ink as the page is scrolled, sized down on phones. It is decorative apart from the button, which scrolls back to the top; `readingProgress.enabled` turns the whole thing off.

**Deep-sea intro** (`/` and `/en/`): the visitor descends through one instrument rather than watching a loading bar. One dial, hairline ticks, a floating pointer, three readouts (depth, pressure, temperature), four corner labels, faint light shafts, marine snow and slow ripples. Keep it to that: no photographs, no fish, no extra HUD for its own sake. The run is 7.5 s in six beats — start-up (each layer has its own ramp), descent, the pause at 2000 m, HYD, then the dial opening into the hero through a pale-blue water lens that lands on the exact blue `--bg-canvas` starts on. `HYD` is set in the sans stack on purpose: it is the instrument's own label, not the Spectral brand mark. Motion is transform/opacity only, never layout; `prefers-reduced-motion` skips it, `SKIP INTRO` exits immediately, and the whole overlay leaves the DOM when it ends.

**Links sonar** (`/links/`, `/en/links/`): one square stage, an inscribed set of hairlines (rings, crosshair, faint diagonals, a 10° scale), a sweep that takes 18 s per revolution, one dot per link plus a centre `◎ HYD` node (core, halo and outer ring), a faint grain layer, and a HUD of real readouts (`SIGNALS DETECTED`, `DEPTH RANGE`) above one line of station atmosphere (`LAT`/`LONG`/`TEMP`/`PRESSURE`). The sweep is a rotating conic gradient — one composited layer, not a repainted path — with a 60° tail behind its bright edge; a dot pulses and ripples as that edge crosses it, all in CSS. The page copy is localized; the readouts stay in the Latin instrument register, like the intro. Dots differ by a few percent in size and about one in eight is drawn hollow; that variation is decoration and carries no meaning. The wall of submitted links below is the one public, visitor-written surface on the site: quiet rows, `nofollow ugc`, and a state chip in the same blue as the dots for links already on the sonar. Keep it quiet — no labels next to the dots, no numbering beyond the card, no full-screen starfield: with fifty links it should still read as a sparse field, not as noise.

## Do's and Don'ts

**Do**

- Keep monochrome restraint on writing, about, projects, answers index
- Make `/ask` the visual anchor: stage band, shadow-lift, oversized placeholder
- Use spark icon for ask affordances consistently
- Respect keyboard: overlay ⌘K, form submit, chip triggers
- Tint neutrals slightly; use `color-mix` for borders and focus halos
- Keep the intro's blues inside the documented `--ds-*` set, and keep the intro on the home page only
- Keep the sonar's blue in the signal layer (`#005fcc`, `#7fb4d8` in dark) and mix every ring from `--ink`

**Don't**

- Add brand gradients beyond the page canvas wash and the three sanctioned blue surfaces, or SaaS card grids
- Use gradient text, glassmorphism, or hero metric templates
- Put heavy motion on article pages or navigation chrome
- Use left/right accent stripes on list items
- Open modals when inline ask flow suffices
- Use em dashes in UI copy
