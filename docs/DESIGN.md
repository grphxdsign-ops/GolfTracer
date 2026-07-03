# GolfTracer AI — Design Language

Single source of truth for the visual overhaul. Every token, component, and rule
here overrides the scaffold defaults in `src/app/theme.ts`. Register is
**product** (a tool used mid-round, outdoors, one-handed), not marketing.

---

## 1. Brand personality

**"Broadcast booth, not toy."**

- The tracer is the product. Every screen's chrome exists to frame video and
  numbers, never to compete with them. On any screen where the tracer or video
  is visible, the comet is the only hot, saturated element.
- Calm, dark, green-tinted field — like a course at dusk under stadium light.
  One green hue family carries every neutral. The single warm color in the
  entire app is the tracer's ember gradient.
- Confident, plain copy. "Swing saved." not "Swing saved!" No "elevate",
  "seamless", "unleash". Labels say what the button does: "Track this swing",
  "Estimate distance", "Recalibrate".
- Numbers behave like broadcast graphics: tabular, unit-demoted, animated once
  (a count-up on reveal), then still. Uncertain values wear a "~" — never fake
  precision.
- Reliability is a design feature: every failure state has a specific
  explanation and a next step ("Couldn't track that shot. Mark the ball to
  help." — never "Oops, something went wrong").

---

## 2. Color tokens

One hue family (green, ~H150). No warm/cool gray mixing. The tracer ember
palette is the only warm color and appears **only** on/around video stages.

### Surfaces (elevation by lightness step, not shadow)

| Token | Hex | Use |
|---|---|---|
| `colors.stage` | `#060F0A` | Video/tracer/pose stages, segmented-control tracks. Darkest tier — makes the tracer pop. Replaces hardcoded `#08130C`. |
| `colors.background` | `#0B1F14` | Screen background (tier 0). |
| `colors.surface` | `#122B1B` | Cards, list rows (tier 1). |
| `colors.surfaceRaised` | `#1A3823` | Selected rows, segmented thumb, bottom sheets (tier 2). |
| `colors.overlay` | `#234630` | Tooltips, popovers, chrome floating over video (tier 3). |

### Text

| Token | Hex | Notes |
|---|---|---|
| `colors.text` | `#F2F7F3` | Off-white, green-tinted. Never pure `#FFFFFF` on these surfaces. |
| `colors.textMuted` | `#A9C4B1` | ≥4.5:1 on every surface tier incl. `overlay` (5.6:1). |
| `colors.textDisabled` | `#5E7767` | Disabled labels only, never body copy. |
| `colors.textOnAccent` | `#07130C` | Label color on `primary` fills. 9.5:1. |

### Accent & semantic

| Token | Hex | Use |
|---|---|---|
| `colors.primary` | `#4AC97E` | THE UI accent. Primary CTA fill, active step, focus ring, selected state. Exactly one per screen. |
| `colors.primaryPressed` | `#3BAF6A` | Pressed fill. |
| `colors.accent` | `#8FE3A8` | Tinted accent for selected text/icons/links on dark surfaces (nav theme primary). |
| `colors.success` | `#4AC97E` | Alias of primary — green means good, deliberately unified. |
| `colors.warning` | `#E0A83E` | Low-confidence, fallback-method warnings. Muted amber; never competes with tracer ember. |
| `colors.danger` | `#E5484D` | Destructive/error only. |

### Borders (hairlines, alpha-white so they sit on any tier)

| Token | Value |
|---|---|
| `colors.borderSubtle` | `rgba(255,255,255,0.08)` — card outlines, dividers |
| `colors.border` | `rgba(255,255,255,0.12)` — inputs, segmented track edge |
| `colors.borderStrong` | `rgba(255,255,255,0.18)` — focus/selected outline base |

1px hairlines only. Never a colored 2–4px border, never a left/right stripe.

### Tracer ember (video-stage only — never in chrome)

| Token | Value |
|---|---|
| `tracer.head` | `#FFE9C4` (white-hot) |
| `tracer.mid` | `#FF9E2C` |
| `tracer.tail` | `#FF4D00` |
| `tracer.glow` | `rgba(255,122,26,0.35)` |

---

## 3. Typography (SF Pro via system font — no custom fonts)

Max 8 roles; each screen uses ≤5. All sizes fixed pt. `fontVariant:
['tabular-nums']` is **mandatory** on every number that updates or aligns
(yardage, speed, counters, timestamps, angle tables).

| Role (`typography.*`) | Size/Line | Weight | letterSpacing | Color |
|---|---|---|---|---|
| `display` | 48/50 | 600 | −1.2 | text — hero stat only, tabular |
| `title` | 28/34 | 700 | −0.56 | text — one per screen (ScreenHeader) |
| `heading` | 20/26 | 600 | −0.3 | text — section titles |
| `subtitle` | 17/24 | 600 | −0.2 | text — card titles |
| `body` | 15/22 | 400 | 0 | text (muted variant: textMuted) |
| `label` | 13/18 | 500 | 0 | textMuted — inputs, chips, tabs |
| `caption` | 12/16 | 500 | 0 | textMuted — metadata, units |
| `overline` | 11/14 | 600 | +0.66, uppercase | textMuted — at most ONE per screen, only if load-bearing |

Rules: sentence case everywhere. Never weight 700 above 40pt (bloats) or below
Regular 400 under 20pt. Units render in `caption`, Regular, muted, beside the
numeral — never baked into the same styled run.

---

## 4. Spacing, radii, hit targets

Base unit 4. `spacing = { xs:4, sm:8, md:16, lg:24, xl:32, xxl:48, xxxl:64 }`.

- Related items (label→value, icon→text): `xs`/`sm`.
- Card→card, group→group: `md`/`lg`. Section→section: `xl`/`xxl`.
- Screen padding: `md` horizontal; bottom CTAs get safe-area inset + `md`.
- No nested cards. One container level per element.

**Radius rule (Shape Consistency Lock)** — `radii = { sm:8, md:14, lg:20, pill:999 }`:

| Shape | Radius |
|---|---|
| Inputs, segmented control track/thumb | `sm` (8) |
| Cards, stages, skeletons | `md` (14) |
| Video stage / large media frames | `lg` (20) |
| Buttons, chips, badges, progress bars | `pill` |

Minimum touch target 44×44pt (record control 72pt).

---

## 5. Motion (`motion` tokens; RN `Animated`, `useNativeDriver: true`)

Motion conveys state. One cinematic moment exists: the tracer reveal.
Everything else is ≤250ms and out of the way.

| Token | Value | Use |
|---|---|---|
| `motion.duration.press` | 100 | Button press scale in/out |
| `motion.duration.fast` | 150 | Segmented thumb slide, selection swaps |
| `motion.duration.base` | 200 | Row/element entrance (opacity + translateY 8→0), crossfades |
| `motion.duration.gentle` | 250 | Sheet/expandable open (exit ≈ 0.75×) |
| `motion.duration.countUp` | 700 | Hero stat count-up (once, on reveal) |
| `motion.duration.reveal` | 700 | Tracer draw-on baseline; clamp 600–900, timestamp-anchored |

| Token | Value |
|---|---|
| `motion.easing.enter` | `Easing.bezier(0.16, 1, 0.3, 1)` |
| `motion.easing.exit` | `Easing.in(Easing.cubic)` (at ~75% of enter duration) |
| `motion.easing.standard` | `Easing.out(Easing.cubic)` |

Rules:
- Animate `transform`/`opacity` only, native driver. Never width/height/top/left.
- Press feedback: scale → 0.97 + fill darken. No bounce/overshoot on anything
  touched repeatedly (record, nav, segments, scrubber). Scrubber = zero lag, 1:1.
- Stagger only for a genuine list-arrival moment: ≤5 items × 60ms, total <400ms.
- No looping pulses on static elements. Recording state = color swap, not pulse.
- Every custom animation checks `AccessibilityInfo.isReduceMotionEnabled()`
  (via the shared `useReducedMotion` hook) and degrades to instant/crossfade.

---

## 6. Tracer aesthetic — "broadcast comet"

Rendered in `src/adapters/overlay/TracerOverlay.tsx` (Skia). Layer order,
bottom → top:

1. **Glow**: full revealed path, `strokeWidth = style.glowWidth * 1.6` (skip if
   `glowWidth === 0`), color `style.glowColor`, round cap/join, `BlurMask`
   blur 6 style "normal".
2. **Core comet stroke**: full revealed path, `strokeWidth = style.strokeWidth`,
   painted with a Skia `LinearGradient` from first revealed point (tail) to
   head point: colors `[tailColor, midColor, headColor]`, positions
   `[0, 0.55, 1]`. Tints derived from `style.color` by a pure helper in the
   same file (head = mix 65% toward `#FFFFFF`, mid = `style.color`, tail =
   `style.color` at 55% alpha) so the five user presets all work; the Orange
   preset lands on the ember palette in §2.
3. **Hot head segment**: last `min(6, k)` points restroked at
   `strokeWidth * 1.4`, headColor — the comet's bright leading edge (taper
   effect without per-vertex width).
