/**
 * SyntheticFrameSource — a full pure-TypeScript FrameSource that procedurally
 * renders grayscale frames: a configurable vertical background gradient plus
 * a moving bright disc following a supplied (t) -> (x, y, r) path.
 *
 * This is the test workhorse for the whole pipeline (capture, tracking,
 * distance all exercise it) and is exported for other modules' demos.
 */
import type {
  FrameRange,
  FrameSource,
  VideoAsset,
  VideoFrame,
} from '../../types/media';

export interface DiscState {
  /** Disc centre x in pixels (at the source's native resolution). */
  x: number;
  /** Disc centre y in pixels (at the source's native resolution). */
  y: number;
  /** Disc radius in pixels (at the source's native resolution). */
  r: number;
}

/**
 * Disc trajectory: media timestamp (ms) → disc state, or null when the disc
 * is not visible in that frame.
 */
export type DiscPath = (timestampMs: number) => DiscState | null;

export interface SyntheticFrameSourceOptions {
  width?: number;
  height?: number;
  fps?: number;
  durationMs?: number;
  /** Background luma at the top row (sky). */
  gradientTopLuma?: number;
  /** Background luma at the bottom row (ground). */
  gradientBottomLuma?: number;
  /** Luma of the disc (the "ball"). */
  discLuma?: number;
  discPath?: DiscPath;
  /** Overrides merged onto the generated VideoAsset. */
  asset?: Partial<VideoAsset>;
}

const clampLuma = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

export class SyntheticFrameSource implements FrameSource {
  readonly asset: VideoAsset;
  readonly frameCount: number;

  private readonly width: number;
  private readonly height: number;
  private readonly fps: number;
  private readonly topLuma: number;
  private readonly bottomLuma: number;
  private readonly discLuma: number;
  private readonly discPath: DiscPath | null;

  constructor(options: SyntheticFrameSourceOptions = {}) {
    this.width = options.width ?? 160;
    this.height = options.height ?? 120;
    this.fps = options.fps ?? 30;
    this.topLuma = clampLuma(options.gradientTopLuma ?? 40);
    this.bottomLuma = clampLuma(options.gradientBottomLuma ?? 120);
    this.discLuma = clampLuma(options.discLuma ?? 250);
    this.discPath = options.discPath ?? null;
    const durationMs = options.durationMs ?? 1000;
    this.frameCount = Math.max(1, Math.round((durationMs * this.fps) / 1000));
    this.asset = {
      id: 'synthetic',
      uri: 'synthetic://frame-source',
      width: this.width,
      height: this.height,
      fps: this.fps,
      durationMs,
      rotationDeg: 0,
      isSlowMotion: false,
      source: 'imported',
      createdAt: 0,
      ...options.asset,
    };
  }

  /** Media timestamp of frame `index`. */
  timestampOf(index: number): number {
    return (index * 1000) / this.fps;
  }

  async *frames(range?: FrameRange): AsyncIterable<VideoFrame> {
    const startMs = range?.startMs ?? 0;
    const endMs = range?.endMs ?? Number.POSITIVE_INFINITY;
    const stride = Math.max(1, Math.floor(range?.stride ?? 1));
    // First frame whose timestamp is >= startMs (with float tolerance).
    const firstIndex = Math.max(0, Math.ceil((startMs * this.fps) / 1000 - 1e-6));
    for (let i = firstIndex; i < this.frameCount; i += stride) {
      const t = this.timestampOf(i);
      if (t > endMs + 1e-6) {
        break;
      }
      yield this.renderFrame(i, range?.targetWidth);
    }
  }

  async frameAt(timestampMs: number, targetWidth?: number): Promise<VideoFrame> {
    const index = Math.max(
      0,
      Math.min(this.frameCount - 1, Math.round((timestampMs * this.fps) / 1000)),
    );
    return this.renderFrame(index, targetWidth);
  }

  private renderFrame(index: number, targetWidth?: number): VideoFrame {
    const scale =
      targetWidth !== undefined && targetWidth > 0 ? targetWidth / this.width : 1;
    const w = Math.max(1, Math.round(this.width * scale));
    const h = Math.max(1, Math.round(this.height * scale));
    const luma = new Uint8Array(w * h);

    for (let y = 0; y < h; y += 1) {
      const frac = h > 1 ? y / (h - 1) : 0;
      const value = clampLuma(this.topLuma + (this.bottomLuma - this.topLuma) * frac);
      luma.fill(value, y * w, (y + 1) * w);
    }

    const timestampMs = this.timestampOf(index);
    const disc = this.discPath?.(timestampMs) ?? null;
    if (disc !== null && disc.r > 0) {
      const cx = disc.x * scale;
      const cy = disc.y * scale;
      const r = disc.r * scale;
      const minY = Math.max(0, Math.floor(cy - r));
      const maxY = Math.min(h - 1, Math.ceil(cy + r));
      const minX = Math.max(0, Math.floor(cx - r));
      const maxX = Math.min(w - 1, Math.ceil(cx + r));
      const r2 = r * r;
      for (let y = minY; y <= maxY; y += 1) {
        const dy = y - cy;
        for (let x = minX; x <= maxX; x += 1) {
          const dx = x - cx;
          if (dx * dx + dy * dy <= r2) {
            luma[y * w + x] = this.discLuma;
          }
        }
      }
    }

    return { index, timestampMs, width: w, height: h, luma };
  }
}
