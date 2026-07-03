import {
  associateGlobally,
  fallbackSearchRoi,
} from '../globalAssociation';
import type { VideoFrame } from '../../../../types/media';
import type {
  BallDetector,
  BallObservation,
} from '../../../../types/tracking';

/** Bare frames — the scripted detector below never reads pixels. */
function frame(i: number): VideoFrame {
  return {
    index: i,
    timestampMs: i * 33.3,
    width: 480,
    height: 853,
    luma: new Uint8Array(0),
  };
}

function obs(
  frameIndex: number,
  cx: number,
  cy: number,
  confidence = 0.7,
): BallObservation {
  return {
    frameIndex,
    timestampMs: frameIndex * 33.3,
    cx,
    cy,
    radiusPx: 2,
    confidence,
  };
}

/** Detector returning pre-scripted candidates per frame index. */
function scripted(byFrame: Record<number, BallObservation[]>): BallDetector {
  return {
    detect: async (f: VideoFrame) => byFrame[f.index] ?? [],
  };
}

const ROI = { x: 0, y: 0, w: 480, h: 853 };

describe('associateGlobally', () => {
  // The measured real-clip menagerie, in miniature: a decelerating climbing
  // ball, a static scene-change blob (divot hole), an erratic debris chain,
  // and a late-starting body-motion chain. Only the ball satisfies all four
  // priors (moves, climbs, decelerates, starts near impact).
  const ballTruth: [number, number, number][] = [
    [2, 300, 700], [3, 280, 610], [4, 265, 540], [5, 254, 485],
    [6, 246, 442], [7, 240, 408], [8, 236, 381], [9, 233, 360],
  ];

  function menagerie(): Record<number, BallObservation[]> {
    const byFrame: Record<number, BallObservation[]> = {};
    for (let i = 0; i < 20; i++) byFrame[i] = [];
    for (const [f, x, y] of ballTruth) byFrame[f]!.push(obs(f, x, y, 0.6));
    // Static divot hole: identical position every frame, high confidence.
    for (let i = 0; i < 20; i++) byFrame[i]!.push(obs(i, 180, 780, 0.95));
    // Erratic debris: speeds jump up and down (fails deceleration).
    const debris: [number, number, number][] = [
      [1, 350, 750], [2, 330, 680], [3, 325, 660], [4, 290, 560], [5, 288, 540],
    ];
    for (const [f, x, y] of debris) byFrame[f]!.push(obs(f, x, y, 0.9));
    // Late body motion: coherent climb but starts frame 14.
    for (let i = 14; i < 20; i++) {
      byFrame[i]!.push(obs(i, 120, 700 - (i - 14) * 20, 0.85));
    }
    return byFrame;
  }

  it('returns the decelerating ball chain, not the confusers', async () => {
    const chain = await associateGlobally(
      Array.from({ length: 20 }, (_, i) => frame(i)),
      scripted(menagerie()),
      { searchRoi: ROI },
    );
    expect(chain.length).toBeGreaterThanOrEqual(7);
    for (const o of chain.slice(-7)) {
      const truth = ballTruth.find(([f]) => f === o.frameIndex);
      expect(truth).toBeDefined();
      expect(Math.hypot(o.cx - truth![1], o.cy - truth![2])).toBeLessThan(1);
    }
  });

  it('rides through single-frame detection gaps', async () => {
    const byFrame = menagerie();
    // Ball invisible on frame 5 (the polarity-transition frame on the
    // real clip): the chain must bridge it.
    byFrame[5] = byFrame[5]!.filter((o) => o.cx !== 254);
    const chain = await associateGlobally(
      Array.from({ length: 20 }, (_, i) => frame(i)),
      scripted(byFrame),
      { searchRoi: ROI },
    );
    expect(chain.length).toBeGreaterThanOrEqual(6);
    expect(chain.some((o) => o.frameIndex === 4)).toBe(true);
    expect(chain.some((o) => o.frameIndex === 6)).toBe(true);
  });

  it('returns nothing when no chain reaches minChain', async () => {
    const byFrame: Record<number, BallObservation[]> = {};
    for (let i = 0; i < 12; i++) byFrame[i] = [obs(i, 180, 780, 0.9)]; // static only
    byFrame[3]!.push(obs(3, 300, 600, 0.8));
    byFrame[4]!.push(obs(4, 290, 560, 0.8));
    const chain = await associateGlobally(
      Array.from({ length: 12 }, (_, i) => frame(i)),
      scripted(byFrame),
      { searchRoi: ROI },
    );
    expect(chain).toEqual([]);
  });

  it('rejects chains that start long after impact', async () => {
    const byFrame: Record<number, BallObservation[]> = {};
    for (let i = 0; i < 26; i++) byFrame[i] = [];
    // A perfectly ball-like chain, but starting at frame 16.
    for (let i = 16; i < 25; i++) {
      byFrame[i]!.push(obs(i, 300 - (i - 16) * 8, 700 - (i - 16) * 30, 0.8));
    }
    const chain = await associateGlobally(
      Array.from({ length: 26 }, (_, i) => frame(i)),
      scripted(byFrame),
      { searchRoi: ROI },
    );
    expect(chain).toEqual([]);
  });
});

describe('fallbackSearchRoi', () => {
  it('widens the corridor and extends it to the top of the frame', () => {
    const seed = { x: 200, y: 300, w: 100, h: 400 };
    const out = fallbackSearchRoi(seed, 480, 853);
    expect(out.y).toBe(0);
    expect(out.x).toBeLessThan(seed.x);
    expect(out.x + out.w).toBeGreaterThan(seed.x + seed.w);
    expect(out.h).toBe(seed.y + seed.h);
  });

  it('clamps to the frame', () => {
    const out = fallbackSearchRoi({ x: 10, y: 100, w: 460, h: 700 }, 480, 853);
    expect(out.x).toBeGreaterThanOrEqual(0);
    expect(out.x + out.w).toBeLessThanOrEqual(480);
  });
});
