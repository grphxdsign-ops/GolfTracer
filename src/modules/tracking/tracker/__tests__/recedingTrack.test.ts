/**
 * Field evidence #3: on a 30 fps down-the-line clip the ball WAS recoverable
 * — 12 clean detections rising toward a point below the vanishing point with
 * image motion decaying ~60 → 12 native px/frame — but only against a
 * background built over the whole pre-impact window. The rolling 5-frame
 * median forgets the scene too fast at 30 fps and absorbs the slowly-receding
 * ball. This test pins the fixed behavior (fps-aware static background via
 * the pipeline defaults) and documents the old failure as a control.
 */
import { runTracking } from '../pipeline';
import {
  makeFrameSource,
  makeRecedingFlight,
  type RecedingFlightSpec,
} from '../../testutils/syntheticFrames';
import type { BallTrack } from '../../../../types/tracking';
import type { TruthPoint } from '../../testutils/syntheticFrames';

jest.setTimeout(60000);

// Analysis-resolution portrait geometry of the real clip (1080x1920 → 480
// wide): ball rises from (253,346) toward (232,224), per-frame displacement
// 26.7 px decaying by ×0.86 (≈ the 60 → 12 native px/frame decay), disc
// shrinking 4 → 2.5 over the 12 measured detections. The flight then keeps
// asymptoting toward the vanishing point (evidence #4) for another 20 frames
// — the sub-pixel steps there are what starve a 5-frame rolling median.
const EVIDENCE_FRAMES = 12;
const SPEC: RecedingFlightSpec = {
  width: 480,
  height: 853,
  fps: 30,
  preImpactFrames: 20,
  flightFrames: 32,
  start: { x: 253, y: 346 },
  towards: { x: 232, y: 224 },
  initialStepPx: 26.7,
  stepDecay: 0.86,
  startRadius: 4,
  endRadius: 2.5,
  shrinkFrames: EVIDENCE_FRAMES,
  ballLuma: 235,
  noiseAmp: 2,
  seed: 99,
};

/** Truth points with an accepted observation within `tol` px at the same frame. */
function recovered(track: BallTrack, truth: TruthPoint[], tol: number): number {
  const byFrame = new Map(track.observations.map((o) => [o.frameIndex, o]));
  let count = 0;
  for (const t of truth) {
    const o = byFrame.get(t.frameIndex);
    if (o && Math.hypot(o.cx - t.x, o.cy - t.y) <= tol) count++;
  }
  return count;
}

describe('receding 30 fps track (evidence #3 geometry)', () => {
  // The synthetic asset is already at analysis resolution, so the native tap
  // equals the analysis-space ball position.
  const ballPoint = { x: SPEC.start.x, y: SPEC.start.y };

  it('recovers the decelerating ball with the fps-derived static background', async () => {
    const flight = makeRecedingFlight(SPEC);
    const { track } = await runTracking(makeFrameSource(flight.frames), {
      ballPoint,
      // Frozen clock: the fallback pass must run regardless of machine speed.
      clock: () => 0,
    });

    expect(track.quality).not.toBe('failed');
    // ≥8 of the 12 evidence detections land within 5 analysis px.
    const evidenceTruth = flight.truth.slice(0, EVIDENCE_FRAMES);
    expect(recovered(track, evidenceTruth, 5)).toBeGreaterThanOrEqual(8);
  });

  it('control: the old rolling background recovers fewer points', async () => {
    const flight = makeRecedingFlight(SPEC);
    // Identical tracker settings for both runs — only the background model
    // differs. The jerk noise is raised so the constant-acceleration Kalman
    // filter can follow the geometrically decaying image velocity all the way
    // into the asymptotic tail, where the background models diverge: with the
    // default q the filter's learned deceleration outlives the ball's and the
    // track is lost (in both modes) before the rolling median fails.
    const tracker = { kalman: { processNoise: 4e6 } };
    // Pin the size floor at the scenario's design sensitivity: the fps-aware
    // defaults lower it to 1 px, which lets the rolling median keep the
    // slowly-drifting tail ball and would mask the background-model contrast
    // this control exists to demonstrate.
    const staticRun = await runTracking(makeFrameSource(flight.frames), {
      ballPoint,
      detectorOptions: { minRadiusPx: 2 },
      tracker,
      clock: () => 0,
    });
    const rollingRun = await runTracking(makeFrameSource(flight.frames), {
      ballPoint,
      detectorOptions: { backgroundMode: 'rolling', minRadiusPx: 2 },
      tracker,
      clock: () => 0,
    });

    // The rolling median absorbs the near-stationary receding ball late in
    // the asymptotic tail; the frozen background keeps seeing it.
    const staticCount = recovered(staticRun.track, flight.truth, 5);
    const rollingCount = recovered(rollingRun.track, flight.truth, 5);
    expect(rollingCount).toBeLessThan(staticCount);
  });
});
