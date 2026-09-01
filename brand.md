# NOLLI — Design System Protocol for AI Coding Agents

> **File purpose:** This document is the binding design specification for the Nolli repository. Any AI coding agent (GitHub Copilot, Antigravity, Claude Code, Cursor, or equivalent) generating HTML, CSS, JSX, or design tokens for this project **must read this file before writing UI code** and treat it as non-negotiable, not as stylistic inspiration.
>
> Place this file at the repository root as `AGENTS.md` or `DESIGN_SYSTEM.md`, and reference it from `README.md` and from any agent-specific config (`.cursorrules`, `.github/copilot-instructions.md`, Antigravity project rules) so it is loaded into context automatically.

---

## 0. How an agent should use this file

1. **Never invent a hex value, font, spacing unit, or border-radius.** Every visual property used in code must trace back to a token defined in Section 1.
2. **Never introduce a new color, font, or shadow style** to "solve" a design problem locally. If the system doesn't have a token for what's needed, stop and flag it — do not improvise.
3. When asked to build a new component, first identify which existing pattern in Section 4 it belongs to (button, card, badge, panel, grid block). Extend that pattern; do not create a parallel one.
4. Treat Section 6 ("Prohibited Patterns") as hard lint rules, equivalent in severity to a failing test.

---

## 1. Design Tokens — Single Source of Truth

All values below must be implemented as CSS custom properties (`:root` scope) or as the equivalent design-token structure of the framework in use (Tailwind config, styled-components theme, CSS-in-JS tokens). **No component may hardcode a raw hex value or px value that duplicates one of these tokens.**

```css
:root {
  /* Surfaces */
  --bg:            #F8F1DF; /* primary canvas / paper */
  --bg-panel:      #F8F1DF; /* same as bg — panels do not float on a different tone by default */
  --bg-elevated:   #F0E9D2; /* overlays, elevated surfaces, modals */

  /* Ink */
  --ink:           #141411; /* primary text, structural lines, grid rules */
  --ink-dim:       #6B6B6B; /* secondary text, metadata, captions */
  --border:        #D8D6CE; /* soft internal dividers, non-structural */
  --border-strong: #141411; /* structural grid lines — ALWAYS black, never a theme color */

  /* Brand */
  --brand:         #E95C0C; /* Vermillion / Bauhaus Orange — identity, primary CTA, symbol */

  /* Semantic (Bauhaus primaries) — system state, NEVER brand identity */
  --semantic-select:  #EFBC02; /* Constructivist Mustard — selection, active, info */
  --semantic-info:    #064773; /* Deep Blue — secondary info, links, informational states */
  --semantic-alert:   #D6201D; /* Alert Red — errors, destructive actions, warnings */

  /* Categorization (architectural typology badges ONLY) */
  --cat-residential:     #E95C0C;
  --cat-institutional:   #EFBC02; /* "Dotacional" */
  --cat-industrial:      #064773;
  --cat-religious:       #F2ACCD;
  --cat-commercial:      #4388C6;
  --cat-public-space:    #0D682F;
  --cat-infrastructure:  #E41F23;
  --cat-other:           #691B14;

  /* Typography */
  --font-display: 'League Spartan', sans-serif;
  --font-body:    'Inter', sans-serif;

  /* Spacing (8px base unit — no arbitrary values) */
  --space-1: 8px;
  --space-2: 16px;
  --space-3: 24px;
  --space-4: 32px;
  --space-6: 48px;
  --space-8: 64px;

  /* Structure */
  --radius: 0px;                 /* default for ALL layout containers */
  --border-width-hairline: 1px;
  --border-width-strong: 2px;
  --shadow-hard: 4px 4px 0px var(--ink); /* the only shadow allowed */
}
```

### ⚠️ Correction against the previously supplied `brand.md`
The reference file included with this prompt mislabels two colors — it calls `#EFBC02` **"Constructivist Blue"** and `#064773` **"Mustard/Warm Yellow"**, which is inverted: `#EFBC02` is a mustard/yellow, `#064773` is a deep blue. The token names above (`--semantic-select` / `--semantic-info`) are named by **function**, not by color word, specifically to prevent this class of naming error from ever reaching production code. Agents must use the functional token names, never a color-word alias.

The uploaded reference also omits the Alert Red (`#D6201D`) and the eight categorization colors — both are part of the canonical system and are included above. Any component touching error states or typology badges must use these, not the semantic Mustard/Blue pair.

---

## 2. Typography Rules

| Role | Font | Weight | Rules |
|---|---|---|---|
| `h1`–`h4`, UI badges, numeric data, section labels | `var(--font-display)` (League Spartan) | `700`–`900` | Tight tracking, frequent uppercase for labels/badges, dramatic scale jump vs. body. **Never italic.** Never used for paragraph-length text. |
| `p`, `span`, lists, captions, metadata, form inputs | `var(--font-body)` (Inter) | `400`–`500` | `line-height: 1.5`–`1.6`, controlled measure (~65–75 characters per line max), standard tracking. Never used for `h1`/`h2`. |

