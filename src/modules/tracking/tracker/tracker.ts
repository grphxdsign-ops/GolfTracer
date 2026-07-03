/**
 * BallTracker — Kalman-gated single-target tracker.
 *
 * The core trick (arXiv 2012.09393): never run the detector on the whole
 * frame. After seeding near the launch ROI, each frame is processed as
 * predict → search only a small ROI around the predicted position (sized by
 * the innovation covariance) → associate the nearest Mahalanobis-gated
 * candidate → update, or coast on the prediction for up to `maxMisses`
 * frames. Decoys (birds, club heads, ball ghosts) that don't fit
 * constant-acceleration motion fall outside the gate and are rejected.
 *
 * Lifecycle: idle → tentative (needs `confirmHits` consecutive hits) →
 * confirmed → landed | lost.
 */
import type { VideoFrame } from '../../../types/media';
import type {
  BallDetector,
  BallObservation,
  TrackPoint,
} from '../../../types/tracking';
import { clampRoi, type Roi } from '../vision/imageOps';
import { ConstantAccelerationKF, type KalmanOptions } from './kalman';

export type BallTrackState =
  | 'idle'
  | 'tentative'
  | 'confirmed'
  | 'landed'
  | 'lost';

export interface TrackerOptions {
  /** Where the ball launches from, in analysis-frame pixels. */
  launchRoi: Roi;
  /** χ² gate (2 dof) for Mahalanobis association. 9.21 = 99%. */
  gateChi2?: number;
  /** Consecutive missed frames tolerated before the track is lost. */
  maxMisses?: number;
  /** Consecutive hits needed to confirm a tentative track. */
  confirmHits?: number;
  /** Search ROI half-size bounds in px. */
  minSearchHalf?: number;
  maxSearchHalf?: number;
  /** Consecutive descending-velocity frames that arm landing detection. */
  landingDescentFrames?: number;
  /** Minimum detector confidence to seed a track. */
  minSeedConfidence?: number;
  /** Fraction of frame height under which a lost track counts as landed. */
  landingLowFraction?: number;
  kalman?: KalmanOptions;
}

export class BallTracker {
  readonly observations: BallObservation[] = [];
  readonly points: TrackPoint[] = [];
  state: BallTrackState = 'idle';
  landingPointIndex: number | undefined;

  private readonly detector: BallDetector;
  private readonly launchRoi: Roi;
  private readonly gateChi2: number;
  private readonly maxMisses: number;
  private readonly confirmHits: number;
  private readonly minSearchHalf: number;
  private readonly maxSearchHalf: number;
  private readonly landingDescentFrames: number;
  private readonly minSeedConfidence: number;
  private readonly landingLowFraction: number;
  private readonly kalmanOptions: KalmanOptions;

  private kf: ConstantAccelerationKF | null = null;
  private hits = 0;
  private misses = 0;
  private lastTimestampMs = 0;
  private descentRun = 0;
  private seedY = 0;
  private avgRadius = 4;

  constructor(detector: BallDetector, options: TrackerOptions) {
    this.detector = detector;
    this.launchRoi = options.launchRoi;
    this.gateChi2 = options.gateChi2 ?? 9.21;
    this.maxMisses = options.maxMisses ?? 8;
    this.confirmHits = options.confirmHits ?? 3;
    this.minSearchHalf = options.minSearchHalf ?? 16;
    this.maxSearchHalf = options.maxSearchHalf ?? 96;
    this.landingDescentFrames = options.landingDescentFrames ?? 4;
    this.minSeedConfidence = options.minSeedConfidence ?? 0.15;
    this.landingLowFraction = options.landingLowFraction ?? 0.7;
    this.kalmanOptions = options.kalman ?? {};
  }

  get isActive(): boolean {
    return this.state !== 'lost' && this.state !== 'landed';
  }

