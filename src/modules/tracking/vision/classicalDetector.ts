/**
 * Classical (non-ML) golf-ball proposal detector.
 *
 * Pipeline per frame: background estimate → difference vs background → binary
 * threshold → 4-connected components → candidate scoring by circularity,
 * size, and contrast over the local background.
 *
 * Two background models:
 * - 'rolling' (default): per-pixel median over the last `historySize` frames,
 *   recomputed for the ROI on every detect() (a MOG2-lite that a handful of
 *   frames is enough to warm). Right for high-fps slow-mo, where the ball
 *   clears its own recent history within a frame or two.
 * - 'static': the first `staticWarmupFrames` frames are accumulated and a
 *   full-frame per-pixel temporal median is frozen ONCE. Right for 30/60 fps
 *   captures, where a slowly receding ball (a few px/frame late in flight)
 *   overlaps its own rolling history, gets absorbed into the background, and
 *   is lost. `staticRefreshAlpha` optionally drifts the frozen model toward
 *   the current scene (per-pixel EWMA over the detect ROI) so slow lighting
 *   changes are absorbed; 0 keeps it fully frozen.
 *
 * Research consensus (arXiv 2012.09393 and friends): single-frame CNNs
 * struggle on <20px motion-blurred balls; classical proposals gated by a
 * Kalman filter are the production-pragmatic baseline. This detector is
 * intentionally cheap so the tracker can run it on a small predicted ROI
 * every frame.
 */
import type { VideoFrame } from '../../../types/media';
import type { BallDetector, BallObservation } from '../../../types/tracking';
import {
  absDiff,
  binarize,
  clampRoi,
  extractRoi,
  labelComponents,
  otsuThreshold,
  positiveDiff,
  type Roi,
} from './imageOps';

/** Background model: rolling short-window median vs frozen warmup median. */
export type BackgroundMode = 'rolling' | 'static';

export interface ClassicalDetectorOptions {
  /** Background model. Default 'rolling' (the historical behavior). */
  backgroundMode?: BackgroundMode;
  /** Frames kept for the rolling-median background. Default 5. */
  historySize?: number;
  /** Frames required before detection starts. Default 3. */
  minHistory?: number;
  /**
   * Static mode: frames accumulated before the background is frozen (a
   * per-pixel temporal median over them). Detection returns [] until then,
   * like minHistory in rolling mode. Default 5.
   */
  staticWarmupFrames?: number;
  /**
   * Static mode: per-pixel EWMA rate `bg += α·(cur - bg)` applied over the
   * detect ROI on every frame after freezing. 0 (default) keeps the model
   * fully frozen; e.g. 0.02 absorbs slow lighting drift. The background is
   * 8-bit, so updates smaller than half a grey level (α·|cur-bg| < 0.5)
   * quantize away — tiny α values only track large scene changes.
   */
  staticRefreshAlpha?: number;
  /** Fixed grey-level diff threshold, or 'otsu' to derive per ROI. Default 20. */
  diffThreshold?: number | 'otsu';
  /** Minimum blob circularity (4π·area/perimeter²). Default 0.6. */
  minCircularity?: number;
  /** Radius-equivalent (sqrt(area/π)) bounds in px. Defaults 2 and 30. */
  minRadiusPx?: number;
  maxRadiusPx?: number;
  /** Minimum mean diff (grey levels) inside the blob. Default 12. */
  minContrast?: number;
  /** Max bbox aspect ratio (long/short side). Default 2.2. */
  maxAspect?: number;
  /**
   * Bounds on area/(bbox area). A disc fills ~π/4 ≈ 0.785 of its bbox;
   * solid rectangles fill ~1.0 and skinny fragments much less. Defaults
   * 0.5 and 0.92.
   */
  minFill?: number;
  maxFill?: number;
  /**
   * 'bright': ball brighter than background (white ball on grass — also
   * suppresses the dark "ghost" left at the tee right after impact).
   * 'both': absolute difference (ball against sky can be darker).
   * 'auto': both passes run and merge, with darker-than-background
   * candidates' confidence scaled by 0.75 so a visible bright ball always
   * outranks dark debris, shadows, and the tee ghost — without suppressing
   * the dark half entirely (a hard bright-wins rule hides a dark ball
   * whenever a large ROI contains any bright clutter). Measured on real
   * footage: a climbing ball flips polarity mid-flight, brighter than the
   * treeline (+39..+133 grey levels) then darker than open sky (−35..−63),
   * so a single fixed polarity loses one half of the flight.
   */
  polarity?: 'bright' | 'both' | 'auto';
}

interface HistoryFrame {
  luma: Uint8Array;
  width: number;
  height: number;
}