4. **Head marker**: Circle at head, `r = max(2.5, strokeWidth * 1.3)`,
   headColor, over a soft under-circle `r × 2.2` at glowColor.
5. **Apex marker** (once reveal passes `apexIndex`): 3px-stroke ring, r 5, at
   `mapped[apexIndex]`, headColor at 90% opacity. No text label on the canvas.
6. **Landing moment** (screen-level, not in overlay): when reveal completes, a
   single expanding ring (scale 0→1, opacity 0.8→0) 500ms at the head position,
   Animated-driven, reduce-motion → skipped.

Reveal stays timestamp-anchored via `revealCount` — never wall-clock frames.
Descent half may read slightly dimmer than ascent via the gradient's tail-alpha;
do not add a separate darkening pass. `overlayMath.ts` is frozen — reuse, never
reimplement letterboxing.

**User presets** (names are pinned by tests — keep exactly): Red, Orange
(default), Yellow, Cyan, White. Each = `{ color, glowColor }`; refreshed values
live beside the theme's `tracer` tokens. Glow presets: Subtle (10), Bold (18),
Off (0).

---

## 7. Component kit inventory (`src/app/components/`)

Owned by the kit implementer. Screens may not modify these; missing pieces get
built screen-local and reported as gaps.

| Component | Purpose |
|---|---|
| `Button` | primary / secondary / ghost / danger variants; pill; Animated press scale; loading + disabled states |
| `Card` | tier-1 surface container, `raised` variant, optional pressable |
| `StatTile` | tabular numeral + demoted unit + label; `hero` / `standard` / `compact` sizes; `approx` tell |
| `ScreenHeader` | in-content title (28/700) + subtitle block |
| `SectionLabel` | 13/600 muted sentence-case section marker |
| `Badge` | pill status tag, tone-tinted (neutral/success/warning/danger/accent) |
| `Chip` | pill stat or selectable chip (label + optional value, selected ring) |
| `SegmentedControl` | sliding-thumb segment row (replaces ad-hoc rows in Import/Calibration) |
| `EmptyState` | title + one-line explanation + single primary action |
| `ProgressSteps` | vertical pipeline steps (done/active/todo nodes + detail text) |
| `ProgressBar` | determinate bar, `accessibilityRole="progressbar"`, scaleX-animated fill |
| `Skeleton` | layout-shaped loading block, gentle opacity loop, reduce-motion aware |
| `useReducedMotion` | shared hook wrapping `AccessibilityInfo.isReduceMotionEnabled` |

