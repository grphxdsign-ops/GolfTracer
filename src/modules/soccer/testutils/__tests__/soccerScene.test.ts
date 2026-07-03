import { makeSoccerScene } from '../soccerScene';

describe('makeSoccerScene', () => {
  it('builds a consistent scene: static pre-roll, launch speed, shrinking ball', async () => {
    const scene = makeSoccerScene({ speedKmh: 75, elevationDeg: 12 });

    expect(scene.truth.launchSpeedMps).toBeCloseTo(75 / 3.6, 6);
    expect(scene.frameSource.asset.fps).toBe(120);
    expect(scene.truth.frames.length).toBeGreaterThan(20);

    // Detector sees the static ball during pre-roll at the kick point.
    const preKick = await scene.frameSource.frameAt(0);
    const still = await scene.detector.detect(preKick);
    expect(still).toHaveLength(1);
    const atRest = still[0]!;

    // ... and the same position right at the kick timestamp.
    const kickFrame = await scene.frameSource.frameAt(scene.truth.kickTimestampMs);
    const kicked = await scene.detector.detect(kickFrame);
    expect(kicked[0]!.cx).toBeCloseTo(atRest.cx, 3);

    // Apparent radius shrinks monotonically-ish as the ball recedes: the
    // last flight observation is clearly smaller than the first.
    const obs = scene.truth.observations;
    expect(obs.length).toBeGreaterThan(20);
    expect(obs[obs.length - 1]!.radiusPx).toBeLessThan(obs[0]!.radiusPx * 0.7);

    // Goal corners project inside the frame with valid ids.
    expect(scene.goalDetection.corners).toHaveLength(4);
    for (const c of scene.goalDetection.corners) {
      expect(c.cx).toBeGreaterThan(0);
      expect(c.cx).toBeLessThan(480);
      expect(c.cy).toBeGreaterThan(0);
      expect(c.cy).toBeLessThan(270);
    }

    // The rendered frame actually contains the bright ball disc.
    const frame = await scene.frameSource.frameAt(0);
    let maxLuma = 0;
    for (const v of frame.luma) maxLuma = Math.max(maxLuma, v);
    expect(maxLuma).toBeGreaterThanOrEqual(250);
  });

  it('honors the tracker ROI contract in the scripted detector', async () => {
    const scene = makeSoccerScene({ speedKmh: 75, elevationDeg: 12 });
    const frame = await scene.frameSource.frameAt(0);
    const inRoi = await scene.detector.detect(frame, scene.impactRoi);
    expect(inRoi).toHaveLength(1);
    const elsewhere = await scene.detector.detect(frame, { x: 0, y: 0, w: 10, h: 10 });
    expect(elsewhere).toHaveLength(0);
  });
});