export class ClassicalBallDetector implements BallDetector {
  private readonly backgroundMode: BackgroundMode;
  private readonly historySize: number;
  private readonly minHistory: number;
  private readonly staticWarmupFrames: number;
  private readonly staticRefreshAlpha: number;
  private readonly diffThreshold: number | 'otsu';
  private readonly minCircularity: number;
  private readonly minRadiusPx: number;
  private readonly maxRadiusPx: number;
  private readonly minContrast: number;
  private readonly maxAspect: number;
  private readonly minFill: number;
  private readonly maxFill: number;
  private readonly polarity: 'bright' | 'both' | 'auto';
  /** Rolling history in 'rolling' mode; warmup accumulator in 'static'. */
  private history: HistoryFrame[] = [];
  /** Frozen full-frame background ('static' mode only, null while warming). */
  private staticBackground: Uint8Array | null = null;
  private staticWidth = 0;
  private staticHeight = 0;

  constructor(options: ClassicalDetectorOptions = {}) {
    this.backgroundMode = options.backgroundMode ?? 'rolling';
    this.historySize = options.historySize ?? 5;
    this.minHistory = options.minHistory ?? 3;
    this.staticWarmupFrames = options.staticWarmupFrames ?? 5;
    this.staticRefreshAlpha = options.staticRefreshAlpha ?? 0;
    this.diffThreshold = options.diffThreshold ?? 20;
    this.minCircularity = options.minCircularity ?? 0.6;
    this.minRadiusPx = options.minRadiusPx ?? 2;
    this.maxRadiusPx = options.maxRadiusPx ?? 30;
    this.minContrast = options.minContrast ?? 12;
    this.maxAspect = options.maxAspect ?? 2.2;
    this.minFill = options.minFill ?? 0.5;
    this.maxFill = options.maxFill ?? 0.92;
    this.polarity = options.polarity ?? 'bright';
  }

  reset(): void {
    this.history = [];
    this.staticBackground = null;
  }

  async detect(
    frame: VideoFrame,
    roi?: { x: number; y: number; w: number; h: number },
  ): Promise<BallObservation[]> {
    const r = clampRoi(
      roi ?? { x: 0, y: 0, w: frame.width, h: frame.height },
      frame.width,
      frame.height,
    );

    if (this.backgroundMode === 'static') {
      return this.detectStatic(frame, r);
    }

    const usable = this.history.filter(
      (h) => h.width === frame.width && h.height === frame.height,
    );

    let observations: BallObservation[] = [];
    if (usable.length >= this.minHistory) {
      const background = this.medianBackground(frame.width, r, usable);
      observations = this.detectInRoi(frame, r, background);
    }

    this.pushHistory(frame);
    return observations;
  }

  /**
   * Static-background path: warm up, freeze a full-frame temporal median
   * once, then detect every subsequent frame against the frozen buffer. A
   * frame-dimension change (like reset()) discards the model and re-warms.
   */
  private detectStatic(frame: VideoFrame, r: Roi): BallObservation[] {
    if (
      this.staticBackground &&
      (this.staticWidth !== frame.width || this.staticHeight !== frame.height)
    ) {
      this.staticBackground = null;
    }

    if (!this.staticBackground) {
      // Warming: accumulate same-sized frames, freeze when enough are held.
      this.history = this.history.filter(
        (h) => h.width === frame.width && h.height === frame.height,
      );
      this.history.push({
        luma: frame.luma.slice(),
        width: frame.width,
        height: frame.height,
      });
      if (this.history.length >= this.staticWarmupFrames) {
        this.staticBackground = this.medianBackground(
          frame.width,
          { x: 0, y: 0, w: frame.width, h: frame.height },
          this.history,
        );
        this.staticWidth = frame.width;
        this.staticHeight = frame.height;
        this.history = [];
      }
      return [];
    }

    const background = extractRoi(this.staticBackground, frame.width, r);
    const observations = this.detectInRoi(frame, r, background);
    if (this.staticRefreshAlpha > 0) {
      this.refreshStaticBackground(frame, r);
    }
    return observations;
  }

  /** EWMA the frozen background toward the current frame inside the ROI. */
  private refreshStaticBackground(frame: VideoFrame, r: Roi): void {
    const alpha = this.staticRefreshAlpha;
    const bg = this.staticBackground!;
    for (let y = r.y; y < r.y + r.h; y++) {
      const row = y * frame.width;
      for (let x = r.x; x < r.x + r.w; x++) {
        const idx = row + x;
        // +0.5 rounds; Uint8Array assignment truncates.
        bg[idx] = bg[idx]! + alpha * (frame.luma[idx]! - bg[idx]!) + 0.5;
      }
    }
  }

  private pushHistory(frame: VideoFrame): void {
    // Copy: FrameSource implementations may reuse their buffers.
    this.history.push({
      luma: frame.luma.slice(),
      width: frame.width,
      height: frame.height,
    });
    if (this.history.length > this.historySize) {
      this.history.shift();
    }
  }

