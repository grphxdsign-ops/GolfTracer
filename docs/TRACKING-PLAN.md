# Golf Ball Tracking — Accuracy, Precision & Speed Upgrade Plan

Audience: the engineer (Claude Opus subagents) implementing this. Read this whole
document before writing any code. Every phase names exact files, exact functions,
and exact test files. Do the phases in order — each one is a checkpoint, and later
phases depend on earlier ones being merged and green (`npm run verify`).

Research backing every claim in this document lives in
`/tmp/claude-0/-home-user-GolfTracer/190647bd-b761-5cf6-bc10-f7cf43047d86/scratchpad/tracking-research/`
(six files: `audit_current.md`, `ml_detectors.md`, `classical_cv.md`, `pose_estimation.md`,
`mobile_inference.md`, `temporal_smoothing.md`, `apple_vision_and_capture.md`). If that
scratchpad is gone by the time you read this, treat the citations inline below as the
record — every non-obvious claim has a source named next to it.

## 0. Locked scope — do not relitigate these

These were decided with the product owner before this plan was written. Do not
second-guess them; if a phase seems to need one relaxed, stop and ask instead of
quietly expanding scope.

1. **Golf ball tracking only.** Soccer ball tracking and player pose tracking are
   explicitly out of scope for this plan. (`src/modules/soccer/`, `src/modules/sports/pose/`,
   `src/modules/perfected/skeleton/` are not touched by any phase below.)
2. **iOS only.** Android gets nothing from this plan; do not add Android native code.
3. **Hybrid, not a rip-and-replace.** The existing classical-CV + Kalman + ROI +
   offline-DP-fallback pipeline (`src/modules/tracking/`) stays exactly as it is and
   remains the **automatic fallback**. Every phase below is additive: a new signal
   source is tried first, and if it doesn't clear a quality bar, control falls
   through to the untouched existing pipeline. Never remove or weaken the existing
   fallback path as a side effect of adding something new.
4. **Batch analysis only.** The product records a 2-4s clip, then analyzes it in
   1-3s. Nothing in this plan adds live tracking during recording, and nothing
   should route through `react-native-vision-camera` frame processors — the clip is
   already on disk by the time analysis starts, so there is no 16-33ms live-frame
   budget to respect. Native modules should decode the saved asset directly.

## 1. Executive summary — the architecture this plan builds

Today, `runTracking()` in `src/modules/tracking/tracker/pipeline.ts` does: pull
frames → find impact → run the classical-CV `BallTracker` → optionally run an
offline DP fallback → smooth → build a tracer path. The single biggest gap is that
**there is no ML detector at all** — `TfliteBallDetector` is a permanent stub — and
there is **no sub-pixel refinement** — blob centroids are a binary-mask pixel
average, not intensity-weighted.

This plan adds, in order:

- **Phase 0** — a synthetic accuracy benchmark harness (`ballTrackingGrid.test.ts`),
  because right now there is no pinned number anywhere for ball-tracking pixel
  accuracy (unlike the DTL fit, which has one: `dtlGrid.test.ts`, median 7.5%/p90
  17.9%/83% acceptance). Every later phase reports its effect against this harness.
- **Phase 1** — intensity-weighted sub-pixel centroid refinement of the existing
  classical blob detector. Zero new dependencies, zero architecture change, direct
  fix for a documented gap. Ships value immediately regardless of what happens later.
