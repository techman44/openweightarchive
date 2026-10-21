# OpenWeightArchive · Design specification

Phase 1 / 21 October 2026. The implemented reference is `src/styles/global.css`.

## Purpose and editorial voice

A public record of open-weight models, their benchmark results, and carefully sourced AI reporting. Owner: Dean, a self-hosting systems engineer in Sydney. The visual language is an archive reading room: quiet, legible, spacious and precise. Records take precedence over decoration. A reader should be able to distinguish a measurement, a claim, an estimate and an unavailable value without relying on colour.

Use concrete nouns, dates, units and sources. State what is known and what remains uncertain. Avoid promotional slogans, superlatives, emoji, decorative badges, rankings across incompatible tasks, and fabricated news. Editorial articles will carry source links and dated corrections. Current articles explain the archive's methods; all model and benchmark fixtures are explicitly fictional.

## Colour tokens

Dark is the default and only Phase 1 theme. No gradients, textures or colour-dependent meaning.

| CSS token | Hex | Role |
| --- | --- | --- |
| `--color-bg` | `#111513` | Reading surface and sticky body cells; charcoal with a slight green cast |
| `--color-surface` | `#191e1b` | Table headers, notices and restrained hover backgrounds |
| `--color-raised` | `#222923` | Hovered controls |
| `--color-text` | `#e9e4d8` | Warm paper; primary text |
| `--color-muted` | `#a5ada5` | Secondary text, captions and metadata |
| `--color-accent` | `#ceb58b` | Brass; links, section labels, measured numbers |
| `--color-line` | `#38413a` | Nonessential dividers and table rules |
| `--color-control` | `#748075` | Visible input and button boundaries |
| `--color-focus` | `#edcb8f` | Two-pixel keyboard outline, four-pixel offset |
| `--color-danger` | `#eeaaa0` | Validation text and error outlines, always with words |

Text combinations must meet WCAG AA (4.5:1 for normal text; 3:1 for large text). Control boundaries and focus indicators must meet 3:1 against adjacent surfaces. Subtle structural rules are not used as the sole indicator of a control. Selection inverts brass and charcoal. Forced-colour mode preserves native controls and explicit notice borders.

## Typography

Use system fonts, with no font service or remote requests. Display: Iowan Old Style → Palatino Linotype → Book Antiqua → Palatino → Georgia → serif. Body: system UI / Segoe UI / sans-serif. Data: SFMono-Regular → Consolas → Liberation Mono → monospace. Body is 400 weight; section labels and row identifiers may use 500–600. Do not simulate bold display type.

| Token | Size | Intended use |
| --- | --- | --- |
| `--text-xs` | 12px / .75rem | Captions, metadata, numeric cells |
| `--text-sm` | 14px / .875rem | Tables, navigation, field labels, help |
| `--text-base` | 16px / 1rem | Body |
| `--text-lg` | 18px / 1.125rem | Introductions and article text |
| `--text-xl` | 24px / 1.5rem | Card headings and form legends |
| `--text-2xl` | 32px / 2rem | Section headings |
| `--text-3xl` | 36–56px / clamp(2.25rem, 5vw, 3.5rem) | Page titles |
| `--text-4xl` | 44–84px / clamp(2.75rem, 6vw, 5.25rem) | Home display heading |

Body line-height is 1.65; headings 1.15, article-card headings 1.3. Heading tracking ranges from −.025em to −.035em. Small uppercase section labels use .16em tracking. Keep prose at 58–70 characters per line and articles in a 760px reading column. Use balanced headings. Numeric columns are right-aligned with tabular, lining numerals; display raw scores to three decimals, preserve full values for sorting, and name units in headers.

## Spacing and layout

Four-pixel base grid: `--space-1` 4px, `2` 8px, `3` 12px, `4` 16px, `6` 24px, `8` 32px, `12` 48px, `16` 64px, `24` 96px. Use 24px between related fields, 48–64px between sections and 96px at the home introduction on wide screens. One-pixel rules; two-pixel corner radius for controls. No floating cards or deep shadows.

The shell is at most 1320px including gutters of `clamp(20px, 4vw, 64px)`. Desktop home: expansive introduction and a 280px accession summary. Journal previews: three equal columns with fine separators. Submission: two-thirds form, one-third explanation. At 760px and below, main content, forms, facts and article previews become a single column; navigation wraps without a hamburger or hidden links. The accession summary lists its counts in three consecutive rows.

Tables retain their semantic rows on narrow screens, scroll within their own focusable region and keep the first column sticky with an opaque background. The document itself must not overflow horizontally. Do not turn records into unlabeled stacked values. Check at 375px, 760px and desktop widths, and at 200% zoom.