Full prop contracts live in the kit implementation spec (workflow doc); this
table is the canonical inventory.

---

## 8. Anti-slop checklist (ban on sight)

- [ ] No side-stripe border accents on cards/rows/alerts.
- [ ] No gradient text; no decorative blur/glass outside genuine video-overlay chrome.
- [ ] No identical stat-card grids or repeated "giant number + tiny label" hero-metric template — vary tile size by importance.
- [ ] No uppercase-tracked eyebrow above every section; ≤1 `overline` per screen.
- [ ] No numbered 01/02/03 markers unless content is a literal ordered flow.
- [ ] No pure `#000` or pure `#FFF`; neutrals stay in the green family.
- [ ] Max one saturated accent per screen (+ tracer ember on video stages only).
- [ ] No generic centered spinners — skeletons/progress matching final layout.
- [ ] No `Alert.alert` as default error surface — inline, specific, blame-free copy with a next step.
- [ ] No modal for simple actions; no bouncing/pulsing/looping decoration.
- [ ] Radius rule (§4) applied by shape class, never per-component whim.
- [ ] Tabular figures on every aligning/updating number.
- [ ] No fake precision — ranges or "~" for estimates; consistent decimals per session.
- [ ] No copy clichés, no exclamation-mark success states.
- [ ] Every interactive element designs default / pressed / disabled / loading — not just default.
- [ ] One primary CTA per screen; secondary actions are ghost/text, never a second filled button.
- [ ] Reduce-motion degrades every custom animation cleanly.
- [ ] Legible outdoors at arm's length: body ≥15pt, muted text ≥4.5:1 on its actual surface.

---

## 9. Screen-level taste test (run before shipping any screen)

1. Squint: one obvious primary action, one hero element.
2. Accent count: exactly one saturated UI color (+ tracer if visible).
3. Radius audit against §4 table.
4. Contrast audit of the mutedest text on every tier it sits on.
5. Tabular-nums check on all numbers.
6. State completeness per interactive element.
7. Motion frequency: high-frequency interactions ≤150ms or nothing.
8. Copy pass read aloud — plain, specific, no clichés.
9. Fake-precision check.
10. Reduced-motion pass.
11. The tracer stays the star: chrome quiet wherever video/tracer is visible.