  async step(frame: VideoFrame): Promise<void> {
    if (!this.isActive) return;
    if (this.state === 'idle') {
      await this.trySeed(frame);
      return;
    }

    const kf = this.kf!;
    const dt = Math.max((frame.timestampMs - this.lastTimestampMs) / 1000, 1e-4);
    this.lastTimestampMs = frame.timestampMs;
    kf.predict(dt);

    // Search ROI sized by innovation uncertainty plus a ball-size margin.
    const sigma = kf.positionGateSigma();
    const half = Math.max(
      this.minSearchHalf,
      Math.min(this.maxSearchHalf, 3 * sigma + 3 * this.avgRadius),
    );
    const roi = clampRoi(
      { x: kf.x - half, y: kf.y - half, w: 2 * half, h: 2 * half },
      frame.width,
      frame.height,
    );

    const candidates = await this.detector.detect(frame, roi);
    let best: BallObservation | null = null;
    let bestD2 = this.gateChi2;
    for (const c of candidates) {
      const d2 = kf.innovation(c.cx, c.cy).mahalanobis2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = c;
      }
    }

    if (best) {
      kf.update(best.cx, best.cy);
      this.observations.push(best);
      this.points.push({
        timestampMs: frame.timestampMs,
        x: kf.x,
        y: kf.y,
        interpolated: false,
      });
      this.hits++;
      this.misses = 0;
      this.avgRadius = 0.8 * this.avgRadius + 0.2 * best.radiusPx;
      if (this.state === 'tentative' && this.hits >= this.confirmHits) {
        this.state = 'confirmed';
      }
    } else {
      this.misses++;
      if (this.state === 'tentative') {
        // Tentative tracks need consecutive hits; a miss discards the seed.
        this.dropTentative();
        return;
      }
      // Coast on the prediction, marked interpolated.
      this.points.push({
        timestampMs: frame.timestampMs,
        x: kf.x,
        y: kf.y,
        interpolated: true,
      });
      if (this.misses > this.maxMisses) {
        this.declareLost(frame);
        return;
      }
    }

    if (this.state === 'confirmed') {
      this.checkLanding(frame);
    }
  }

  private async trySeed(frame: VideoFrame): Promise<void> {
    const roi = clampRoi(this.launchRoi, frame.width, frame.height);
    const candidates = await this.detector.detect(frame, roi);
    let best: BallObservation | null = null;
    for (const c of candidates) {
      if (c.confidence < this.minSeedConfidence) continue;
      if (!best || c.confidence > best.confidence) best = c;
    }
    if (!best) return;

    this.kf = new ConstantAccelerationKF(
      { x: best.cx, y: best.cy },
      this.kalmanOptions,
    );
    this.state = 'tentative';
    this.hits = 1;
    this.misses = 0;
    this.descentRun = 0;
    this.seedY = best.cy;
    this.avgRadius = Math.max(2, best.radiusPx);
    this.lastTimestampMs = best.timestampMs;
    this.observations.push(best);
    this.points.push({
      timestampMs: best.timestampMs,
      x: best.cx,
      y: best.cy,
      interpolated: false,
    });
  }

  private dropTentative(): void {
    // Discard everything recorded since the (unconfirmed) seed and go back to
    // looking for a launch.
    this.observations.length = 0;
    this.points.length = 0;
    this.kf = null;
    this.hits = 0;
    this.misses = 0;
    this.descentRun = 0;
    this.state = 'idle';
  }

  private checkLanding(frame: VideoFrame): void {
    const kf = this.kf!;
    // Screen y grows downward: vy > 0 means the ball is descending.
    if (kf.vy > 0) {
      this.descentRun++;
    } else {
      this.descentRun = 0;
    }
    const nearLaunchHeight = kf.y >= this.seedY - 0.02 * frame.height;
    if (this.descentRun >= this.landingDescentFrames && nearLaunchHeight) {
      this.state = 'landed';
      this.trimTrailingInterpolated();
      this.landingPointIndex = this.points.length > 0 ? this.points.length - 1 : undefined;
    }
  }

  private declareLost(frame: VideoFrame): void {
    this.state = 'lost';
    const lastY = this.kf ? this.kf.y : 0;
    this.trimTrailingInterpolated();
    // Track loss low in the frame while descending reads as a landing (ball
    // hit the ground / rolled out of contrast).
    if (
      this.points.length > 0 &&
      lastY >= this.landingLowFraction * frame.height &&
      this.descentRun >= this.landingDescentFrames
    ) {
      this.landingPointIndex = this.points.length - 1;
    }
  }

  private trimTrailingInterpolated(): void {
    while (
      this.points.length > 0 &&
      this.points[this.points.length - 1]!.interpolated
    ) {
      this.points.pop();
    }
  }
}