## Component inventory

| Component | Structure, behaviour and states |
| --- | --- |
| Site layout | Skip-link, linked typographic wordmark, named navigation, one `main`, footer. Active navigation has an underline and `aria-current`. |
| Page introduction | Section label, one h1, explanatory lead. Optional back link. |
| Accession summary | Definition list with counts explicitly labelled as samples. No fabricated “verified” count. |
| Provenance notice | Brass rule, plain-language scope; fixture / estimate / intake-unavailable states. |
| Register | Real table, caption, column and row headers; links to model records; per-task scores, sample counts, exact config, hardware, date and evidence state. |
| Register controls | Progressive search and suite filter; count announcement; header buttons with ascending/descending indicators and `aria-sort`. Hidden if JavaScript is absent. Missing scores always sort last. Empty-state text retains the filters. |
| Run disclosure | Native `details` / `summary`; arm, thinking setting, max tokens, temperature, hardware and exact UTC timestamp remain inspectable. |
| Model facts | Definition list for parameters, context, license and run count. |
| VRAM matrix | Table with quantization, weight size, VRAM at 4k and 16k, and estimate/measurement basis. Explicit GiB and assumptions. |
| Journal preview | Category, linked serif heading, description, machine-readable publication date. |
| Article | Narrow reading column, author and date, semantic Markdown, source links where applicable. |
| Submission form | Labelled inputs, endpoint guidance, requested attestation tier, ct-bench JSON, explicit consent. Disabled submit until enhancement loads; busy, validation-error, saved-receipt and unavailable states. Preserve entries after a failed save. |
| Intake status | `server:defer` island; evaluates runtime configuration without exposing secrets. Static fallback remains useful if loading fails. |
| Admin stub | Basic-auth protected queue, readable raw records, review form, typed draft form and saved drafts. No verify or publish action. |
| Error / empty state | Honest explanation and a useful next action. Never replace a failed store read with a false zero count. |

## Accessibility and interaction

Semantic landmarks, logical heading levels, a first-focus skip-link, visible focus on every control, explicit field labels, named scroll regions and descriptive links are required. Default controls meet a 44px target; compact table sorting buttons have a 32px target with surrounding cell spacing. Status updates use polite live regions; form results receive focus after completion. Error messages identify fields and do not rely on red alone.

All data and articles are server-rendered or prerendered HTML. Search and sorting progressively enhance the existing table. With scripting disabled the complete register remains readable; submission/admin forms explain the JSON API alternative. No essential information is hover-only. No animation is required; reduced-motion preferences remain respected. Test native disclosure controls, Tab/Shift+Tab, Enter/Space activation, mobile scrolling and screen-reader table navigation.

## Logo and banner art direction — written specification only

The eventual mark is an ink-line archive vault: a shallow architectural arch enclosing a vault door, with three small horizontal catalogue drawers suggested inside. Draw with consistent fine strokes and slight optical correction, as if engraved for a library accession stamp. Avoid padlock/security-product symbolism, robots, circuit brains and three-dimensional metallic effects. The mark should feel like the entrance to a collection rather than a promise of safety.

Use one colour: warm paper on charcoal, or charcoal on uncoated paper. A small brass accent may appear in a wide banner, never as a gradient. The banner extends the arch into a sparse elevation of archive shelving, leaving at least two-thirds of the composition empty for a heading. No text should be baked into artwork. Preserve clear space equal to the vault's door width and a recognisable silhouette at 24px. Decorative banner artwork should have empty alt text; a linked mark receives the site's accessible name from the surrounding link.

**Do not generate images in Phase 1.** The scaffold uses a plain bordered “OW” typographic stamp and live-text wordmark. The vault motif is specified here for a later commissioned vector treatment; no logo or banner image is included.

## Rendering and content contract

Astro prerenders the register, model cards, benchmarks, journal, articles, submission shell and 404. Its Cloudflare adapter serves the intake-status island, authenticated admin page and JSON POST endpoints on Workers, with D1 persistence and Workers Static Assets. Plain CSS custom properties and small native browser scripts provide all presentation and interaction; no UI framework, Tailwind or component dependency.

Models, benchmarks and posts are validated content collections. The benchmark loader reads the exact ct-bench envelope from `fixtures/`, with provenance and the model reference supplied separately in a manifest. JSON Schemas in `schemas/` are generated from the same definitions. Editorial drafts stay in the private repository until manually reviewed and moved to build-time content. Static public pages never read private submission storage.
