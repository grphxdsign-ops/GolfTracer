/**
 * Tracking pipeline orchestration: pull frames (downsampled for analysis) →
 * find the impact frame → run the Kalman-gated tracker → grade quality →
 * smooth the path → build the renderable tracer.
 *
 * Shot-Tracer-style failure modes are handled explicitly: instead of ever
 * emitting a silently-wrong arc, the pipeline grades the track ('high' |
 * 'medium' | 'low' | 'failed') so the UI can offer retry tips.
 *
 * The whole run is bounded by `timeBudgetMs` (DESIGN §12): each stage adapts
 * — stride, stop early, shrink the fallback window — rather than run long,
 * and the quality grade reflects only what was actually analyzed.
 */
import type { FrameSource, VideoFrame } from '../../../types/media';
import type {
  BallDetector,
  BallTrack,
  TracerStyle,
  TrackingResult,
  TrackPoint,
  TrackQuality,
} from '../../../types/tracking';
import {
  createDetector,
  type ClassicalDetectorOptions,
  type DetectorKind,
} from '../../../adapters/detector';
import { downsample, type Roi } from '../vision/imageOps';
import { detectorDefaultsForFps } from '../vision/classicalDetector';
import {
  associateGlobally,
  fallbackSearchRoi,
} from './globalAssociation';
import { findImpactFrame } from '../vision/impactDetector';
import { deriveRoisFromBallPoint } from './roiPlanner';
import { BallTracker, type BallTrackState, type TrackerOptions } from './tracker';
import { buildTracerPath, catmullRomSample } from './tracerGeometry';

export interface RunTrackingOptions {
  /** Analysis width; frames wider than this are downsampled. Default 480. */
  targetWidth?: number;
  /** Launch ROI in analysis coordinates. Default: lower-center band. */
  launchRoi?: Roi;
  /**
   * Tight box around the tee, in analysis coordinates, where the strike
   * energy lives (impact detection). Defaults to the ballPoint-derived box,
   * then launchRoi, then the lower-center band.
   */
  impactRoi?: Roi;
  /**
   * Corridor above the tee, in analysis coordinates, where the tracker looks
   * for the first post-impact detection. Same fallback chain as impactRoi.
   */
  seedRoi?: Roi;
  /**
   * One user tap on the ball, in NATIVE video pixels (the space users tap
   * and BallTrack emits). Scaled into analysis pixels and expanded into
   * impact/seed ROIs via deriveRoisFromBallPoint.
   */
  ballPoint?: { x: number; y: number };
  /** Inject a detector (tests); overrides detectorKind. */
  detector?: BallDetector;
  detectorKind?: DetectorKind;
  detectorOptions?: ClassicalDetectorOptions;
  tracker?: Partial<Omit<TrackerOptions, 'launchRoi'>>;
  style?: Partial<TracerStyle>;
  onProgress?: (fraction: number) => void;
  /**
   * Wall-clock budget for the whole run, ms (DESIGN §12). The pipeline adapts
   * to finish inside it — frame striding past the 2 s prefix, an early
   * tracking stop at 92%, a fallback pass bounded to the remaining budget —
   * and never inflates the quality grade to hide the adaptation. Non-finite
   * or non-positive disables all budget behavior. Default 3000.
   */
  timeBudgetMs?: number;
  /** Clock for budget checks; injectable for tests. Default Date.now. */
  clock?: () => number;
}

/** Pull-stage share of the budget that triggers frame striding. */
const PULL_BUDGET_FRACTION = 0.45;
/** Budget fraction after which tracking stops and grades what exists. */
const TRACK_STOP_FRACTION = 0.92;
/** Minimum budget fraction left for the offline fallback to be worth it. */
const FALLBACK_MIN_FRACTION = 0.25;
/**
 * Frames inside this prefix are never strided: trimmed clips put impact
 * early, and striding cannot know the impact index while pulling.
 */
const UNSTRIDED_PREFIX_MS = 2000;

/**
 * Quality grading. Exported for direct unit testing.
 * - failed: never tracked, or the track was lost <15 frames after impact.
 * - high: >85% of tracked frames actually observed (not coasted).
 */
