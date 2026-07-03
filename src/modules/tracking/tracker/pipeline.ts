/**
 * Tracking pipeline orchestration: pull frames (downsampled for analysis) →
 * find the impact frame → run the Kalman-gated tracker → grade quality →
 * smooth the path → build the renderable tracer.
 *
 * Shot-Tracer-style failure modes are handled explicitly: instead of ever
 * emitting a silently-wrong arc, the pipeline grades the track ('high' |
 * 'medium' | 'low' | 'failed') so the UI can offer retry tips.
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
}

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

  // 1. Pull frames, downsampling defensively if the source ignores
  //    targetWidth. Progress 0 → 0.35.
  const estimatedTotal = Math.max(
    1,
    Math.round((asset.durationMs / 1000) * asset.fps),
  );
  const frames: VideoFrame[] = [];
  for await (const raw of frameSource.frames({ targetWidth })) {
    frames.push(raw.width > targetWidth ? downsample(raw, targetWidth) : raw);
    onProgress(Math.min(0.35, (0.35 * frames.length) / estimatedTotal));
    if (frames.length % 24 === 0) await yieldToEventLoop();
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
  const warmStart = Math.max(0, impactIndex - 6);
  for (let i = warmStart; i < impactIndex; i++) {
    await detector.detect(frames[i]!);
  }

  // 4. Track from impact forward. Progress 0.4 → 0.92. launchRoi keeps
  //    anchoring landing height near the tee; seedRoi gates the first
  //    detection.
  const tracker = new BallTracker(detector, {
    launchRoi: impactRoi,
    seedRoi,
    ...options.tracker,
  });
  const span = Math.max(1, frames.length - impactIndex);
  for (let i = impactIndex; i < frames.length; i++) {
    await tracker.step(frames[i]!);
    if (!tracker.isActive) break;
    onProgress(0.4 + (0.52 * (i - impactIndex + 1)) / span);
    if ((i - impactIndex) % 12 === 0) await yieldToEventLoop();
  }
  onProgress(0.92);

  const quality = gradeTrack(
    tracker.observations.length,
    tracker.points.length,
    tracker.state,
  );

  // 5. Smooth: centripetal Catmull-Rom through the raw observations, sampled
  //    at every tracked frame timestamp (coasted frames become interpolated
  //    spline points instead of raw Kalman coasts).
  const control = tracker.observations.map((o) => ({
    t: o.timestampMs,
    x: o.cx,
    y: o.cy,
  }));
  const sampleTs = tracker.points.map((p) => p.timestampMs);
  const smoothXY = catmullRomSample(control, sampleTs);
  const smoothedPath: TrackPoint[] = tracker.points.map((p, i) => ({
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
  const observations = tracker.observations.map((o) => ({
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
    landingPointIndex: tracker.landingPointIndex,
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
