# Competitor & Register Research — Sports Tracing/Tracking Apps

Multi-agent research pass (App Store listings, support docs, reviews, press)
across the leading camera-based sports trackers and the premium sports-data
design register. This document records the findings that drive Tracr's
information architecture; docs/DESIGN.md holds the resulting rules.

Apps studied: SwingVision, Shot Tracer, Toptracer Range, TrackMan Golf,
Rapsodo MLM, 18Birdies, Golfshot, Arccos Caddie, Garmin Golf, HomeCourt,
Veo, Trace, Blast Vision, OnForm, Whoop, Strava, Oura, Nike Run Club.

---

## 1. What every leading app agrees on

### Persistent bottom-tab navigation, capture emphasized
Every camera/capture app in the set runs a bottom tab bar, most with the
capture action visually emphasized or centered:

- Strava: Home · Maps · **Record (center)** · Groups · You
- Arccos: Player · Clubs · Courses · Activity · **Start Round**
- Nike Run Club: Home · Plans · **Run** · Club · Activity
- SwingVision: dedicated, streamlined **Record** tab (v10 redesign:
  "fewer screens and taps")
- HomeCourt: **Record** · Explore · Feed
- Oura (2025 redesign): collapsed 5 tabs → 3 (Today · Vitals · My Health)
  — dashboard and history at different scroll depths, not more tabs.

**Takeaway:** a flat stack with everything pushed from one hub (Tracr's
current shape) exists nowhere in the leading set. 3–5 tabs with a
center-raised Record action is the market's settled answer.

### A stats hub separate from the session library
Arccos (Player vs Activity), Strava (You vs feed), Whoop (Trends vs
Overview), TrackMan (Map My Bag vs per-session views): aggregates/trends
live on their own surface, structurally separate from the per-session
list, so one bad session never visually distorts the long-run read.

### Honest small-sample handling is a premium tell
- Whoop shows a behavior "Impact" only after ≥5 occurrences (with ≥5
  counterexamples) in 90 days.
- 18Birdies' handicap scales best-N-of-recent with sample size (best 1 of
  ≤5 rounds → best 8 of 20+).
- Garmin smooths Strokes Gained over an explicitly labeled rolling
  10-round window.
- 18Birdies "True Distance" per club = last 10 tracked shots, trimmed of
  the 2 longest/shortest.

**Takeaway:** aggregates carry explicit windows ("last 20 shots"), gate
below a minimum count ("still calibrating"), and use trimmed/rolling
means. Matches Tracr's existing MIN_SHOTS_FOR_DELTA / no-fake-precision
rules — extend them to every Insights number.

### Dashboards: few elements, tiles as doorways
Whoop's Overview tiles are "a doorway, not a destination"; Oura's Today
promotes ONE daily insight above three scores; dashboard research caps
visible elements near five. Full charts live on detail screens, never
inline on the dashboard.

### Numbers never stand alone
- Sparkline + delta arrow beside every KPI (cross-app dashboard toolkit).
- Baseline-relative framing: Oura reads metrics against *your* rolling
  baseline; Arccos benchmarks against a self-selected target.
- Spatial outcome beats scalar: TrackMan/Arccos/Rapsodo dispersion
  "jellybeans", Blast Vision spray charts, HomeCourt shot charts.
- PBs attach to the record-setting activity itself (Strava trophies).

### Units & precision (golf consumer canon)
Whole yards, whole percentages, mph, rpm — no consumer-facing app in the
set shows sub-yard/decimal precision. (Tracr's §12 stat canon already
matches; keep it that way on Insights.)

---

## 2. Competitor-specific lessons

### Shot Tracer (closest direct competitor) — what loses ratings
The dominant App Store complaints are UX, not tracking quality:
1. **No visible "start here" / edit entry point** — editing hides behind
   an unexplained gear icon; the #1 repeated complaint.
2. Manual tracing is fiddly instead of "tap strike, tap end, pick curve";
   rival Ace Trace is praised for one-minute usability.
3. Crashes that lose 5–10 minutes of manual adjustment work.
4. Auto-trace overpromises ("accurate ~10% of the time" per reviews) —
   the gap between promise and delivery reads as broken.