export function gradeTrack(
  observedCount: number,
  totalPoints: number,
  state: BallTrackState,
): TrackQuality {
  if (totalPoints === 0 || observedCount < 5) return 'failed';
  if (state === 'lost' && totalPoints < 15) return 'failed';
  const ratio = observedCount / totalPoints;
  if (ratio > 0.85) return 'high';
  if (ratio > 0.65) return 'medium';
  return 'low';
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function argMinY(points: TrackPoint[]): number {
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i]!.y < points[best]!.y) best = i;
  }
  return best;
}

export async function runTracking(
  frameSource: FrameSource,
  options: RunTrackingOptions = {},
): Promise<TrackingResult> {
  const targetWidth = options.targetWidth ?? 480;
  const onProgress = options.onProgress ?? (() => undefined);
  const asset = frameSource.asset;
  const timeBudgetMs = options.timeBudgetMs ?? 3000;
  const clock = options.clock ?? Date.now;
  const budgeted = Number.isFinite(timeBudgetMs) && timeBudgetMs > 0;
  const startMs = clock();
  const captureFps = asset.recordedFps ?? asset.fps;

  // 1. Pull frames, downsampling defensively if the source ignores
  //    targetWidth. Progress 0 → 0.35. When the pace measured over 24-frame
  //    blocks projects the pull past its budget share, frames beyond the
  //    un-strided prefix are strided (keep 1-of-2, then 1-of-3), floored at
  //    ~30 effective fps for ≥60 fps captures and ~15 for 30 fps ones. Kept
  //    frames keep their real timestamps, so Kalman dt and reveal timing are
  //    unaffected.
  const estimatedTotal = Math.max(
    1,
    Math.round((asset.durationMs / 1000) * asset.fps),
  );
  // 59.5/epsilon guards: NTSC rates (29.97, 59.94) must count as 30/60 fps.
  const strideFloorFps = captureFps >= 59.5 ? 30 : 15;
  const maxStride = Math.min(
    3,
    Math.max(1, Math.floor(captureFps / strideFloorFps + 1e-3)),
  );
  const frames: VideoFrame[] = [];
  let pulled = 0;
  let stride = 1;
  let pastPrefix = 0;
  let firstTimestampMs = 0;
  for await (const raw of frameSource.frames({ targetWidth })) {
    if (pulled === 0) firstTimestampMs = raw.timestampMs;
    pulled++;
    const inPrefix = raw.timestampMs - firstTimestampMs < UNSTRIDED_PREFIX_MS;
    if (inPrefix || pastPrefix++ % stride === 0) {
      frames.push(raw.width > targetWidth ? downsample(raw, targetWidth) : raw);
    }
    onProgress(Math.min(0.35, (0.35 * pulled) / estimatedTotal));
    if (pulled % 24 === 0) {
      if (budgeted && stride < maxStride) {
        const projectedMs = ((clock() - startMs) / pulled) * estimatedTotal;
        if (projectedMs > PULL_BUDGET_FRACTION * timeBudgetMs) {
          stride = Math.min(stride + 1, maxStride);
        }
      }
      await yieldToEventLoop();
    }
  }
  if (frames.length < 8) {
    throw new Error(
      `Video too short to analyze: got ${frames.length} frames, need at least 8`,
    );
  }
  onProgress(0.35);

  const width = frames[0]!.width;
  const height = frames[0]!.height;

  // Native-vs-analysis scale factors, needed both to scale the ballPoint tap
  // (native px) down into analysis space here and to scale the finished track
  // back up to native pixels in step 6.
  const nativeWidth = asset.width > 0 ? asset.width : width;
  const nativeHeight = asset.height > 0 ? asset.height : height;

  // ROI resolution. Impact detection and tracker seeding are different jobs
  // (field evidence: strike energy is at the tee, but the tee area is full of
  // clubhead/tee/shadow clutter right after impact), so they get separate
  // boxes: explicit option ?? derived from the user's ballPoint tap ??
  // launchRoi ?? the historical lower-center band. With zero options this
  // reproduces the single-launchRoi behavior exactly.
  const derived = options.ballPoint
    ? deriveRoisFromBallPoint(
        {
          x: options.ballPoint.x * (width / nativeWidth),
          y: options.ballPoint.y * (height / nativeHeight),
        },
        { width, height },
      )
    : undefined;
  const defaultBand: Roi = {
    x: Math.round(0.28 * width),
    y: Math.round(0.5 * height),
    w: Math.round(0.44 * width),
    h: Math.round(0.46 * height),
  };
  const impactRoi: Roi =
    options.impactRoi ?? derived?.impactRoi ?? options.launchRoi ?? defaultBand;
  const seedRoi: Roi =
    options.seedRoi ?? derived?.seedRoi ?? options.launchRoi ?? defaultBand;

  // 2. Impact detection via motion energy in the impact (tee) ROI.
  const impact = findImpactFrame(frames, impactRoi);
  const impactIndex = Math.min(impact.frameIndex, frames.length - 2);
  onProgress(0.4);

  // 3. Detector: warm the background model with the frames just before
  //    impact so the static scene (ball on tee) is baked into the median.
  //    Defaults are fps-aware (static background at ≤60 fps capture) and
  //    caller options win key-by-key.
  const detectorOptions: ClassicalDetectorOptions = {
    ...detectorDefaultsForFps(asset.recordedFps ?? asset.fps),
    ...options.detectorOptions,
  };
  const detector =
    options.detector ??
    createDetector(options.detectorKind ?? 'classical', detectorOptions);
  // 'auto' polarity's dark fallback is for the confirmed track (ball darker
  // than open sky late in flight); at seed time it would let dark divot
  // chunks flying through the corridor start a track, so seeding runs a
  // bright-only twin warmed on the same frames.
  const seedDetector =
    !options.detector && detectorOptions.polarity === 'auto'
      ? createDetector(options.detectorKind ?? 'classical', {
          ...detectorOptions,
          polarity: 'bright',
        })
      : undefined;
  const warmStart = Math.max(0, impactIndex - 6);
  for (let i = warmStart; i < impactIndex; i++) {
    await detector.detect(frames[i]!);
    if (seedDetector) await seedDetector.detect(frames[i]!);
  }

  // 4. Track from impact forward. Progress 0.4 → 0.92. launchRoi keeps
  //    anchoring landing height near the tee; seedRoi gates the first
  //    detection. The Kalman process noise is jerk intensity (px²/s⁵), so
  //    the default tuned for high-fps time-steps is far too stiff at 30 fps —
  //    the filter's learned deceleration outlives the ball's and the gate
  //    rejects the real, still-decelerating ball. Caller options win.
  //    Past 92% of the time budget stepping stops and the partial track is
  //    graded as-is — gradeTrack never sees the frames that were skipped.
  const tracker = new BallTracker(detector, {
    launchRoi: impactRoi,
    seedRoi,
    ...(seedDetector ? { seedDetector } : {}),
    ...(captureFps > 0 && captureFps <= 60
      ? { kalman: { processNoise: 4e6 } }
      : {}),
    ...options.tracker,
  });
  const span = Math.max(1, frames.length - impactIndex);
  const trackStartMs = clock();
  let stepped = 0;
  for (let i = impactIndex; i < frames.length; i++) {
    if (budgeted && clock() - startMs > TRACK_STOP_FRACTION * timeBudgetMs) {
      break;
    }
    await tracker.step(frames[i]!);
    stepped++;
    if (!tracker.isActive) break;
    onProgress(0.4 + (0.52 * (i - impactIndex + 1)) / span);
    if ((i - impactIndex) % 12 === 0) await yieldToEventLoop();
  }
  // Measured per-frame detection cost on this device — sizes the fallback.
  const stepMs = stepped > 0 ? (clock() - trackStartMs) / stepped : 0;
  onProgress(0.92);

  let quality = gradeTrack(
    tracker.observations.length,
    tracker.points.length,
    tracker.state,
  );
  let rawObservations = tracker.observations;
  let rawPoints: { timestampMs: number; interpolated: boolean }[] =
    tracker.points;
  let landingPointIndex = tracker.landingPointIndex;

  // 4b. Offline fallback for normal-rate captures: when online seeding lost
  //     the launch (glints, divots, the tee and the ball's shadow all cross
  //     the corridor while the ball is still a blur), re-detect every
  //     post-impact frame and keep the best temporally-consistent chain —
  //     the ball is the only object whose smooth decelerating climb spans
  //     the window. Skipped when the caller injected a custom detector,
  //     which cannot be re-instantiated here, and when less than a quarter
  //     of the time budget remains — a rescue that blows the budget is worse
  //     than an honest failed grade.
  const wantsFallback =
    (quality === 'failed' || quality === 'low' || rawObservations.length < 10) &&
    !options.detector &&
    captureFps > 0 &&
    captureFps <= 60;
  if (wantsFallback) {
    const remainingMs = timeBudgetMs - (clock() - startMs);
    if (!budgeted || remainingMs > FALLBACK_MIN_FRACTION * timeBudgetMs) {
      // associateGlobally has no budget input and frames are its cost driver,
      // so the window is sliced to what the tracking stage's measured
      // per-frame cost says fits (warm-up detects count against it too).
      let window = frames.slice(impactIndex);
      if (budgeted && stepMs > 0) {
        const fit =
          Math.floor(remainingMs / stepMs) - (impactIndex - warmStart);
        window = window.slice(0, Math.max(0, fit));
      }
      if (window.length > 0) {
        const fallbackDetector = createDetector(
          options.detectorKind ?? 'classical',
          {
            ...detectorOptions,
            polarity: 'auto',
            minRadiusPx: 1,
          },
        );
        for (let i = warmStart; i < impactIndex; i++) {
          await fallbackDetector.detect(frames[i]!);
        }
        const chain = await associateGlobally(window, fallbackDetector, {
          searchRoi: fallbackSearchRoi(seedRoi, width, height),
        });
        if (chain.length > rawObservations.length) {
          rawObservations = chain;
          rawPoints = chain.map((o) => ({
            timestampMs: o.timestampMs,
            interpolated: false,
          }));
          landingPointIndex = undefined;
          // Chains have no coasted points, so grade purely on coverage.
          quality =
            chain.length >= 15 ? 'high' : chain.length >= 8 ? 'medium' : 'low';
        }
      }
    }
  }

  // 5. Smooth: centripetal Catmull-Rom through the raw observations, sampled
  //    at every tracked frame timestamp (coasted frames become interpolated
  //    spline points instead of raw Kalman coasts).
  const control = rawObservations.map((o) => ({
    t: o.timestampMs,
    x: o.cx,
    y: o.cy,
  }));
  const sampleTs = rawPoints.map((p) => p.timestampMs);
  const smoothXY = catmullRomSample(control, sampleTs);
  const smoothedPath: TrackPoint[] = rawPoints.map((p, i) => ({
    timestampMs: p.timestampMs,
    x: smoothXY[i]!.x,
    y: smoothXY[i]!.y,
    interpolated: p.interpolated,
  }));

  // 6. Rescale from analysis pixels back to native video pixels so the track
  //    shares one coordinate space with everything downstream: calibration
  //    reference points are tapped in native pixels and distance estimation
  //    builds its camera model from native video metadata, so handing it an
  //    analysis-resolution track would skew every measurement by the
  //    downsample factor.
  const sx = width > 0 ? nativeWidth / width : 1;
  const sy = height > 0 ? nativeHeight / height : 1;
  const observations = rawObservations.map((o) => ({
    ...o,
    cx: o.cx * sx,
    cy: o.cy * sy,
    radiusPx: (o.radiusPx * (sx + sy)) / 2,
  }));
  const nativePath: TrackPoint[] = smoothedPath.map((p) => ({
    ...p,
    x: p.x * sx,
    y: p.y * sy,
  }));

  const track: BallTrack = {
    observations,
    smoothedPath: nativePath,
    impactFrameIndex: frames[impactIndex]!.index,
    impactTimestampMs: frames[impactIndex]!.timestampMs,
    apexPointIndex: argMinY(nativePath),
    landingPointIndex,
    frameWidth: nativeWidth,
    frameHeight: nativeHeight,
    quality,
  };

  // The track is already native; buildTracerPath's scale factor is 1 here.
  const tracer = buildTracerPath(track, options.style, {
    width: nativeWidth,
    height: nativeHeight,
  });

  onProgress(1);
  return { track, tracer };
}
