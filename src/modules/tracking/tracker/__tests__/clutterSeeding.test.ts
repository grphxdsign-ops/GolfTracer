/**
 * Field evidence #2: within ±0.3s of impact the launch area contains the
 * clubhead sweeping through, the tee tumbling right at ground level, the
 * ball's shadow drifting left, and background flicker. The stock single-ROI
 * tracker seeded on the clubhead (or the shadow). The fix under test: the
 * seed corridor derived from the user's ball tap sits ABOVE the tap, so the
 * tracker can only seed on the ball climbing the corridor.
 */
import { runTracking } from '../pipeline';
import { BallTracker } from '../tracker';
import {
  makeFrameSource,
  mulberry32,
  renderFrame,
  type DiscSpec,
  type RectSpec,
} from '../../testutils/syntheticFrames';
import type { VideoFrame } from '../../../../types/media';
import type { BallDetector, BallObservation } from '../../../../types/tracking';
import type { Roi } from '../../vision/imageOps';

jest.setTimeout(60000);

// Rendered at analysis resolution (1080x1920 portrait downsampled to width
// 480); the asset claims 2x native so the ballPoint tap exercises the
// native → analysis scaling.
const WIDTH = 480;
const HEIGHT = 853;
const NATIVE_SCALE = 2;
const FPS = 30;
const FRAME_MS = 1000 / FPS;
const PRE_IMPACT = 12;
const FLIGHT = 14;

/** Ball on the tee — where the user taps (analysis px). */
const TAP = { x: 240, y: 700 };

/** Ball truth at flight step t ≥ 1 (analysis px): straight up the corridor. */
function ballAt(t: number): { x: number; y: number } {
  return { x: TAP.x + 1.5 * t, y: TAP.y - 30 * t + 0.25 * t * t };
}

/** Tee blob tumbling rightward at ground level, decelerating. */
function teeAt(t: number): { x: number; y: number } {
  return { x: TAP.x + 6 + (8 * (1 - Math.pow(0.8, t))) / 0.2, y: TAP.y + 6 };
}

/** Ball shadow drifting left at ground level. */
function shadowAt(t: number): { x: number; y: number } {
  return { x: TAP.x - 10 - 3 * t, y: TAP.y + 8 };
}

/** Fixed corridor position that flickers ±25 luma on alternating frames. */
const FLICKER = { x: 190, y: 450 };
const FLICKER_BASE = 80; // ≈ gradient background at FLICKER

function makeClutterFrames(): VideoFrame[] {
  const rng = mulberry32(42);
  const frames: VideoFrame[] = [];
  for (let i = 0; i < PRE_IMPACT + FLIGHT; i++) {
    const t = i < PRE_IMPACT ? 0 : i - PRE_IMPACT + 1;
    const discs: DiscSpec[] = [];
    const rects: RectSpec[] = [];

    if (t === 0) {
      // Static pre-impact scene: ball sitting on the tee at the tap point.
      discs.push({ cx: TAP.x, cy: TAP.y, r: 4, luma: 235 });
    } else {
      const ball = ballAt(t);
      discs.push({ cx: ball.x, cy: ball.y, r: 4, luma: 235 });
      // Bright 40x12 clubhead sweeping through the tee box for 4 frames.
      if (t <= 4) {
        rects.push({ x: 185 + 20 * (t - 1), y: 690, w: 40, h: 12, luma: 250 });
      }
      // 8px-area tee blob tumbling rightward at ground level, decelerating.
      const tee = teeAt(t);
      discs.push({ cx: tee.x, cy: tee.y, r: 1.6, luma: 220 });
      // Dark shadow blob drifting left at ground level.
      const shadow = shadowAt(t);
      discs.push({ cx: shadow.x, cy: shadow.y, r: 3, luma: 20 });
      // 6x6 patch flickering ±25 luma at a fixed corridor position.
      rects.push({
        x: FLICKER.x,
        y: FLICKER.y,
        w: 6,
        h: 6,
        luma: t % 2 === 1 ? FLICKER_BASE + 25 : FLICKER_BASE - 25,
      });
    }

    frames.push(
      renderFrame({
        index: i,
        timestampMs: i * FRAME_MS,
        width: WIDTH,
        height: HEIGHT,
        discs,
        rects,
        noiseAmp: 2,
        rng,
      }),
    );
  }
  return frames;
}

