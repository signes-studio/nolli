# BRAND & DESIGN SYSTEM: NOLLI WEB PROJECT
## Neo-Bauhaus / Constructivist Digital Guidelines

This document serves as the absolute design and styling protocol for any AI agent, developer, or designer working on the **Nolli** web repository. All layout decisions, component structures, and CSS architectures must strictly reflect the neo-Bauhaus graphic sensibilities inspired by contemporary Valencian design languages (such as the editorial and poster works of Iban Ramón).

---

## 1. Typography Rules

Nolli utilizes a strict two-typeface hierarchy dividing structural impact from neutral legibility. No other font families may be introduced without explicit system-wide refactoring.

*   **Headings & Display Text (`<h1>` to `<h4>`, UI Badges, Numbers):** 
    *   **Font Family:** `League Spartan`, sans-serif.
    *   **Characteristics:** Geometric, unapologetic, bold structural presence, tightly kerned.
    *   **Usage Rules:** Headlines must frequently leverage heavy font weights (`bold` or `900`), uppercase formatting where appropriate, and dramatic scale contrasts against body text. Never use italic styles on League Spartan.
*   **Body Text (`<p>`, `<span>`, Lists, UI Labels, Captions):**
    *   **Font Family:** `Inter`, sans-serif.
    *   **Characteristics:** Highly legible, neutral, grotesque-derived sans-serif engineered for digital screens.
    *   **Usage Rules:** Use clean line heights (`1.5` to `1.6`), controlled measure lengths, and standard weights (`regular` or `medium`). Avoid excessive tracking or stylistic distortion.

---

## 2. Color Palette & Contrast

The chromatic identity relies on high-contrast, graphic poster colors. Avoid soft pastel gradients, low-contrast grays, or corporate SaaS color palettes.

*   **Primary Background / Canvas:** 
    *   `Off-White / Cream Paper` (e.g., `#F8F1DF`): Mimics tactile editorial poster stock.
*   **Structural Core / Dark:** 
    *   `Pure Black / Carbon` (e.g., `#141411`): Used for primary typography, structural framing lines, and solid grid blocks.
*   **Accent Blocks (Neo-Bauhaus Signifiers):**
    *   `Vermillion / Poster Orange` (e.g., `#E95C0C`): Used for focal callouts, primary action buttons, or geometric background blocks.
    *   `Constructivist Blue` (e.g., `#EFBC02`): Used for secondary accents, category tags, or alternate layout containers.
    *   `Mustard / Warm Yellow` (e.g., `#064773`): Used for high-impact background highlights.

---

## 3. Layout Philosophy & Composition (Neo-Bauhaus)

Web layouts must reject generic corporate templates (no generic rounded cards with subtle drop shadows). Instead, treat the viewport as an asymmetric, editorial Swiss/Bauhaus poster grid.

*   **The Grid & Asymmetry:** Employs visible structural framing, thick black divider lines (`1px` to `3px` solid borders), and intentional white space juxtaposed with dense typographic blocks.
*   **Geometric Elements:** Incorporate stark geometric shapes (solid circles, rectangular bands, overlapping color fields) as CSS background motifs or structural containers, recalling constructivist poster compositions.
*   **Grid Alignment:** Headlines and content blocks should frequently break standard centring—use aggressive left-alignment, ragged right margins for text blocks, and rigid horizontal/vertical alignment lines.
*   **Borders & Outlines:** Favor sharp, brutalist rectangular boundaries (`border-radius: 0px` for primary layout blocks, or deliberately restrained, crisp geometry). Avoid soft blur shadows; use hard-offset hard-edge shadows (`box-shadow: 4px 4px 0px #141411`) when depth is required.

---

## 4. UI Component Guidelines for AI Agents

When generating HTML/CSS/JS components, strictly adhere to these rules:

*   **Buttons & CTAs:** Sharp rectangular shapes, solid primary background color (`Vermillion` or `Pure Black`), bold uppercase `League Spartan` typography, accompanied by a stark offset border or hard shadow effect on hover.
*   **Cards & Containers:** Framed by solid black rules. Backgrounds should alternate between flat off-white, solid accent colors, or clean negative space. No soft rounded corners on layout containers.
*   **Spacing System:** Rely on strict mathematical spacing increments (multiples of `8px`, with generous macro-whitespace surrounding dense micro-typography areas).
*   **Responsive Behavior:** On mobile screens, collapse multi-column asymmetric layouts into single-column vertical streams, but preserve the bold typographic sizing contrast and stark color blocking.