  /** Per-pixel temporal median over `history`, computed only for the ROI. */
  private medianBackground(
    width: number,
    r: Roi,
    history: HistoryFrame[],
  ): Uint8Array {
    const background = new Uint8Array(r.w * r.h);
    const samples = new Array<number>(history.length);
    for (let y = 0; y < r.h; y++) {
      const srcRow = (r.y + y) * width + r.x;
      for (let x = 0; x < r.w; x++) {
        for (let f = 0; f < history.length; f++) {
          samples[f] = history[f]!.luma[srcRow + x]!;
        }
        samples.sort((a, b) => a - b);
        const mid = samples.length >> 1;
        background[y * r.w + x] =
          samples.length % 2 === 1
            ? samples[mid]!
            : (samples[mid - 1]! + samples[mid]!) >> 1;
      }
    }
    return background;
  }

  private detectInRoi(
    frame: VideoFrame,
    r: Roi,
    background: Uint8Array,
  ): BallObservation[] {
    const current = extractRoi(frame.luma, frame.width, r);
    if (this.polarity === 'auto') {
      const bright = this.gateBlobs(frame, r, positiveDiff(current, background));
      const dark = this.gateBlobs(
        frame,
        r,
        positiveDiff(background, current),
      ).map((o) => ({ ...o, confidence: o.confidence * 0.75 }));
      const out = bright.concat(dark);
      out.sort((a, b) => b.confidence - a.confidence);
      return out;
    }
    const diff =
      this.polarity === 'bright'
        ? positiveDiff(current, background)
        : absDiff(current, background);
    return this.gateBlobs(frame, r, diff);
  }

  /** Threshold → components → shape/contrast gates over a diff image. */
  private gateBlobs(
    frame: VideoFrame,
    r: Roi,
    diff: Uint8Array,
  ): BallObservation[] {
    const threshold =
      this.diffThreshold === 'otsu'
        ? Math.max(8, otsuThreshold(diff))
        : this.diffThreshold;
    const binary = binarize(diff, threshold);
    const minArea = Math.max(
      2,
      Math.floor(Math.PI * this.minRadiusPx * this.minRadiusPx * 0.5),
    );
    const blobs = labelComponents(binary, r.w, r.h, minArea);

    const out: BallObservation[] = [];
    for (const blob of blobs) {
      const radius = Math.sqrt(blob.area / Math.PI);
      if (radius < this.minRadiusPx || radius > this.maxRadiusPx) continue;
      if (blob.circularity < this.minCircularity) continue;
      // Shape sanity beyond perimeter circularity (which is generous to
      // small axis-aligned rectangles): balls are near-square blobs that
      // fill ~π/4 of their bbox, unlike bars (aspect) or solid rects (fill).
      const long = Math.max(blob.bbox.w, blob.bbox.h);
      const short = Math.min(blob.bbox.w, blob.bbox.h);
      if (long / short > this.maxAspect) continue;
      const fill = blob.area / (blob.bbox.w * blob.bbox.h);
      if (fill < this.minFill || fill > this.maxFill) continue;

      // Mean diff over the blob's foreground pixels ≈ brightness above the
      // local background estimate.
      let contrastSum = 0;
      let contrastCount = 0;
      for (let y = blob.bbox.y; y < blob.bbox.y + blob.bbox.h; y++) {
        for (let x = blob.bbox.x; x < blob.bbox.x + blob.bbox.w; x++) {
          const idx = y * r.w + x;
          if (binary[idx] === 1) {
            contrastSum += diff[idx]!;
            contrastCount++;
          }
        }
      }
      const contrast = contrastCount > 0 ? contrastSum / contrastCount : 0;
      if (contrast < this.minContrast) continue;

      const circScore = Math.min(
        1,
        Math.max(
          0,
          (blob.circularity - this.minCircularity) / (1 - this.minCircularity),
        ),
      );
      const contrastScore = Math.min(1, contrast / 60);
      const confidence = 0.55 * circScore + 0.45 * contrastScore;

      out.push({
        frameIndex: frame.index,
        timestampMs: frame.timestampMs,
        cx: r.x + blob.cx,
        cy: r.y + blob.cy,
        radiusPx: radius,
        confidence,
      });
    }

    out.sort((a, b) => b.confidence - a.confidence);
    return out;
  }
}

/**
 * Fps-aware detector defaults. At normal capture rates (<= 60 fps) the ball's
 * late-flight image motion is a few px/frame, which a rolling short-window
 * background absorbs — use the frozen static background instead; and a
 * receding ball crosses backgrounds of both polarities within one flight
 * (brighter than trees, darker than sky), so prefer-bright-with-dark-fallback
 * replaces the fixed bright-only default; and by mid-flight the ball shrinks
 * to a ~1.5-2 px radius-equivalent blob, under the 2 px floor that is right
 * for slow-mo. High-fps slow-mo (120/240) keeps
 * the rolling default, where the short window is correct. Callers spread
 * this under their own options so explicit settings
 * win.
 */
export function detectorDefaultsForFps(
  captureFps: number,
): ClassicalDetectorOptions {
  return captureFps <= 60
    ? { backgroundMode: 'static', polarity: 'auto', minRadiusPx: 1 }
    : {};
}