- **Phase 2** — a native module for manual exposure/shutter control
  (`AVCaptureDevice.setExposureModeCustom`), because motion blur at default
  auto-exposure is the dominant error source at driver speed (a 170mph ball smears
  ~30 ball-diameters at a 1/60s-class shutter; forcing ~1/1000s-1/2000s shrinks that
  to ~1-2 diameters — see `mobile_inference.md` §1, `temporal_smoothing.md` "motion
  blur" section).
- **Phase 3** — the actual "ML detector becomes primary" piece: a native Swift
  module wrapping Apple's built-in **Vision framework** `VNDetectTrajectoriesRequest`,
  tried first on every analysis; if it doesn't clear a quality bar, control falls
  through to the existing classical pipeline untouched.
- **Phase 4** — explicitly **deferred**, not started by this plan: a custom-trained
  Core ML detector (YOLO-nano-class or similar). Section 8 explains why this is
  scoped out for now and what would need to be true before picking it up.

## 2. The big fork, resolved: Vision framework vs. a custom-trained model

The two live options for "the ML detector" were Apple's built-in
`VNDetectTrajectoriesRequest` (free, ships in iOS, zero training data needed, ANE-
accelerated) versus a custom-trained small object detector (YOLO-nano/tiny-class,
or a TrackNet-style multi-frame heatmap model), fine-tuned specifically on golf
balls and deployed via Core ML.

**This plan recommends Vision framework first (Phase 3), with a custom model
explicitly deferred (Phase 4) — not because Vision is clearly more accurate, but
because the custom-model path has a hard prerequisite this plan cannot satisfy on
its own: a labeled golf-ball training dataset and a training/export pipeline.**
That is a real, separate workstream (data collection or licensing, augmentation,
training infra, Core ML conversion, on-device A/B validation) — not something to
hand-wave into "train a model" as one bullet point. Section 8 spells out exactly
what would need to be decided before Phase 4 starts.

Vision framework has a real, evidenced weakness worth naming up front so it isn't
a surprise: **Apple's own documentation says `VNDetectTrajectoriesRequest` requires
a stationary, tripod-mounted camera** — it works via frame differencing, so
handheld motion "introduces noise and motion blur, reducing detection accuracy."
A developer on Apple's own forum reported **zero trajectory observations even with
a stabilized iPad**, and Apple's engineer offered no fix beyond "file feedback"
(`apple_vision_and_capture.md`). Our capture is handheld. This is exactly why Phase
3 is built as a **try-first-then-fall-through** design, not a replacement — if
Vision underperforms on real handheld swings (which the evidence says is a real
risk), the existing classical pipeline is there, untouched, as the safety net. This
is also why Phase 3 must be validated against real handheld clips (see §7's
acceptance gate) before it ships as the default, not just against synthetic data.

## 3. Build order

Do these in order. Each phase ends with `npm run verify` green and a commit.

| Phase | What | New deps? | Native code? |
|---|---|---|---|
| 0 | Accuracy benchmark harness | no | no |
| 1 | Sub-pixel centroid refinement | no | no |
| 2 | Manual exposure native module | no | yes (Swift) |
| 3 | Vision framework hybrid detector | no | yes (Swift) |
| 4 | Custom-trained Core ML detector | yes (deferred) | yes (deferred) |

---

## 4. Phase 0 — Ball-tracking accuracy benchmark harness

**Why first:** without this, "did Phase 1/3 actually help?" has no answer. This
mirrors `src/modules/distance/__tests__/dtlGrid.test.ts`'s pattern (a stratified
factorial grid with a pinned release gate), applied to ball-tracking pixel error
instead of distance-estimate error.

**File to create:** `src/modules/tracking/tracker/__tests__/ballTrackingGrid.test.ts`

**Approach:** extend the existing synthetic-frame fixture
(`src/modules/tracking/testutils/syntheticFrames.ts` — already renders anti-aliased
discs along a parametric parabola with deterministic noise via `mulberry32`) with
two new, currently-missing render options:

1. **Motion blur.** Add `shutterFractionOfFrame?: number` to `RenderOptions` (or a
   new sibling option) — when set, render the disc as **N sub-samples** of its
   position across the shutter-open window within that frame's `dt` (e.g. 8
   sub-samples linearly interpolated between the disc's position at frame-start and
   frame-end), each drawn at reduced opacity and max-blended into the frame. This
   directly simulates the streak-not-circle failure mode documented in
   `classical_cv.md` §2 and `temporal_smoothing.md`'s motion-blur section. At
   `shutterFractionOfFrame = 1.0` (worst case, no manual shutter), the streak should
   visibly span multiple ball-diameters at driver speed; at `shutterFractionOfFrame
   = 0.05` (approximating a manual 1/1000s-class shutter within a 1/240s frame), the
   streak should collapse to near-circular.
