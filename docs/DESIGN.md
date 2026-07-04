# Tracr — Design Language

Single source of truth for the visual system. Every token, component, and rule
here overrides the scaffold defaults in `src/app/theme.ts`. Register is
**product** (a tool used mid-round, outdoors, one-handed), not marketing.

Brand: the app is **Tracr** (display name; internal RN project name stays
`GolfTracerAI` — renaming it breaks native project references). Never
"Tracr AI", never "GolfTracer" in user-facing copy.

---

## 1. Brand personality

**"Broadcast booth, not toy." — warm yet sleek.**

- The tracer is the product. Every screen's chrome exists to frame video and
  numbers, never to compete with them. On any screen where the tracer or video
  is visible, the comet is the only hot, saturated element.
- Warm, dark, course-green field — dusk fairway under warm stadium light.
  Neutrals are warm (cream-tinted glass over olive-black), the accent is a
  lively warm course green, and the only *hot* color in the app is the
  tracer's ember gradient.
- Chrome is **glass**: surfaces are translucent warm-white layers that
  composite over whatever sits beneath them (background, stage, video), with
  hairline borders and a brighter top-edge highlight. Text is glassy too —
  translucent warm cream, never opaque pure white.
- Confident, plain copy. "Swing saved." not "Swing saved!" No "elevate",
  "seamless", "unleash". Labels say what the button does: "Track this swing",
  "Estimate distance", "Recalibrate".
- Numbers behave like broadcast graphics: tabular, unit-demoted, animated once
  (a count-up on reveal), then still. Uncertain values wear a "~" — never fake
  precision.
