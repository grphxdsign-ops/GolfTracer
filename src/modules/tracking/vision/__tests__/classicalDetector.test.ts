import { ClassicalBallDetector } from '../classicalDetector';
import { TfliteBallDetector } from '../tfliteDetector';
import { createDetector } from '../../../../adapters/detector';
import { makeFlight, mulberry32, renderFrame } from '../../testutils/syntheticFrames';

describe('ClassicalBallDetector', () => {
  it('returns nothing until the background history is warm', async () => {
    const flight = makeFlight({ flightFrames: 10 });
    const detector = new ClassicalBallDetector();
    const first = await detector.detect(flight.frames[0]!);
    expect(first).toEqual([]);
  });

  it('detects a moving ball near ground truth on a gradient background', async () => {
    const flight = makeFlight({ flightFrames: 14 });
    const detector = new ClassicalBallDetector();
    const errors: number[] = [];
    for (const frame of flight.frames) {
      const obs = await detector.detect(frame);
      const truth = flight.truth.find((t) => t.frameIndex === frame.index);
      // Only judge frames a few steps after impact (ball clear of the tee
      // ghost and background fully warm).
      if (!truth || truth.frameIndex < flight.impactIndex + 2) continue;
      expect(obs.length).toBeGreaterThan(0);
      const best = obs[0]!;
      errors.push(Math.hypot(best.cx - truth.x, best.cy - truth.y));
      expect(best.radiusPx).toBeGreaterThan(2.5);
      expect(best.radiusPx).toBeLessThan(9);
      expect(best.confidence).toBeGreaterThan(0.3);
      expect(best.frameIndex).toBe(frame.index);
      expect(best.timestampMs).toBe(frame.timestampMs);
    }
    expect(errors.length).toBeGreaterThanOrEqual(10);
    for (const e of errors) expect(e).toBeLessThan(2);
  });

  it('does not fire on a static scene', async () => {
    const flight = makeFlight({ flightFrames: 0, preImpactFrames: 10 });
    const detector = new ClassicalBallDetector();
    for (const frame of flight.frames) {
      const obs = await detector.detect(frame);
      expect(obs).toEqual([]);
    }
  });

  it('rejects an elongated moving bar (low circularity)', async () => {
    const rng = mulberry32(42);
    const detector = new ClassicalBallDetector();
    for (let i = 0; i < 12; i++) {
      const frame = renderFrame({
        index: i,
        timestampMs: i * 10,
        width: 240,
        height: 160,
        rects: [{ x: 30 + i * 9, y: 60, w: 26, h: 3, luma: 235 }],
        noiseAmp: 2,
        rng,
      });
      const obs = await detector.detect(frame);
      expect(obs).toEqual([]);
    }
  });

  it('honors the ROI argument and offsets results back to frame coords', async () => {
    const flight = makeFlight({ flightFrames: 12 });
    const detector = new ClassicalBallDetector();
    const lastIdx = flight.frames.length - 1;
    for (let i = 0; i < lastIdx; i++) {
      await detector.detect(flight.frames[i]!);
    }
    const truth = flight.truth[flight.truth.length - 1]!;
    const roi = { x: truth.x - 30, y: truth.y - 30, w: 60, h: 60 };
    const obs = await detector.detect(flight.frames[lastIdx]!, roi);
    expect(obs.length).toBeGreaterThan(0);
    expect(Math.hypot(obs[0]!.cx - truth.x, obs[0]!.cy - truth.y)).toBeLessThan(2);

    // A far-away ROI must see nothing.
    detector.reset();
    for (let i = 0; i < lastIdx; i++) {
      await detector.detect(flight.frames[i]!);
    }
    const empty = await detector.detect(flight.frames[lastIdx]!, {
      x: 5,
      y: 5,
      w: 50,
      h: 50,
    });
    expect(empty).toEqual([]);
  });
});

describe('TfliteBallDetector stub', () => {
  it('rejects with a device-runtime error', async () => {
    const detector = new TfliteBallDetector();
    const frame = renderFrame({
      index: 0,
      timestampMs: 0,
      width: 8,
      height: 8,
    });
    await expect(detector.detect(frame)).rejects.toThrow('device runtime');
  });
});

describe('createDetector factory', () => {
  it('creates detectors by kind', () => {
    expect(createDetector()).toBeInstanceOf(ClassicalBallDetector);
    expect(createDetector('classical')).toBeInstanceOf(ClassicalBallDetector);
    expect(createDetector('tflite')).toBeInstanceOf(TfliteBallDetector);
  });
});
