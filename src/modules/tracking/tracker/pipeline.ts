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
import { findImpactFrame } from '../vision/impactDetector';
import { BallTracker, type BallTrackState, type TrackerOptions } from './tracker';
import { buildTracerPath, catmullRomSample } from './tracerGeometry';

export interface RunTrackingOptions {
  /** Analysis width; frames wider than this are downsampled. Default 480. */
  targetWidth?: number;
  /** Launch ROI in analysis coordinates. Default: lower-center band. */
  launchRoi?: Roi;
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
  const launchRoi: Roi = options.launchRoi ?? {
    x: Math.round(0.28 * width),
    y: Math.round(0.5 * height),
    w: Math.round(0.44 * width),
    h: Math.round(0.46 * height),
  };

  // 2. Impact detection via motion energy in the launch ROI.
  const impact = findImpactFrame(frames, launchRoi);
  const impactIndex = Math.min(impact.frameIndex, frames.length - 2);
  onProgress(0.4);

  // 3. Detector: warm the background model with the frames just before
  //    impact so the static scene (ball on tee) is baked into the median.
  const detector =
    options.detector ??
    createDetector(options.detectorKind ?? 'classical', options.detectorOptions);
  const warmStart = Math.max(0, impactIndex - 6);
  for (let i = warmStart; i < impactIndex; i++) {
    await detector.detect(frames[i]!);
  }

  // 4. Track from impact forward. Progress 0.4 → 0.92.
  const tracker = new BallTracker(detector, {
    launchRoi,
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

  const track: BallTrack = {
    observations: tracker.observations,
    smoothedPath,
    impactFrameIndex: frames[impactIndex]!.index,
    impactTimestampMs: frames[impactIndex]!.timestampMs,
    apexPointIndex: argMinY(smoothedPath),
    landingPointIndex: tracker.landingPointIndex,
    frameWidth: width,
    frameHeight: height,
    quality,
  };

  const tracer = buildTracerPath(track, options.style, {
    width: asset.width,
    height: asset.height,
  });

  onProgress(1);
  return { track, tracer };
}
