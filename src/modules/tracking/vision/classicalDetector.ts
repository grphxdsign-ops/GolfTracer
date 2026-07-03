/**
 * Classical (non-ML) golf-ball proposal detector.
 *
 * Pipeline per frame: rolling-median background estimate (a MOG2-lite that a
 * handful of frames is enough to warm) → difference vs background → binary
 * threshold → 4-connected components → candidate scoring by circularity,
 * size, and contrast over the local background.
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

export interface ClassicalDetectorOptions {
  /** Frames kept for the rolling-median background. Default 5. */
  historySize?: number;
  /** Frames required before detection starts. Default 3. */
  minHistory?: number;
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
   */
  polarity?: 'bright' | 'both';
}

interface HistoryFrame {
  luma: Uint8Array;
  width: number;
  height: number;
}

export class ClassicalBallDetector implements BallDetector {
  private readonly historySize: number;
  private readonly minHistory: number;
  private readonly diffThreshold: number | 'otsu';
  private readonly minCircularity: number;
  private readonly minRadiusPx: number;
  private readonly maxRadiusPx: number;
  private readonly minContrast: number;
  private readonly maxAspect: number;
  private readonly minFill: number;
  private readonly maxFill: number;
  private readonly polarity: 'bright' | 'both';
  private history: HistoryFrame[] = [];

  constructor(options: ClassicalDetectorOptions = {}) {
    this.historySize = options.historySize ?? 5;
    this.minHistory = options.minHistory ?? 3;
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

    const usable = this.history.filter(
      (h) => h.width === frame.width && h.height === frame.height,
    );

    let observations: BallObservation[] = [];
    if (usable.length >= this.minHistory) {
      observations = this.detectInRoi(frame, r, usable);
    }

    this.pushHistory(frame);
    return observations;
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

  private detectInRoi(
    frame: VideoFrame,
    r: Roi,
    history: HistoryFrame[],
  ): BallObservation[] {
    // Per-pixel rolling median background, computed only for the ROI.
    const background = new Uint8Array(r.w * r.h);
    const samples = new Array<number>(history.length);
    for (let y = 0; y < r.h; y++) {
      const srcRow = (r.y + y) * frame.width + r.x;
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

    const current = extractRoi(frame.luma, frame.width, r);
    const diff =
      this.polarity === 'bright'
        ? positiveDiff(current, background)
        : absDiff(current, background);

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
