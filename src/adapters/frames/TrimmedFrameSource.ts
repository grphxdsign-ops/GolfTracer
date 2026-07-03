/**
 * TrimmedFrameSource — wraps another FrameSource so that all frame requests
 * are clamped into a trim window chosen on the Review screen.
 *
 * Timestamps stay in the *original* media time-base (no re-zeroing), so the
 * asset metadata — including rotationDeg and slow-motion fps fields — passes
 * through unchanged and downstream physics never sees a shifted clock.
 */
import type {
  FrameRange,
  FrameSource,
  VideoAsset,
  VideoFrame,
} from '../../types/media';

export interface TrimWindowMs {
  startMs: number;
  endMs: number;
}

export class TrimmedFrameSource implements FrameSource {
  constructor(
    private readonly inner: FrameSource,
    readonly window: TrimWindowMs,
  ) {}

  get asset(): VideoAsset {
    return this.inner.asset;
  }

  frames(range?: FrameRange): AsyncIterable<VideoFrame> {
    const startMs = Math.max(range?.startMs ?? this.window.startMs, this.window.startMs);
    const endMs = Math.min(range?.endMs ?? this.window.endMs, this.window.endMs);
    return this.inner.frames({
      startMs,
      endMs,
      stride: range?.stride,
      targetWidth: range?.targetWidth,
    });
  }

  frameAt(timestampMs: number, targetWidth?: number): Promise<VideoFrame> {
    const clamped = Math.max(
      this.window.startMs,
      Math.min(this.window.endMs, timestampMs),
    );
    return this.inner.frameAt(clamped, targetWidth);
  }
}
