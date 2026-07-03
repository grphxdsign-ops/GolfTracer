import { BallTracker } from '../tracker';
import type { VideoFrame } from '../../../../types/media';
import type { BallDetector, BallObservation } from '../../../../types/tracking';
import type { Roi } from '../../vision/imageOps';

const WIDTH = 480;
const HEIGHT = 270;
const FPS = 120;
const FRAME_MS = 1000 / FPS;

/** Cheap frame stub — scripted detectors never read pixels. */
function frameAt(index: number): VideoFrame {
  return {
    index,
    timestampMs: index * FRAME_MS,
    width: WIDTH,
    height: HEIGHT,
    luma: new Uint8Array(1),
  };
}

/** Ballistic truth in px: launch (130, 225), gravity screen-down. */
function truthAt(step: number): { x: number; y: number } {
  return {
    x: 130 + 5.5 * step,
    y: 225 - 13.2 * step + 0.5 * 0.46 * step * step,
  };
}

function obs(
  frameIndex: number,
  x: number,
  y: number,
  confidence = 0.6,
): BallObservation {
  return {
    frameIndex,
    timestampMs: frameIndex * FRAME_MS,
    cx: x,
    cy: y,
    radiusPx: 5,
    confidence,
  };
}

/** Detector that replays a script, honoring the ROI restriction. */
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

const LAUNCH_ROI: Roi = { x: 100, y: 190, w: 70, h: 60 };

function flightScript(
  steps: number,
  options: {
    missedSteps?: Set<number>;
    decoy?: (step: number) => BallObservation | null;
  } = {},
): Map<number, BallObservation[]> {
  const script = new Map<number, BallObservation[]>();
  for (let step = 0; step <= steps; step++) {
    const frameIndex = step;
    const entries: BallObservation[] = [];
    if (!options.missedSteps?.has(step)) {
      const t = truthAt(step);
      entries.push(obs(frameIndex, t.x, t.y));
    }
    const decoy = options.decoy?.(step);
    if (decoy) entries.push(decoy);
    script.set(frameIndex, entries);
  }
  return script;
}

async function runSteps(tracker: BallTracker, count: number): Promise<void> {
  for (let i = 0; i <= count; i++) {
    await tracker.step(frameAt(i));
    if (!tracker.isActive) break;
  }
}

