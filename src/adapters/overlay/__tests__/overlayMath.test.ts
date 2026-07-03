import {
  computeLetterbox,
  revealCount,
  videoToView,
  viewToVideo,
  type RotationDeg,
} from '../overlayMath';
import type { TrackPoint } from '../../../types/tracking';

describe('computeLetterbox', () => {
  it('letterboxes a landscape video in a portrait view (rotation 0)', () => {
    const m = computeLetterbox(1920, 1080, 0, 300, 600);
    expect(m.rect.width).toBeCloseTo(300);
    expect(m.rect.height).toBeCloseTo(168.75);
    expect(m.rect.x).toBeCloseTo(0);
    expect(m.rect.y).toBeCloseTo((600 - 168.75) / 2);
    expect(m.scale).toBeCloseTo(300 / 1920);
  });

  it('swaps display dimensions for 90/270 rotation', () => {
    const m = computeLetterbox(1920, 1080, 90, 300, 600);
    expect(m.displayWidth).toBe(1080);
    expect(m.displayHeight).toBe(1920);
    // Fit is width-limited: scale = 300/1080.
    expect(m.scale).toBeCloseTo(300 / 1080);
    expect(m.rect.height).toBeCloseTo(1920 * (300 / 1080));
  });

  it('pillarboxes when the view is wider than the video', () => {
    const m = computeLetterbox(1080, 1920, 0, 800, 400);
    expect(m.rect.height).toBeCloseTo(400);
    expect(m.rect.width).toBeCloseTo(225);
    expect(m.rect.x).toBeCloseTo((800 - 225) / 2);
  });

  it('handles degenerate video dimensions', () => {
    const m = computeLetterbox(0, 0, 0, 300, 600);
    expect(m.scale).toBe(0);
    expect(viewToVideo({ x: 10, y: 10 }, m)).toEqual({ x: 0, y: 0 });
  });
});

describe('videoToView / viewToVideo', () => {
  const rotations: RotationDeg[] = [0, 90, 180, 270];

  it.each(rotations)('round-trips points at rotation %d', (rot) => {
    const m = computeLetterbox(1920, 1080, rot, 360, 640);
    const samples = [
      { x: 0, y: 0 },
      { x: 1920, y: 1080 },
      { x: 960, y: 540 },
      { x: 123.5, y: 987.25 },
    ];
    for (const p of samples) {
      const v = videoToView(p, m);
      const back = viewToVideo(v, m);
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it('maps known corners for a 90° clockwise rotation', () => {
    // 100x50 video rotated 90cw displayed in an exactly-fitting 50x100 view.
    const m = computeLetterbox(100, 50, 90, 50, 100);
    expect(m.scale).toBeCloseTo(1);
    // Video top-left → display top-right.
    expect(videoToView({ x: 0, y: 0 }, m)).toEqual({ x: 50, y: 0 });
    // Video bottom-left → display top-left.
    expect(videoToView({ x: 0, y: 50 }, m)).toEqual({ x: 0, y: 0 });
    // Video top-right → display bottom-right.
    expect(videoToView({ x: 100, y: 0 }, m)).toEqual({ x: 50, y: 100 });
  });

  it('maps the center to the view center for 180°', () => {
    const m = computeLetterbox(1920, 1080, 180, 300, 600);
    const v = videoToView({ x: 960, y: 540 }, m);
    expect(v.x).toBeCloseTo(150);
    expect(v.y).toBeCloseTo(300);
  });
});

describe('revealCount', () => {
  const points: TrackPoint[] = [0, 10, 20, 30, 100].map((t) => ({
    timestampMs: t,
    x: t,
    y: t,
    interpolated: false,
  }));

  it('is timestamp-anchored, not index-anchored', () => {
    // At 50% of the time range (t=50), 4 of 5 points have passed.
    expect(revealCount(points, 0.5)).toBe(4);
    expect(revealCount(points, 0.05)).toBe(1);
    expect(revealCount(points, 0.31)).toBe(4);
  });

  it('clamps the ends', () => {
    expect(revealCount(points, 0)).toBe(0);
    expect(revealCount(points, -1)).toBe(0);
    expect(revealCount(points, 1)).toBe(5);
    expect(revealCount(points, 2)).toBe(5);
    expect(revealCount([], 0.5)).toBe(0);
  });

  it('is monotone in the fraction', () => {
    let prev = 0;
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const k = revealCount(points, f);
      expect(k).toBeGreaterThanOrEqual(prev);
      prev = k;
    }
  });

  it('shows at least one point once started', () => {
    expect(revealCount(points, 0.001)).toBe(1);
  });
});