describe('tap-derived seeding on a cluttered 30 fps launch (evidence #2)', () => {
  it('seeds on the ball in the corridor, never on ground-level clutter', async () => {
    const frames = makeClutterFrames();
    const source = makeFrameSource(frames, {
      width: WIDTH * NATIVE_SCALE,
      height: HEIGHT * NATIVE_SCALE,
    });
    const { track } = await runTracking(source, {
      // Native-pixel tap on the ball (2x the analysis coordinates).
      ballPoint: { x: TAP.x * NATIVE_SCALE, y: TAP.y * NATIVE_SCALE },
      detectorOptions: { backgroundMode: 'static' },
      // Frozen clock: seeding behavior must not depend on machine speed.
      clock: () => 0,
    });

    expect(track.quality).not.toBe('failed');
    expect(track.observations.length).toBeGreaterThanOrEqual(5);

    // First observation is the ball (compared in analysis px).
    const first = track.observations[0]!;
    const firstT = first.frameIndex - PRE_IMPACT + 1;
    expect(firstT).toBeGreaterThanOrEqual(1);
    const truth = ballAt(firstT);
    expect(
      Math.hypot(
        first.cx / NATIVE_SCALE - truth.x,
        first.cy / NATIVE_SCALE - truth.y,
      ),
    ).toBeLessThanOrEqual(6);

    // No accepted observation is ever near the tee, the flicker patch, or
    // the shadow (all in analysis px).
    for (const o of track.observations) {
      const t = o.frameIndex - PRE_IMPACT + 1;
      const cx = o.cx / NATIVE_SCALE;
      const cy = o.cy / NATIVE_SCALE;
      const tee = teeAt(Math.max(1, t));
      const shadow = shadowAt(Math.max(1, t));
      expect(Math.hypot(cx - tee.x, cy - tee.y)).toBeGreaterThan(10);
      expect(Math.hypot(cx - shadow.x, cy - shadow.y)).toBeGreaterThan(10);
      expect(
        Math.hypot(cx - (FLICKER.x + 3), cy - (FLICKER.y + 3)),
      ).toBeGreaterThan(10);
    }
  });
});

describe('BallTracker seedRoi gating (scripted detector)', () => {
  const FRAME = (index: number): VideoFrame => ({
    index,
    timestampMs: index * FRAME_MS,
    width: WIDTH,
    height: HEIGHT,
    luma: new Uint8Array(1),
  });

  const obs = (
    frameIndex: number,
    x: number,
    y: number,
    confidence: number,
  ): BallObservation => ({
    frameIndex,
    timestampMs: frameIndex * FRAME_MS,
    cx: x,
    cy: y,
    radiusPx: 4,
    confidence,
  });

  class ScriptedDetector implements BallDetector {
    constructor(private readonly script: Map<number, BallObservation[]>) {}
    async detect(frame: VideoFrame, roi?: Roi): Promise<BallObservation[]> {
      const all = this.script.get(frame.index) ?? [];
      if (!roi) return all;
      return all.filter(
        (o) =>
          o.cx >= roi.x &&
          o.cx < roi.x + roi.w &&
          o.cy >= roi.y &&
          o.cy < roi.y + roi.h,
      );
    }
  }

  // Tee box (launch ROI) and corridor (seed ROI), deliberately disjoint in y.
  const LAUNCH_ROI: Roi = { x: 200, y: 660, w: 80, h: 80 };
  const SEED_ROI: Roi = { x: 150, y: 230, w: 175, h: 446 };

  /** High-confidence clubhead decoy in the tee box + real ball in the corridor. */
  function script(): Map<number, BallObservation[]> {
    const map = new Map<number, BallObservation[]>();
    for (let i = 0; i <= 10; i++) {
      map.set(i, [
        obs(i, 240, 700, 0.95), // decoy: inside launchRoi, below the corridor
        obs(i, 240, 600 - 25 * i, 0.5), // ball climbing the corridor
      ]);
    }
    return map;
  }

  it('trySeed is gated by seedRoi, not launchRoi', async () => {
    const tracker = new BallTracker(new ScriptedDetector(script()), {
      launchRoi: LAUNCH_ROI,
      seedRoi: SEED_ROI,
    });
    for (let i = 0; i <= 10; i++) {
      await tracker.step(FRAME(i));
    }
    const seed = tracker.observations[0]!;
    expect(seed.cy).toBe(600); // ball, despite the decoy's higher confidence
    expect(tracker.state).toBe('confirmed');
  });

  it('falls back to launchRoi when no seedRoi is given', async () => {
    const tracker = new BallTracker(new ScriptedDetector(script()), {
      launchRoi: LAUNCH_ROI,
    });
    await tracker.step(FRAME(0));
    expect(tracker.observations[0]!.cy).toBe(700); // the decoy wins
  });
});