No third typeface may be introduced anywhere in the product, including loading states, error states, or marketing pages, without an explicit system-wide amendment to this file.

---

## 3. Layout Philosophy — Neo-Bauhaus / Editorial Grid

- **Reject the generic SaaS template.** No soft rounded cards, no subtle drop shadows, no centered-everything layouts. The viewport is treated as an asymmetric editorial poster grid, not a dashboard.
- **Structural black lines are load-bearing.** `var(--border-strong)` (`#141411`) is used for the grid rules that divide the layout into sections. These lines are always solid, always black, `1px`–`2px`, never a brand or semantic color, never dashed or dotted.
- **Asymmetry over centering.** Headlines and text blocks default to left-alignment with a ragged right edge. Full-width centered headlines are the exception, reserved for cover/hero moments, not standard content blocks.
- **Flat geometry, no depth simulation.** Solid circles, rectangular color fields, and overlapping flat shapes are acceptable structural/background motifs. Blurred shadows, glassmorphism, gradients, and glow effects are not — depth, when needed, is communicated only via `var(--shadow-hard)` (hard-offset, zero blur).
- **Sharp corners everywhere.** `border-radius: var(--radius)` (`0px`) on every layout container: cards, panels, buttons, inputs, modals. There is no "soft" variant.
- **Spacing follows the 8px scale exclusively** (Section 1). Generous macro-whitespace should frame dense typographic/data zones — the contrast between empty and dense is a compositional tool, not something to smooth over.

---

## 4. Component Patterns

### Buttons / CTAs
- Rectangle, `border-radius: 0`.
- Primary: solid `var(--brand)` background, `var(--bg)` text, `var(--font-display)` uppercase, bold.
- Secondary: solid `var(--ink)` background, `var(--bg)` text.
- Destructive: solid `var(--semantic-alert)` background.
- Hover/focus state: apply `var(--shadow-hard)` and/or a `2px` offset border in `var(--ink)` — never a color/opacity fade transition, never a scale transform.

### Cards & Containers
- Framed with a solid `var(--border-strong)` rule (not a soft `var(--border)`) when the card represents a primary content unit (e.g., an obra/work card).
- Background alternates strictly between `var(--bg)`, `var(--bg-elevated)`, or a flat accent color — never a gradient, never a translucent glass background.
- No rounded corners under any circumstance.

### Category badge (the only place `--cat-*` tokens may appear)
- Small solid rectangle or dot, `var(--font-display)` uppercase label if text is included.
- Fixed position within its parent card (top-left of the media block, consistently across the entire catalog — see brand manual, Section 04).
- A category color must never bleed into the card background, the card border, or any text color outside the badge itself.

### Error / empty states
- Copy follows the Nolli voice guide: declarative, no exclamation marks, no apology, always paired with an action ("Retry", "Reset filters").
- Visual treatment: `var(--semantic-alert)` used only as a small icon or 2px accent rule — never as a full-bleed background for an error screen.

---

## 5. Responsive Behavior

- Multi-column asymmetric grids collapse to a **single column** below the tablet breakpoint.
- Typographic scale contrast (large display type vs. small body type) must be **preserved** on mobile — do not compress the type scale toward uniformity to "fit more."
- Structural black divider lines persist at every breakpoint; they may reduce from `2px` to `1px` on mobile but never disappear.
- Touch targets follow the 8px spacing scale for padding (minimum `--space-2` / 16px internal padding on interactive elements).

---

## 6. Prohibited Patterns (hard rules — treat as lint errors)

1. **No `border-radius` greater than `0px` on any layout container** (cards, panels, buttons, modals, inputs). Fully circular elements (the brand symbol, avatar dots) are the only exception, and must use `border-radius: 50%` explicitly, never a token.
2. **No blurred/soft shadows, gradients, or glow effects** anywhere in the system. The only permitted shadow is `var(--shadow-hard)`.
3. **No use of `--brand` (`#E95C0C`) as a large background surface** (full sections, full cards, full-screen backgrounds). It is reserved for compact accents, symbols, and primary CTAs — see the brand manual's "prohibited actions" list.
4. **No mixing of category colors (`--cat-*`) into semantic or structural roles.** A category color may only ever style a category badge. It cannot color a button, a structural border, a link, or an error state, even when the content it labels belongs to that category.
5. **No third-party font fallback in production** (system-ui, Arial, etc.) beyond a controlled loading-state fallback. If `League Spartan` or `Inter` fail to load, the fallback stack must still be explicitly defined in the token file, not left to browser default.
6. **No color-word variable names.** All new tokens must be named by function (`--semantic-alert`, `--cat-industrial`), never by literal color (`--blue`, `--yellow`), to prevent the naming/hex mismatch present in earlier drafts of this system.

---

## 7. Reference

This file operationalizes, for code, the identity defined in the Nolli Brand Manual (positioning, voice, photography rules, and the Giambattista Nolli figure-ground concept behind the system). For narrative/strategic rationale behind any token here, consult that document rather than reinterpreting intent from the CSS alone.