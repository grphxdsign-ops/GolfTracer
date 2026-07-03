/**
 * Synthetic frame generation for tracking tests: renders anti-aliased discs
 * (and optional rectangles) over a luma gradient with deterministic temporal
 * noise, along a parametric parabola. Deliberately independent of the
 * capture workstream's fixtures to avoid cross-workstream coupling.
 */
import type { FrameSource, VideoAsset, VideoFrame } from '../../../types/media';

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DiscSpec {
  cx: number;
  cy: number;
  r: number;
  luma: number;
}

export interface RectSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  luma: number;
}

export interface RenderOptions {
  index: number;
  timestampMs: number;
  width: number;
  height: number;
  discs?: DiscSpec[];
  rects?: RectSpec[];
  noiseAmp?: number;
  rng?: () => number;
}

const gradientCache = new Map<string, Uint8Array>();

/** Sky-to-grass style gradient background, cached per size. */
function gradientFor(width: number, height: number): Uint8Array {
  const key = `${width}x${height}`;
  const cached = gradientCache.get(key);
  if (cached) return cached;
  const base = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      base[y * width + x] = Math.round(40 + (60 * y) / height + (20 * x) / width);
    }
  }
  gradientCache.set(key, base);
  return base;
}

/** Render one grayscale frame: gradient background + shapes + noise. */
export function renderFrame(options: RenderOptions): VideoFrame {
  const { index, timestampMs, width, height } = options;
  const discs = options.discs ?? [];
  const rects = options.rects ?? [];
  const noiseAmp = options.noiseAmp ?? 0;
  const rng = options.rng ?? (() => 0.5);
  const luma = gradientFor(width, height).slice();

  if (noiseAmp > 0) {
    for (let i = 0; i < luma.length; i++) {
      // Background values stay in [0, 255]; Uint8Array assignment truncates,
      // so +0.5 rounds.
      luma[i] = luma[i]! + (rng() * 2 - 1) * noiseAmp + 0.5;
    }
  }

  for (const rect of rects) {
    const x0 = Math.max(0, Math.round(rect.x));
    const y0 = Math.max(0, Math.round(rect.y));
    const x1 = Math.min(width, Math.round(rect.x + rect.w));
    const y1 = Math.min(height, Math.round(rect.y + rect.h));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        luma[y * width + x] = rect.luma;
      }
    }
  }

  for (const disc of discs) {
    const x0 = Math.max(0, Math.floor(disc.cx - disc.r - 1));
    const y0 = Math.max(0, Math.floor(disc.cy - disc.r - 1));
    const x1 = Math.min(width - 1, Math.ceil(disc.cx + disc.r + 1));
    const y1 = Math.min(height - 1, Math.ceil(disc.cy + disc.r + 1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - disc.cx;
        const dy = y - disc.cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= disc.r - 0.5) {
          luma[y * width + x] = disc.luma;
        } else if (d < disc.r + 0.5) {
          // 1px anti-aliased edge.
          const cover = disc.r + 0.5 - d;
          const idx = y * width + x;
          luma[idx] = Math.round(
            luma[idx]! * (1 - cover) + disc.luma * cover,
          );
        }
      }
    }
  }

  return { index, timestampMs, width, height, luma };
}

export interface FlightSpec {
  width: number;
  height: number;
  fps: number;
  /** Static frames before the ball starts moving. */
  preImpactFrames: number;
  /** Frames of ball flight after impact. */
  flightFrames: number;
  launch: { x: number; y: number };
  /** Launch velocity in px/frame; vy is positive UP (screen y decreases). */
  velocity: { vx: number; vy: number };
  /** Gravity in px/frame² (screen-down). */
  gravity: number;
  radius: number;
  ballLuma: number;
  noiseAmp: number;
  seed: number;
  /** Flight frames (1-based step index) on which the ball is hidden. */
  occludedSteps?: number[];
}