2. **Camera shake.** Add `cameraShakePx?: { x: number; y: number }` (per-frame
   translation, driven by the same seeded `rng`) that offsets the ENTIRE rendered
   frame (background gradient + disc) by a small random amount each frame — this
   simulates handheld capture, which is the documented failure mode for both MOG2/
   KNN background subtraction and `VNDetectTrajectoriesRequest` (both assume a
   static camera — `classical_cv.md` §1, `apple_vision_and_capture.md`).

**Test structure**, mirroring `dtlGrid.test.ts`:

- A factorial grid over: ball speed (3 buckets: 80mph/130mph/180mph, i.e. wedge/
  iron/driver-class), shutter fraction (2 buckets: simulated-manual-shutter vs.
  simulated-auto-exposure-at-60fps), camera shake (on/off), background clutter
  (plain gradient vs. gradient + a few rectangles per existing `RectSpec`), and
  capture fps (60fps and 240fps buckets, matching `FPS_LADDER`).
- For each combination, render a synthetic clip with a KNOWN ground-truth path
  (the parabola's exact `cx(t), cy(t)`), run it through `runTracking()` from
  `pipeline.ts` exactly as the real app would, and compute **mean pixel error**
  between the returned `smoothedPath` and the known ground truth, resampled to the
  same timestamps.
- Stratify a representative sample (like `dtlGrid.test.ts` samples 48 of 9072) rather
  than running the full cross product — this keeps CI time bounded.
- **Pin a release gate** the same way `dtlGrid.test.ts` does: run the grid once
  against the CURRENT (Phase 0, pre-Phase-1) pipeline, record the actual median/p90
  pixel error and quality-grade distribution, and write those as the asserted
  thresholds. This is the "before" baseline. Do not tune the gate to make Phase 1
  look artificially good — the gate should reflect what the code actually does.
- Re-run this exact harness after Phase 1 and Phase 3 land, and **update the pinned
  thresholds** to reflect the new, presumably-better numbers, and say so in the
  commit message (e.g. "median pixel error 4.2px → 1.8px after Phase 1 sub-pixel
  refinement"). This is how the plan's central claim — "this made tracking more
  accurate" — becomes falsifiable instead of a vibe.

**Do not** try to source real motion-capture-verified golf footage for this phase —
none is available in this environment, and the DTL benchmark's own pattern
(synthetic factorial grid, not real footage) is the right precedent to follow here
too. If real reference clips become available later, add them as a supplementary
fixture, not a replacement for the synthetic grid (synthetic gives you ground
truth; real clips don't, unless separately hand-annotated).

---

## 5. Phase 1 — Sub-pixel intensity-weighted centroid refinement

**Why:** the audit confirms blob centroids are computed as a **binary-mask pixel
average** (unweighted), not intensity-weighted. Sub-pixel refinement via
intensity-weighted centroid or Gaussian peak fitting is well-evidenced elsewhere
(medical-physics/star-tracker literature: **0.037 ± 0.019px absolute error** via
Hough+refinement; Gaussian fitting beats plain centroid in star-sensor literature —
`classical_cv.md` §5). No golf-specific number exists for the exact px gain, so
treat this as "well-evidenced technique, unverified exact magnitude for our case" —
which is precisely why Phase 0's harness must measure it directly rather than
trusting the literature's numbers to transfer exactly.

**Exact change, file by file:**

1. **`src/modules/tracking/vision/imageOps.ts`** — `labelComponents(binary, width,
   height, minArea)` (around line 187) currently only receives the thresholded
   binary mask, so `cx: sumX / area, cy: sumY / area` (lines 270-271) is necessarily
   an unweighted average. Add an optional 5th parameter:
   `luma?: Uint8Array` (same `width*height` grayscale buffer the binary mask was
   thresholded from — already available at every call site, since thresholding
   reads from it). When `luma` is provided, after computing the raw `sumX/area,
   sumY/area` binary centroid, run a **second pass restricted to the blob's
   `bbox` expanded by 1-2px** in each direction: for every pixel in that expanded
   window, compute a weight from its luma contrast against the local background
   estimate (reuse whatever background/threshold value the caller already computed
   — do not re-derive a new background model inside `imageOps.ts`; pass the
   effective per-pixel weight or the raw luma + a scalar background level in, and
   keep `imageOps.ts` dependency-free of any new state). Recompute `cx, cy` as the
   luma-weighted centroid over that window, overwriting the binary centroid.
   **Keep the parameter optional and the default behavior unchanged** — existing
   callers/tests that don't pass `luma` keep getting today's binary centroid, so no
   existing test in `imageOps.test.ts` breaks.
2. **`src/modules/tracking/vision/classicalDetector.ts`** — around line 355 where
   `cx: r.x + blob.cx, cy: r.y + blob.cy` is assembled into a `BallObservation`,
   thread the already-in-scope ROI-cropped luma buffer into the `labelComponents`
   call so the refinement in step 1 activates. This should be a small, local diff —
   the luma buffer is already being read for thresholding earlier in the same
   function; it just isn't currently passed forward to `labelComponents`.
3. **Do not touch `src/types/tracking.ts`.** It is explicitly commented `"FROZEN
   after scaffold. Workstreams never edit this file."` `BallObservation.cx/cy` are
   already `number` (not integer-typed), so sub-pixel float precision fits the
   existing contract with zero type changes.
4. **Stretch goal, only if Phase 0's harness shows it matters:** streak-aware
   centroid. When a blob's `bbox` aspect ratio is well beyond the existing
   circularity/aspect gates (i.e. a motion-blur streak that still barely passes the
   existing gates), the intensity-weighted centroid computed in step 1 already
   naturally lands near the streak's midpoint (weighted average of a roughly-
   uniform-brightness streak is close to its geometric midpoint) — so do NOT build
   a separate PCA/major-axis streak-centerline extractor unless Phase 0's benchmark
   (with `shutterFractionOfFrame` near 1.0) shows the plain intensity-weighted
   centroid is measurably biased on elongated blobs. Evidence for a dedicated
   streak-centerline method exists (`BlurBall`, arXiv 2509.18387 — see
   `classical_cv.md` §2, `temporal_smoothing.md`'s motion-blur section) but it's a
   heavier lift; earn it with a failing benchmark number, don't build it speculatively.

**Tests to update/add:**
- `src/modules/tracking/vision/__tests__/imageOps.test.ts` — add cases asserting
  `labelComponents` with a `luma` argument returns a materially different (and, for
  a synthetic Gaussian-ish disc with known sub-pixel center, more accurate) `cx/cy`
  than without it.
- `src/modules/tracking/vision/__tests__/classicalDetector.test.ts` — confirm
  detector output `cx/cy` are no longer integer-quantized-looking values for a
  disc rendered at a known sub-pixel center.
- Re-run Phase 0's `ballTrackingGrid.test.ts` and update its pinned thresholds.

---

## 6. Phase 2 — Manual exposure/shutter control (native module)

**Why:** `mobile_inference.md` §1 confirms `react-native-vision-camera`'s `exposure`
prop is only an EV-bias multiplier on top of continuing auto-exposure — it does
**not** expose `AVCaptureDevice.setExposureModeCustom(duration:iso:)`, which is the
actual lever that shortens exposure duration and shrinks motion-blur streak length.
This is confirmed by open feature requests against the library (`react-native-
vision-camera` issues #3670, #2011) — this has to be a small custom native module,
not a config prop on the existing camera adapter.

**New native module:** follow the exact pattern already established by
`ios/FrameDecoder/GolfTracerFrameDecoder.{h,mm,podspec}` (a classic RN bridge
module, `RCTBridgeModule`, its own podspec, registered the same way). Create:

- `ios/ExposureControl/GolfTracerExposureControl.h` / `.mm` / `.podspec`
- Exposes one method to JS: something like
  `setManualExposure(durationSeconds: number, iso: number) -> Promise<void>` that
  calls `AVCaptureDevice.lockForConfiguration()` then
  `setExposureModeCustom(duration:iso:completionHandler:)` on the currently-active
  capture device (obtained the same way the existing camera adapter/VisionCamera
  session already holds a reference — check `src/adapters/camera/VisionCameraAdapter.ts`
  for how the device handle is currently obtained/shared, since this module needs
  to operate on the SAME `AVCaptureDevice` instance VisionCamera is using, not a
  second independent one).
- A second method to revert to auto-exposure (`setAutoExposure() -> Promise<void>`,
  calling `setExposureMode(.continuousAutoExposure)`) — call this if manual exposure
  produces a too-dark frame (see fallback behavior below).

**JS-side integration:**
- Add a thin wrapper, e.g. `src/adapters/camera/ExposureControlAdapter.ts`,
  exposing `setManualExposure(durationSeconds, iso)` / `setAutoExposure()` backed by
  `NativeModules.GolfTracerExposureControl`, matching the existing adapter style
  (see `AudioSamplesAdapter.ts` / `NativeAudioSamplesAdapter.ts` for the
  native-module-wrapped-in-a-typed-adapter pattern already used in this repo).
- Call `setManualExposure` right before recording starts (alongside the existing
  `StartRecordingOptions` setup in the recording screen), targeting **~1/1000s-
  1/2000s** exposure duration as the default (per `temporal_smoothing.md`'s
  motion-blur math: this shrinks a 170mph ball's blur streak from ~30 ball-
  diameters down to ~1-2). **Do not hardcode ISO** — read the device's current
  auto-exposure ISO just before locking (or expose a "boost ISO by N stops to
  compensate" helper) so this doesn't just produce a correctly-sharp but
  under-exposed black frame in typical outdoor daylight. If ambient light is too
  low for the target shutter speed even at a reasonable ISO ceiling, **fall back to
  auto-exposure** (call `setAutoExposure()`) rather than shipping a too-dark, too-
  noisy recording — motion blur beats total under-exposure, so this must be a soft
  preference, not a hard override.
- Revert to auto-exposure when recording stops, so the live camera preview outside
  of an active recording behaves normally.

**Tests:** since this is native Swift/ObjC++ code with no JS-testable logic beyond
the adapter wrapper, follow the existing pattern for other native-backed adapters
(e.g. `NativeAudioSamplesAdapter.test.ts`) — test the JS adapter's calling
convention and error/fallback handling against a mocked `NativeModules` entry, not
the native exposure behavior itself (which needs a real device to verify — see §9).

---

## 7. Phase 3 — Apple Vision framework hybrid primary detector

**Why this is "ML becomes primary":** `VNDetectTrajectoriesRequest` is Apple's
purpose-built, ANE-accelerated, Core ML-backed ball-trajectory detector, shipped
free in iOS 14+. It needs zero training data and zero model bundling — the single
lowest-engineering-risk way to satisfy "a new ML detector becomes primary" within
this plan's scope. Its known weakness (stationary-camera assumption, `§2` above) is
exactly why this phase is architected as **try-first-then-fall-through**, not a
replacement of the existing pipeline.

### 7a. New native module

Create `ios/VisionTracker/GolfTracerVisionTracker.{h,mm,podspec}` (Swift is fine
too — Vision framework's Swift API is the primary one Apple documents; if you write
it in Swift, add a bridging header alongside the existing ObjC++ modules, following
whatever Swift-interop convention the project's `ios/GolfTracerAI.xcodeproj`
already uses, or check with the user if none exists yet).

**Do not** route this through per-frame calls across the JS bridge, and do not
implement it as a per-frame `BallDetector.detect()` plugin. `VNDetectTrajectoriesRequest`
is a **stateful** request (`VNStatefulRequest` subclass) that must be fed frames
sequentially via a `VNSequenceRequestHandler` and only starts returning
`VNTrajectoryObservation`s after several frames (`trajectoryLength`, min 5) — and
per-frame bridge crossings are exactly the overhead `mobile_inference.md` says to
avoid for a batch pipeline. Instead, expose **one bulk method**:

```
detectTrajectory(assetPath: string, fromTimeMs: number, toTimeMs: number,
                 roi: {x: number, y: number, w: number, h: number} /* normalized 0-1 */,
                 minRadiusNormalized: number, maxRadiusNormalized: number)
  -> Promise<{ cx: number, cy: number, radiusPx: number,
               confidence: number, timestampMs: number }[]>
```

Internally: open the asset with `AVAsset`/`AVAssetReader` (or
`AVAssetImageGenerator`, matching whatever the existing `GolfTracerFrameDecoder`
already uses — check `ios/FrameDecoder/GolfTracerFrameDecoder.mm` for the exact
approach in use today and stay consistent rather than introducing a second decode
strategy), step through frames from `fromTimeMs` to `toTimeMs`, feed each one to a
single `VNSequenceRequestHandler` + `VNDetectTrajectoriesRequest` pair (configured
with `objectMinimumNormalizedRadius`/`objectMaximumNormalizedRadius` from the ROI
params and `regionOfInterest` from `roi`), and when the request's completion
handler fires with trajectory observations, flatten them into the returned
`BallObservation`-shaped array (note: this return shape is intentionally identical
to `src/types/tracking.ts`'s `BallObservation`, so the JS side can hand it straight
to the smoothing/grading code with no translation layer). Decode at a resolution
suited to a small object — **1080p, not the classical pipeline's 480px downsample**
(`apple_vision_and_capture.md`: Apple's own guidance recommends 1080p for small
objects like tennis/cricket balls vs VGA for large ones; this native path is cheap
enough — sub-2ms/frame on ANE per Apple's own DistilBERT/Core ML benchmarks — that
it doesn't need the JS pipeline's speed-motivated downsampling).

### 7b. JS-side integration — where this plugs into `pipeline.ts`

Add a new function, e.g. `src/modules/tracking/tracker/visionTrajectory.ts`,
exporting something like:

```
export async function tryVisionTrajectoryDetection(
  asset: VideoAsset,
  impactTimestampMs: number,
  roi: Roi, // reuse the existing `Roi` type from imageOps.ts
): Promise<BallObservation[] | null>
```

wrapping a call to the native module above via `NativeModules.GolfTracerVisionTracker`,
returning `null` (not throwing) if: the native call rejects (OS version too old,
Vision unavailable, zero trajectory observations returned), or the returned
observation count is below some minimum (e.g. fewer than `dtlGrid.test.ts`-style
pinned minimum — tune against Phase 0's benchmark).

In `src/modules/tracking/tracker/pipeline.ts`'s `runTracking()`, **before** step 3
(today's classical-detector warm-start), add an opportunistic first attempt:

```
const visionObservations = await tryVisionTrajectoryDetection(asset, impactTimestampMs, seedRoi);
if (visionObservations) {
  const visionQuality = gradeTrack(visionObservations.length, /* ...matching gradeTrack's existing signature... */);
  if (visionQuality === 'high' || visionQuality === 'medium') {
    // build the BallTrack/TrackingResult directly from visionObservations,
    // through the SAME smoothing (Catmull-Rom) and buildTracerPath steps
    // steps 5-6 already use, and return early — skip the classical detector
    // and tracker entirely for this run.
  }
  // else: fall through to the existing classical pipeline below, unmodified.
}
```

Reuse `gradeTrack` (already defined in `pipeline.ts`) unchanged so "is this good
enough to trust" uses the exact same bar the classical pipeline is already held to
— do not invent a separate, looser quality bar for the Vision path just to make it
look like it's winning more often.

**This is the entire hybrid design**: Vision is tried first because it's cheap
(sub-2ms/frame, all-native, no JS bridge crossings per frame) and requires no
training; if it doesn't clear the existing quality bar, every line of the existing
classical-CV + Kalman + ROI + offline-DP-fallback pipeline runs exactly as it does
today, completely unaware anything changed upstream of it.

### 7c. Tests

- Unit test `tryVisionTrajectoryDetection`'s fallback behavior (native call
  rejects → returns `null`; low observation count → returns `null`) with a mocked
  `NativeModules.GolfTracerVisionTracker`, following the existing pattern for
  testing native-module-backed adapters in this repo (Jest can't invoke real Swift
  code, so this is necessarily a contract/mock-level test, not an accuracy test —
  see §9 for how Vision's actual accuracy gets validated).
- Add a `runTracking()`-level test (in `pipeline.test.ts`) asserting: when a mocked
  `tryVisionTrajectoryDetection` returns a high-quality synthetic track, the
  classical detector/tracker are never invoked (spy/mock and assert zero calls);
  when it returns `null`, the existing classical path runs exactly as before
  (this is a regression guard — it's the test that would catch someone accidentally
  breaking the "automatic fallback" promise in §0).
- Re-run Phase 0's `ballTrackingGrid.test.ts` with the Vision path enabled via a
  mock that simulates Vision's known weaknesses (feed it the harness's
  `cameraShakePx`-perturbed synthetic frames and confirm the harness's fallback
  logic correctly routes to the classical path when Vision's simulated output
  quality is low) — this is how you get automated coverage of the "Vision fails on
  handheld footage, falls back correctly" scenario without needing a real device.

---

## 8. Phase 4 — Custom-trained Core ML detector (deferred — do not start)

This plan does **not** implement Phase 4. It's documented here so the next
decision point is legible, not so it gets built next.

**What the evidence says about this path**: the golf-specific CNN+Kalman paper
(arXiv 2012.09393, `ml_detectors.md`) shows a Faster R-CNN on cropped ROI patches —
i.e. exactly this app's existing ROI-planner pattern — hits 95.9% mAP@36ms, and a
YOLOv3-Tiny variant hits 84.2% mAP at 2.79ms. TrackNet-family multi-frame heatmap
regression massively outperforms single-frame detectors on tiny/blurred objects
(98.56% vs 68% F1 in a head-to-head, `ml_detectors.md`) but is a heavier
integration lift (stacked-frame input, custom heatmap post-processing). Either
would likely beat both the classical detector and Vision framework on raw
accuracy, specifically because it can be trained on exactly this app's failure
modes (motion-blurred, handheld, golf-specific).

**Why it's deferred rather than scoped into this plan**: training a real detector
needs a labeled golf-ball dataset and a training/export pipeline — neither of
which this plan can produce as a side effect of writing React Native/Swift code.
Before Phase 4 is picked up, these need explicit answers (ask the user, do not
assume):

1. **Data source.** Options surfaced in research: (a) the public Roboflow
   Universe golf-ball dataset (mAP@50 86.6%, weak/user-submitted quality — would
   need validation before trusting) as a transfer-learning base; (b) the app's own
   recorded clips, if/when there's a real user base generating them, as a bootstrap
   + active-learning loop; (c) synthetic data generation (render a golf ball onto
   real background plates at varying scale/blur/motion — this plan's Phase 0
   harness is a start toward that but was built for benchmarking, not training-data
   generation at scale). None of these is "free" the way Phase 3's Vision
   framework is.
2. **Training infrastructure.** This is not a React Native or Swift task — it
   needs a Python/PyTorch or Core ML Tools training+conversion pipeline, run
   outside this repo (a separate ML workstream, likely a separate repo/notebook),
   with its output (a `.mlmodel`/`.mlpackage` file) checked into or fetched by this
   app. Decide where that pipeline lives before writing any app-side integration
   code for it.
3. **A go/no-go gate tied to Phase 3's real numbers.** The honest reason to do
   Phase 4 at all is "Vision framework's real-world (not synthetic) accuracy on
   handheld footage is insufficient." Don't start Phase 4 until Phase 3 has shipped
   and been validated against real handheld clips (§9) and that validation shows a
   concrete gap Phase 4 would close. If Vision framework turns out to work well
   enough on real handheld swings, Phase 4 may not be worth its cost at all.

If/when the user decides to greenlight Phase 4, the integration point is already
designed for it: `BallDetector` (frozen interface in `src/types/tracking.ts`) is
exactly the shape a Core ML-backed detector would implement, and `TfliteBallDetector`
(`src/modules/tracking/vision/tfliteDetector.ts`) is the already-named stub to
replace — no architecture change needed at that point, just a real implementation
behind the existing stub's interface.

---

## 9. Validation that can't happen in CI — flag this explicitly to the user

Phases 2 and 3 both need a real iPhone to validate, not just `npm run verify`:

- Phase 2: does manual exposure actually produce a visibly sharper (less
  streaked) ball at driver speed, without under-exposing the frame in typical
  outdoor daylight? This needs an actual recorded comparison clip (auto-exposure
  vs. manual ~1/1000s), reviewed by eye or measured (streak length in pixels).
- Phase 3: does `VNDetectTrajectoriesRequest` produce usable trajectories on real
  **handheld** swings, given Apple's own documentation says it wants a stationary
  camera? This is the single most important open empirical question this plan
  identifies — the synthetic benchmark (Phase 0) can approximate camera shake, but
  a real device test against real handheld footage is the actual gate before
  trusting Vision as the default "primary" path in production. If it fails on real
  handheld footage even after Phase 2's exposure improvements, that's a legitimate,
  evidence-backed reason to keep the classical pipeline as the practical default
  and treat Vision as a secondary signal only (the hybrid fallback logic in §7b
  already handles this gracefully either way — no code change needed if Vision
  just loses most of the time, only a documentation update to set expectations).

Report these two real-device findings back before considering this plan "shipped,"
even once all four phases' code is merged and CI is green.

## 10. Explicit non-goals (do not do these as part of this plan)

- No Android work of any kind.
- No live tracking during recording, no VisionCamera frame-processor code path.
- No soccer or pose-tracking changes.
- No changes to `src/types/tracking.ts` (frozen).
- No removal or weakening of the existing classical CV/Kalman/ROI/offline-DP
  pipeline — it must keep working exactly as it does today for any clip where the
  new Vision path opts out.
- No Phase 4 (custom-trained model) work without an explicit user go-ahead per §8.

## 11. Research index

Full citations and evidence for every claim above:
- `audit_current.md` — ground-truth inventory of the existing pipeline.
- `ml_detectors.md` — YOLO-nano/TrackNet-family, golf/soccer-specific detection papers.
- `classical_cv.md` — background subtraction, Hough circles, HSV/contour, sub-pixel localization.
- `pose_estimation.md` — BlazePose/MoveNet/Vision comparison, occlusion robustness (not used by this plan's scope, retained for a future pose-tracking phase).
- `mobile_inference.md` — capture settings, RN inference runtime options, quantization, the AVAssetReader+Vision architectural recommendation.
- `temporal_smoothing.md` — One-Euro/Kalman/EMA comparison, ballistic-filter choice validation, motion-blur-as-streak evidence.
- `apple_vision_and_capture.md` — `VNDetectTrajectoriesRequest` specifics and caveats, Core ML/ANE latency numbers, frame-striding/ROI-cropping validation against published literature.