- Reliability is a design feature: every failure state has a specific
  explanation and a next step ("Couldn't track that shot. Mark the ball to
  help." — never "Oops, something went wrong").

### 1.1 The mark

The logomark (master: `docs/brand/logomark-master.png`) is a ball-flight
tracer arc — **the logomark IS the tracer**, not a separate brand element:
a white-hot ball at the head of an ember trail curving back to the impact
bulb. Its gradient is the §2 ember palette verbatim: white-gold head
`#FFE9C4` → amber `#FF9E2C` → ember tail `#FF4D00` over the
`rgba(255,122,26,0.35)` glow (master sampled at `#FEF08A → #FEC339 →
#FE7402`, same family — the tokens are the canonical values). One artwork,
two renderers: marketing uses the master asset; in-app surfaces draw the
`TracerMark` kit component from the tracer tokens so the mark can never
drift from the product.

**The loader is the mark in motion.** Every loading moment (app launch,
shot analysis — never a generic spinner, §8) renders `TracerLoader`: a ball
is hit and flies out along the arc drawing the ember gradient head-first,
then the whole trail fades away and loops — watching shot after shot. Same
tokens, same geometry (`tracerArc.ts`) as the static mark, so it is
literally the logo drawing itself. Ball position and mark opacity animate
on the native driver (no per-frame JS); reduce-motion shows the static
mark. The loader obeys the same staging and ember-quota rules below.

Rules:
- **Staging.** In-product the mark sits on `colors.stage` or
  `colors.background` — never pure `#000` (§8). The master's black canvas
  is for marketing/app-icon export only; even the app icon re-stages onto
  `colors.stage` (#0A0E07) so icon and product share a field.
- **Ember quota.** The mark counts as the screen's ember element (§2:
  ember is video-stage-only, one hot element per screen). It may appear on
  screens with no live tracer — Welcome/SignIn, the app icon, at most an
  empty state — and never as repeated chrome ornament, never beside a
  playing tracer.
- **Never recolored.** Course green is the UI's voice; ember is the shot's.
  The mark is never rendered in `primary`/`accent`, and chrome never
  borrows the ember gradient (§8 unchanged). Monochrome-only contexts use
  `colors.text` warm cream.
- Clearspace ≥ 0.5× mark height on all sides; minimum rendered size 24pt.

---

## 2. Color tokens

Warm course green + warm cream glass. No cool grays anywhere. The tracer
ember palette is the only *hot* color and appears **only** on/around video
stages.

### Base tiers (opaque — everything else composites over these)

| Token | Hex | Use |
|---|---|---|
| `colors.stage` | `#0A0E07` | Video/tracer/pose stages, segmented-control tracks, inputs. Darkest tier — makes the tracer pop. |
| `colors.background` | `#11180E` | Screen background (tier 0). Warm olive-black. |

### Glass surfaces (translucent warm-white — elevation by opacity step)

| Token | Value | Use |
|---|---|---|
| `colors.surface` | `rgba(255,251,235,0.055)` | Cards, list rows (tier 1). |
| `colors.surfaceRaised` | `rgba(255,251,235,0.09)` | Selected rows, segmented thumb, secondary buttons (tier 2). |
| `colors.overlay` | `rgba(255,251,235,0.13)` | Chips/badges floating over video, tooltips (tier 3). |
| `colors.glassHighlight` | `rgba(255,253,245,0.10)` | Top-edge hairline highlight on glass cards — the "catchlight". |

Glass composites: the same card reads darker over the stage than over the
background. That is intended — chrome belongs to what it floats on. One
glass level per element; a chip inside a card is fine, a card inside a card
is not (§4 still holds).

### Text (glassy cream — never opaque white, never pure `#FFFFFF`)

| Token | Value | Notes |
|---|---|---|
| `colors.text` | `rgba(255,251,242,0.96)` | Primary copy — warm cream glass. |
| `colors.textMuted` | `rgba(255,247,235,0.66)` | ≥4.5:1 on every tier incl. `overlay`-over-stage. |
| `colors.textDisabled` | `rgba(255,247,235,0.38)` | Disabled labels only, never body copy. |
| `colors.textOnAccent` | `#0A1607` | Label color on `primary` fills. |

Hero numerals (`display` role only) carry a soft warm sheen:
`textShadowColor rgba(255,236,200,0.28)`, radius 12, offset (0,0). No other
text gets a shadow; no gradient text in-app.

### Accent & semantic (warm family)

| Token | Hex | Use |
|---|---|---|
| `colors.primary` | `#5BCE62` | THE UI accent — lively warm course green. Primary CTA fill, active step, selected state. Exactly one per screen. |
| `colors.primaryPressed` | `#4AB851` | Pressed fill. |
| `colors.accent` | `#A9E8A2` | Tinted accent for selected text/icons/links on dark glass (nav theme primary). |
| `colors.success` | `#5BCE62` | Alias of primary — green means good, deliberately unified. |
| `colors.warning` | `#E6AE4A` | Low-confidence, fallback-method warnings. Warm amber; never competes with tracer ember. |
| `colors.danger` | `#E5544B` | Destructive/error only. Warm red. |
| `colors.dangerPressed` | `#C93A3F` | Pressed fill for danger buttons. |

Derived tints (selected chips, done-step rings, trim regions) use
`alpha(token, a)` from `theme.ts` — never a hand-written `rgba()` of a token
color, so a palette change propagates everywhere.

### Borders (hairlines, warm alpha-white so they sit on any tier)

| Token | Value |
|---|---|
| `colors.borderSubtle` | `rgba(255,248,235,0.10)` — card outlines, dividers |
| `colors.border` | `rgba(255,248,235,0.14)` — inputs, segmented track edge |
| `colors.borderStrong` | `rgba(255,248,235,0.22)` — focus/selected outline base |

1px hairlines only. Never a colored 2–4px border, never a left/right stripe.
Glass cards may brighten only their **top** edge with `glassHighlight`.

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

**Radius rule (Shape Consistency Lock)** — `radii = { sm:8, md:14, lg:20, xl:24, pill:999 }`:

| Shape | Radius |
|---|---|
| Inputs, segmented control track/thumb | `sm` (8) |
| Cards, stages, skeletons | `md` (14) |
| Video stage / large media frames | `lg` (20) |
| Hero selection tiles (sport picker) | `xl` (24) |
| Buttons, chips, badges, progress bars | `pill` |

Minimum touch target 44×44pt (record control 72pt).

**Progressive disclosure (screen density lock).** No screen shows more than:
one hero element, one primary CTA, and ~3 glanceable sections. Everything
else lives one tap away behind a section row (title + one-line summary +
chevron) or an expandable card. Detail tables (fit diagnostics, full flight
numbers, session lists) NEVER render open by default. When a screen
accumulates a 4th section, the weakest section becomes a drill-in.

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
- **Press pop (Framer-grade, the sanctioned exception):** discrete CTAs
  (`Button`) and hero selection tiles (`SportTile`) press with a two-beat
  asymmetric interaction — press-in: `Animated.timing` scale → **0.97**
  (tiles: 0.98 — big surfaces read absolute pixel travel) over **90ms**,
  `Easing.out(Easing.quad)`, never a spring on the way down; release:
  `Animated.spring` to 1 with `{ stiffness: 400, damping: 22, mass: 1 }` —
  exactly one ~0.3% overshoot, settled ≈350ms. Damping ratio stays in
  0.55–0.8: one visible overshoot is premium, two oscillations is toy.
  Selection commits may pop via velocity injection
  (`{ toValue: 1, velocity: 1.5, stiffness: 350, damping: 20 }`).
  Reduce-motion: instant color swap only.
- **Primary CTA glow:** the filled primary button carries a brand glow
  (`shadowColor: primary, shadowOpacity 0.35, shadowRadius 16, offset y 6`;
  Android `elevation 8`). Pressed = flatten: glow collapses and the fill
  darkens one step. Glass buttons press by *lightening* one glass tier —
  never opacity-dimming.
- No bounce/overshoot on anything touched repeatedly or continuously
  (record control, nav, segments, scrubber, steppers). Scrubber = zero lag, 1:1.
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
- [ ] No gradient text (the `display` sheen shadow is the only text effect).
- [ ] Glass is the surface language, not decoration: no glass-on-glass stacks
      (card-in-card), no full-bleed frosted panels over legible content, and
      the only brightened edge on a glass card is the top `glassHighlight`.
- [ ] No identical stat-card grids or repeated "giant number + tiny label" hero-metric template — vary tile size by importance.
- [ ] No uppercase-tracked eyebrow above every section; ≤1 `overline` per screen.
- [ ] No numbered 01/02/03 markers unless content is a literal ordered flow.
- [ ] No pure `#000` or pure `#FFF`; opaque tiers stay warm olive-green,
      glass fills and text stay translucent warm cream.
- [ ] Max one saturated accent per screen (+ tracer ember on video stages only).
- [ ] Status floating over a video stage rides IN the stage as a glass chip
      (tier-3 `overlay` fill), broadcast-style — not as a row below it.
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

---

## 10. Onboarding — first launch only

Flow (each step is its own screen; back always works; progress dots at top):

1. **Welcome** — Tracr wordmark, one line of value ("Trace every shot."),
   single CTA "Get started". No carousel, no marketing slides.
2. **Sign in** — Sign in with Apple (the only account CTA, per Apple HIG
   button style, rendered on our glass) + a quieter "Continue as guest"
   ghost action. Never block on account: guest is a full profile.
3. **Sports** — "What do you play?" Large glass selection tiles
   (`SportTile`), one per catalog entry, **max 4 visible per viewport**,
   vertical scroll for more. Tile = radii.xl rounded rect, ~104pt tall,
   glossy glass (surface fill, top catchlight, soft inner sheen), custom
   Skia brand icon left, name + tagline, selected state = primary hairline
   ring + alpha(primary, .16) wash + check. Press = the sanctioned pop.
   Unavailable sports render dimmed with a "Coming soon" badge and stay
   unselectable. Multi-select; at least one required to continue.
4. **Preferences** — units (yards/meters segmented), handedness, analytics
   opt-in. Three rows max; everything editable later.
5. **Permissions** — camera + photo library, asked HERE with a one-line
   why-line each ("Tracr records your swing to trace the ball"), one at a
   time, primed by our screen BEFORE the OS dialog. Denying anything still
   completes onboarding — affected features re-prompt contextually.

Completing onboarding writes `profileStore.completeOnboarding()`; the app
never shows the flow again (sign-out re-arms it).

## 11. Home — hub architecture (18Birdies/SwingVision register)

Home is a hub, not a dashboard: quick actions first, everything else is a
drill-in. Order: greeting header (first name if known) → **Record** (the
one primary CTA) + Upload secondary → "Your sports" shortcut row (chosen
sports only, small glass tiles routing straight into each flow) →
**Recent session** (single latest-shot glass card with 2 stats, tap →
Sessions) → nothing else. Pipeline detail, full history, settings: all
behind taps (Sessions screen, Settings sheet). Density lock (§4) applies.

## 12. Per-sport stat canon (research-verified)

Each sport speaks its own statistical language — units, precision, and the
stat set are fitted per sport and never copy-pasted across sports. All
numbers below were deep-researched against launch-monitor/broadcast
conventions and adversarially fact-checked before shipping.

### Golf (TrackMan / Toptracer consumer convention)

| Stat | Unit | Precision |
|---|---|---|
| Carry / Total | yd | whole |
| Apex | ft | whole |
| Ball speed | mph | whole |
| Launch angle | deg | 0.1 |
| Spin | rpm | whole |
| Flight time | s | 0.1 |

Club priors in `clubPriors.ts` model a MID-TEENS-HANDICAP male amateur
(TrackMan Combine "Average Golfer, 14.5"), not a Tour player — see the
table's source comments. Deltas compare only to the user's own history.

### Soccer (FIFA / sports-science convention)

| Stat | Unit | Precision |
|---|---|---|
| Peak shot speed | km/h (canon everywhere: display, history, compare) | whole, wears "~" (monocular estimate) |
| Distance to goal at contact | m | whole, wears "~" |
| Goal-mouth crossing position | m from left post / height | 0.1 (≈10 cm honest bound) |
| Verdict | Goal / No goal | sentence case, no exclamation |

Typical adult-amateur shots run ~80–97 km/h, elite open play ~100–115 km/h
— quality gates and copy stay inside plausible reality.

### Coming-soon taglines (verified measurable from phone video)

- Tennis: "Serve speed and placement" (SwingVision precedent; club serves
  ~90–110 mph, ATP first serves ~115–120 mph avg).
- Baseball: "Exit velocity and launch" (Blast Vision / SmartPitch
  precedent; HS ~70s–80s mph EV, MLB avg ~88–89 mph, sweet-spot LA 8–32°).

## 13. Speed is a feature — the 1–3 s analysis budget

Nobody waits on a spinner while we admire our own pipeline.

- **Hard target: tracking completes in ≤3000 ms wall-clock** on a mid
  device; aim 1–1.5 s. `runTracking` accepts `timeBudgetMs` (default 3000)
  and *adapts to stay inside it*: drops analysis width a notch, strides
  frames when behind, stops consuming frames once the track has clearly
  landed, and bounds the offline rescue pass to the remaining budget. A
  degraded-but-honest result inside budget beats a perfect one outside it —
  quality grading already tells the user the truth.
- Progress UI is staged and truthful (never a generic spinner); if analysis
  somehow exceeds budget the caption says what it's still doing.
- The reveal IS the reward: navigate to the tracer the moment tracking
  resolves; never hold the user on a done progress bar.