export interface TruthPoint {
  frameIndex: number;
  timestampMs: number;
  x: number;
  y: number;
}

export interface SyntheticFlight {
  frames: VideoFrame[];
  /** Ground-truth ball centers for every post-impact frame. */
  truth: TruthPoint[];
  /** Index (into frames) of the first frame where the ball has moved. */
  impactIndex: number;
  spec: FlightSpec;
}

export const DEFAULT_FLIGHT_SPEC: FlightSpec = {
  width: 480,
  height: 270,
  fps: 120,
  preImpactFrames: 12,
  flightFrames: 60,
  launch: { x: 130, y: 225 },
  velocity: { vx: 5.5, vy: 13.2 },
  gravity: 0.46,
  radius: 5,
  ballLuma: 235,
  noiseAmp: 2,
  seed: 1234,
};

/** Ball center at flight step t (t=0 is the ball still on the tee). */
export function flightPosition(
  spec: FlightSpec,
  t: number,
): { x: number; y: number } {
  return {
    x: spec.launch.x + spec.velocity.vx * t,
    y: spec.launch.y - spec.velocity.vy * t + 0.5 * spec.gravity * t * t,
  };
}

export function makeFlight(
  overrides: Partial<FlightSpec> = {},
): SyntheticFlight {
  const spec: FlightSpec = { ...DEFAULT_FLIGHT_SPEC, ...overrides };
  const rng = mulberry32(spec.seed);
  const frameMs = 1000 / spec.fps;
  const frames: VideoFrame[] = [];
  const truth: TruthPoint[] = [];
  const occluded = new Set(spec.occludedSteps ?? []);
  const total = spec.preImpactFrames + spec.flightFrames;

  for (let i = 0; i < total; i++) {
    const timestampMs = i * frameMs;
    // Step 0 during pre-impact; the ball first moves on frame preImpactFrames.
    const t = i < spec.preImpactFrames ? 0 : i - spec.preImpactFrames + 1;
    const pos = flightPosition(spec, t);
    const hidden = t > 0 && occluded.has(t);
    frames.push(
      renderFrame({
        index: i,
        timestampMs,
        width: spec.width,
        height: spec.height,
        discs: hidden
          ? []
          : [{ cx: pos.x, cy: pos.y, r: spec.radius, luma: spec.ballLuma }],
        noiseAmp: spec.noiseAmp,
        rng,
      }),
    );
    if (t > 0) {
      truth.push({ frameIndex: i, timestampMs, x: pos.x, y: pos.y });
    }
  }

  return { frames, truth, impactIndex: spec.preImpactFrames, spec };
}

/** Wrap pre-rendered frames in the FrameSource contract. */
export function makeFrameSource(
  frames: VideoFrame[],
  assetOverrides: Partial<VideoAsset> = {},
): FrameSource {
  const first = frames[0];
  const last = frames[frames.length - 1];
  const fps =
    frames.length >= 2
      ? 1000 / (frames[1]!.timestampMs - frames[0]!.timestampMs)
      : 30;
  const asset: VideoAsset = {
    id: 'synthetic-flight',
    uri: 'memory://synthetic-flight',
    width: first?.width ?? 0,
    height: first?.height ?? 0,
    fps,
    durationMs: last ? last.timestampMs + 1000 / fps : 0,
    rotationDeg: 0,
    isSlowMotion: false,
    source: 'imported',
    createdAt: 0,
    ...assetOverrides,
  };
  return {
    asset,
    async *frames() {
      for (const frame of frames) {
        yield frame;
      }
    },
    async frameAt(timestampMs: number) {
      let best = frames[0];
      if (!best) throw new Error('no frames');
      for (const f of frames) {
        if (
          Math.abs(f.timestampMs - timestampMs) <
          Math.abs(best.timestampMs - timestampMs)
        ) {
          best = f;
        }
      }
      return best;
    },
  };
}