**Takeaways for Tracr:** the primary action must be unmissable from
anywhere (center Record tab); manual fallbacks framed as "mark the ball"
guidance, not error states (already our pattern); never lose user work;
under-promise on automation and grade honestly (already our pattern).

### Toptracer Range — the missing-replay complaint
Its rich live trace is *gone* when reviewing sessions later in the app —
only numbers remain; users notice and complain. **Takeaway:** persist a
redrawable trace with every shot record so history stays visual. The
tracer is the product; history without the tracer is a spreadsheet.

### TrackMan — session review done right
Three named views: Club View (per-club key data), "Jellybean" View
(per-club color-coded dispersion ellipses, tap to isolate), Overhead &
Trajectory. Per-club drill-in → individual shot rows. **Takeaway:** our
Insights per-club rows + carry dot-strips are the honest subset of this
given monocular data (no lateral dispersion → 1D carry strips, never a
faked 2D ellipse).

### HomeCourt (Apple Design Award) — capture-loop feel
Live dual-channel feedback (overlay + audio callouts + haptics), AR
calibration preview before capture, post-session shot chart + streaks,
per-shot scrubbable video. **Takeaway:** pre-capture framing guidance and
instant, in-rhythm results are worth more than any dashboard; keep the
1–3 s analysis budget sacred.

### Arccos — insights that read as coaching
"Top 3 Insights" per round tied to causal strokes-gained data reads
premium; badge/streak gamification (18Birdies) splits sentiment.
**Takeaway:** one computed, data-grounded callout ("7-iron carry up 4 yd
over your last 10") beats badges. No streaks, no coins.

### SwingVision — the closest register match
Center-emphasized Record tab (their 2026 redesign doubled down on it);
"Me" tab holds the session library; dark theme praised for letting
colorful data pop; reviewers praise contextual once-per-screen
micro-tutorials over onboarding blasts. Their strongest interaction:
**stat → sub-stat → video evidence in one chain** (tap a pie wedge →
spin breakdown → auto-built filtered highlight reel). Complaints center
on reliability and hard-to-find correction controls — polish loses to
findability. **Takeaways:** tappable stats should lead somewhere
concrete (Insights club row → that club's shots); keep correction
affordances obvious.

---

## 3. Decisions for Tracr (implemented from this research)

1. **Bottom tab bar (glass), 4 tabs + raised center Record:**
   Home · Sessions · ⬤ Record · Insights · Profile. Capture flows push
   full-screen over the tabs (correct for camera work; the "disappearing
   bar" complaint in Strava applies to browsing contexts, not capture).
2. **Insights tab** (new): sport switcher when >1 sport has data; ONE
   promoted insight card; headline aggregate with sparkline + delta vs
   the user's own baseline; per-club bag breakdown (labeled rolling
   window, trimmed mean, count, 1D carry dot-strip, PB tick); soccer:
   speed trend + on-target rate. Every number gated by MIN_SHOTS_FOR_DELTA
   with a "still calibrating" state below threshold.
3. **Profile tab** (new): account, preferences (units/handedness/
   analytics — finally editable post-onboarding, as onboarding copy
   already promises), your sports, data controls (clear history), sign
   out.
4. **Sessions upgrade:** per-sport filter chips; tappable rows opening a
   ShotDetail screen; PB chips attached to record-setting shots; mini
   trace glyph per row (monochrome cream), full ember trace redraw on
   ShotDetail — fixing the Toptracer complaint inside our ember-quota
   rules (§1.1: list glyphs are monochrome; only the detail hero wears
   ember).
5. **Home rebalance:** greeting → ONE promoted insight or recent-session
   hero → sports shortcuts → tools row; pipeline card only mid-session.
   Record's permanent affordance is the center tab, so Home's hero slot
   goes to the user's story (Oura "one big thing"), with a Record hero
   only in the no-history empty state.
6. **Trace persistence:** ShotRecord gains normalized, downsampled
   `tracePoints` so every future shot's tracer is redrawable in history.