describe('BallTracker', () => {
  it('seeds in the launch ROI, confirms after 3 hits, and follows the ball', async () => {
    const tracker = new BallTracker(new ScriptedDetector(flightScript(40)), {
      launchRoi: LAUNCH_ROI,
    });
    await runSteps(tracker, 40);
    expect(tracker.observations.length).toBeGreaterThanOrEqual(38);
    expect(['confirmed', 'landed']).toContain(tracker.state);
    for (const o of tracker.observations) {
      const t = truthAt(o.frameIndex);
      expect(Math.hypot(o.cx - t.x, o.cy - t.y)).toBeLessThan(1e-6);
    }
    // Filtered points stay close to truth after convergence.
    for (const p of tracker.points.slice(5)) {
      const step = Math.round(p.timestampMs / FRAME_MS);
      const t = truthAt(step);
      expect(Math.hypot(p.x - t.x, p.y - t.y)).toBeLessThan(3);
    }
  });

  it('rejects a persistent decoy outside the Mahalanobis gate', async () => {
    // Decoy 40px off the true trajectory with juicy confidence, present on
    // every frame after confirmation (kept away from the launch ROI so the
    // seed is unambiguous).
    const script = flightScript(40, {
      decoy: (step) =>
        step >= 3
          ? obs(step, truthAt(step).x + 40, truthAt(step).y - 28, 0.95)
          : null,
    });
    const tracker = new BallTracker(new ScriptedDetector(script), {
      launchRoi: LAUNCH_ROI,
    });
    await runSteps(tracker, 40);
    expect(tracker.observations.length).toBeGreaterThanOrEqual(35);
    for (const o of tracker.observations) {
      const t = truthAt(o.frameIndex);
      // Every accepted observation is the true ball, never the decoy.
      expect(Math.hypot(o.cx - t.x, o.cy - t.y)).toBeLessThan(2);
    }
  });

  it('coasts through a 5-frame occlusion with interpolated points', async () => {
    const missed = new Set([15, 16, 17, 18, 19]);
    const tracker = new BallTracker(
      new ScriptedDetector(flightScript(40, { missedSteps: missed })),
      { launchRoi: LAUNCH_ROI },
    );
    await runSteps(tracker, 40);
    expect(['confirmed', 'landed']).toContain(tracker.state);
    const interpolated = tracker.points.filter((p) => p.interpolated);
    expect(interpolated).toHaveLength(5);
    for (const p of interpolated) {
      const step = Math.round(p.timestampMs / FRAME_MS);
      const t = truthAt(step);
      expect(Math.hypot(p.x - t.x, p.y - t.y)).toBeLessThan(6);
    }
    // Re-acquired after the gap.
    const lastObs = tracker.observations[tracker.observations.length - 1]!;
    expect(lastObs.frameIndex).toBeGreaterThan(19);
  });

  it('declares the track lost after more than 8 consecutive misses and trims coasted tail', async () => {
    const missed = new Set<number>();
    for (let s = 12; s <= 40; s++) missed.add(s);
    const tracker = new BallTracker(
      new ScriptedDetector(flightScript(40, { missedSteps: missed })),
      { launchRoi: LAUNCH_ROI },
    );
    await runSteps(tracker, 40);
    expect(tracker.state).toBe('lost');
    // Coasted (interpolated) tail is trimmed: last point = last observation.
    expect(tracker.points[tracker.points.length - 1]!.interpolated).toBe(false);
    expect(tracker.observations[tracker.observations.length - 1]!.frameIndex).toBe(11);
  });

  it('drops a tentative track that misses before confirmation and reseeds later', async () => {
    // Ball appears for one frame, vanishes for one (false seed), then flies
    // for real while still inside the launch ROI.
    const script = flightScript(30, { missedSteps: new Set([1]) });
    const tracker = new BallTracker(new ScriptedDetector(script), {
      launchRoi: LAUNCH_ROI,
    });

    await tracker.step(frameAt(0));
    expect(tracker.state).toBe('tentative');
    await tracker.step(frameAt(1));
    // Tentative track missed → discarded entirely.
    expect(tracker.state).toBe('idle');
    expect(tracker.observations).toHaveLength(0);
    expect(tracker.points).toHaveLength(0);

    for (let i = 2; i <= 10; i++) {
      await tracker.step(frameAt(i));
    }
    expect(tracker.state).toBe('confirmed');
    expect(tracker.observations.length).toBeGreaterThan(3);
  });

  it('detects landing: sustained descent back to launch height', async () => {
    // Full arc: land time ≈ 2·13.2/0.46 ≈ 57 steps.
    const tracker = new BallTracker(new ScriptedDetector(flightScript(70)), {
      launchRoi: LAUNCH_ROI,
    });
    await runSteps(tracker, 70);
    expect(tracker.state).toBe('landed');
    expect(tracker.landingPointIndex).toBeDefined();
    const landing = tracker.points[tracker.landingPointIndex!]!;
    // Landed near launch height (225) on the way down.
    expect(landing.y).toBeGreaterThan(210);
    const apexY = Math.min(...tracker.points.map((p) => p.y));
    expect(apexY).toBeLessThan(60);
  });

  it('never runs the detector outside its search ROI (spy check)', async () => {
    const inner = new ScriptedDetector(flightScript(20));
    const rois: (Roi | undefined)[] = [];
    const spy: BallDetector = {
      detect: (frame, roi) => {
        rois.push(roi);
        return inner.detect(frame, roi);
      },
    };
    const tracker = new BallTracker(spy, { launchRoi: LAUNCH_ROI });
    await runSteps(tracker, 20);
    expect(rois.length).toBeGreaterThan(15);
    for (const roi of rois) {
      expect(roi).toBeDefined();
      // Search windows stay small — the whole point of Kalman-gated detection.
      expect(roi!.w).toBeLessThanOrEqual(2 * 96);
      expect(roi!.h).toBeLessThanOrEqual(2 * 96);
    }
  });
});
