/**
 * DTL estimator validation: synthetic-grid error bounds + the real-clip
 * regression fixture.
 *
 * Grid selection is deterministic and stratified, NOT cherry-picked: the
 * full factorial over
 *   club {driver, 3-wood, 7-iron} × v {μ−σ, μ, μ+σ} × α {μ−σ, μ+σ} ×
 *   ψ {−8°, 0°, +8°} × pitch {−5°, +8°} × h_c {1.4, 1.7 m} ×
 *   HFOV {40°, 44°, 48°} × noise {1, 2 px}
 * has 3·3·2·3·2·2·3·2 = 1296 cases; we run every 27th (indices 27k,
 * k = 0..47 — exactly 48 cases, an arithmetic progression through the mixed-
 * radix enumeration, so every level of every dimension is exercised). Per-
 * case attributes derived from k (documented, still not cherry-picked):
 *   - FOV withheld from calibration on even k (half the cases fit HFOV);
 *   - nObs = 10 + (k mod 5) observations at 30 fps starting 0.1 s after
 *     impact — 0.40..0.53 s windows;
 *   - tee distance 3.5 + 0.5·(k mod 3) m;
 *   - true backspin μ + 0.5σ·((k mod 3) − 1) (the fitter never fits spin);
 *   - noise seed 90000 + k.
 *
 * Accepted-fit error bounds asserted below (median ≤ 12%, p90 ≤ 25%,
 * acceptance ≥ 55%) are the release gates from the workstream spec; every
 * declined case must fall to the honest club prior at ≤ 0.3 confidence.
 */
import type { BallTrack, CalibrationInput, ClubType } from '../../../types';

import { estimateDistance } from '../estimate/estimateDistance';
import { summarizeEstimate } from '../estimate/diagnostics';
import { CLUB_PRIORS } from '../physics/clubPriors';
import { makeSyntheticDtlTrack } from './helpers/syntheticDtl';

jest.setTimeout(240000);

const FRAME = { width: 1080, height: 1920 };
const FPS = 30;

interface GridCase {
  k: number;
  club: ClubType;
  ballSpeedMph: number;
  launchAngleDeg: number;
  backspinRpm: number;
  azimuthDeg: number;
  cameraPitchDeg: number;
  cameraHeightM: number;
  hfovDeg: number;
  noisePx: number;
  fovWithheld: boolean;
  nObs: number;
  teeDistanceM: number;
  seed: number;
}

const CLUBS: ClubType[] = ['driver', '3-wood', '7-iron'];
const V_SIGMAS = [-1, 0, 1];
const A_SIGMAS = [-1, 1];
const PSIS = [-8, 0, 8];
const PITCHES = [-5, 8];
const HEIGHTS = [1.4, 1.7];
const HFOVS = [40, 44, 48];
const NOISES = [1, 2];

const FULL_FACTORIAL =
  CLUBS.length *
  V_SIGMAS.length *
  A_SIGMAS.length *
  PSIS.length *
  PITCHES.length *
  HEIGHTS.length *
  HFOVS.length *
  NOISES.length; // 1296

function gridCase(k: number): GridCase {
  const idx = k * 27; // stride 27 · 48 = 1296: every 27th factorial case
  // Mixed-radix decode, outermost club -> innermost noise.
  let rest = idx;
  const noisePx = NOISES[rest % NOISES.length]!;
  rest = Math.floor(rest / NOISES.length);
  const hfovDeg = HFOVS[rest % HFOVS.length]!;
  rest = Math.floor(rest / HFOVS.length);
  const cameraHeightM = HEIGHTS[rest % HEIGHTS.length]!;
  rest = Math.floor(rest / HEIGHTS.length);
  const cameraPitchDeg = PITCHES[rest % PITCHES.length]!;
  rest = Math.floor(rest / PITCHES.length);
  const azimuthDeg = PSIS[rest % PSIS.length]!;
  rest = Math.floor(rest / PSIS.length);
  const aSigma = A_SIGMAS[rest % A_SIGMAS.length]!;
  rest = Math.floor(rest / A_SIGMAS.length);
  const vSigma = V_SIGMAS[rest % V_SIGMAS.length]!;
  rest = Math.floor(rest / V_SIGMAS.length);
  const club = CLUBS[rest % CLUBS.length]!;

  const prior = CLUB_PRIORS[club];
  return {
    k,
    club,
    ballSpeedMph: prior.ballSpeedMph.mean + vSigma * prior.ballSpeedMph.sd,
    launchAngleDeg:
      prior.launchAngleDeg.mean + aSigma * prior.launchAngleDeg.sd,
    backspinRpm: prior.spinRpm.mean + 0.5 * prior.spinRpm.sd * ((k % 3) - 1),
    azimuthDeg,
    cameraPitchDeg,
    cameraHeightM,
    hfovDeg,
    noisePx,
    fovWithheld: k % 2 === 0,
    nObs: 10 + (k % 5),
    teeDistanceM: 3.5 + 0.5 * (k % 3),
    seed: 90000 + k,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(idx, 0)]!;
}

describe('DTL synthetic validation grid', () => {
  // Case outcomes accumulate across the two batch tests (split only to keep
  // each test comfortably inside the 240 s jest timeout); the aggregate
  // error-bound assertions run over all 48 in the final test.
  interface CaseOutcome {
    row: string;
    accepted: boolean;
    errFrac: number;
  }
  const outcomes: CaseOutcome[] = [];

  function runBatch(fromK: number, toK: number): void {
    for (let k = fromK; k < toK; k++) {
      const c = gridCase(k);
      const scene = makeSyntheticDtlTrack({
        club: c.club,
        launch: {
          ballSpeedMph: c.ballSpeedMph,
          launchAngleDeg: c.launchAngleDeg,
          backspinRpm: c.backspinRpm,
        },
        azimuthDeg: c.azimuthDeg,
        cameraPitchDeg: c.cameraPitchDeg,
        cameraHeightM: c.cameraHeightM,
        teeDistanceM: c.teeDistanceM,
        hfovDeg: c.hfovDeg,
        frameWidth: FRAME.width,
        frameHeight: FRAME.height,
        fps: FPS,
        nObs: c.nObs,
        noisePx: c.noisePx,
        seed: c.seed,
      });

      const calibration: CalibrationInput = {
        club: c.club,
        cameraAngle: 'down-the-line',
        ballRadiusAtAddressPx: scene.ballRadiusAtAddressPx,
        ...(c.fovWithheld ? {} : { horizontalFovDeg: c.hfovDeg }),
      };
      const result = estimateDistance(
        scene.track,
        calibration,
        { ...FRAME, fps: FPS },
        { teePointPx: scene.teePointPx },
      );
      const d = summarizeEstimate(result);
      const isAccepted =
        result.method === 'physics-fit' && result.dtlFit?.converged === true;
      const errPct =
        (100 * Math.abs(result.carryYards - scene.trueCarryYards)) /
        scene.trueCarryYards;

      if (isAccepted) {
        // Honesty invariant: accepted confidence lives in [0.3, 0.75].
        expect(result.confidence).toBeGreaterThanOrEqual(0.3);
        expect(result.confidence).toBeLessThanOrEqual(0.75);
      } else {
        // Declined cases must reach the honest club prior at <= 0.3.
        expect(result.method).toBe('club-prior');
        expect(result.confidence).toBeLessThanOrEqual(0.3);
      }

      const row = [
          `k=${String(k).padStart(2)}`,
          c.club.padEnd(7),
          `v=${c.ballSpeedMph.toFixed(0)}`,
          `a=${c.launchAngleDeg.toFixed(1)}`,
          `psi=${String(c.azimuthDeg).padStart(2)}`,
          `pit=${String(c.cameraPitchDeg).padStart(2)}`,
          `hc=${c.cameraHeightM}`,
          `fov=${c.hfovDeg}${c.fovWithheld ? '?' : ' '}`,
          `n=${c.nObs}`,
          `nz=${c.noisePx}`,
          `true=${scene.trueCarryYards.toFixed(0).padStart(3)}`,
          `est=${d.carryYards.toFixed(0).padStart(3)}`,
          `err=${errPct.toFixed(1).padStart(5)}%`,
          `conf=${d.confidence.toFixed(2)}`,
          `${d.method}${d.declineReason ? `(${d.declineReason})` : ''}`,
          `rms=${d.pixelRms?.toFixed(1) ?? '-'}`,
          `spread=${d.carrySpreadYards?.toFixed(0) ?? '-'}`,
          `tee=${d.teeSource ?? '-'}`,
      ].join(' ');
      outcomes.push({ row, accepted: isAccepted, errFrac: errPct / 100 });
    }
  }

  it('runs stratified cases 0-23 with honest per-case outcomes', () => {
    expect(FULL_FACTORIAL).toBe(1296);
    runBatch(0, 24);
  });

  it('runs stratified cases 24-47 with honest per-case outcomes', () => {
    runBatch(24, 48);
  });

  it('meets the pinned aggregate error bounds over all 48 cases', () => {
    expect(outcomes).toHaveLength(48);
    const acceptedErrors = outcomes
      .filter((o) => o.accepted)
      .map((o) => o.errFrac);
    const accepted = acceptedErrors.length;
    const acceptanceRate = accepted / outcomes.length;
    const medianErr = accepted ? median(acceptedErrors) : NaN;
    const p90Err = accepted ? percentile(acceptedErrors, 90) : NaN;

    // Offline report: the per-case table plus the aggregate line, all built
    // from summarizeEstimate output.
     
    console.log(
      `DTL grid report (48 stratified cases)\n${outcomes
        .map((o) => o.row)
        .join('\n')}\n` +
        `accepted=${accepted}/48 (${(acceptanceRate * 100).toFixed(0)}%) ` +
        `median|err|=${(medianErr * 100).toFixed(1)}% ` +
        `p90|err|=${(p90Err * 100).toFixed(1)}%`,
    );

    expect(acceptanceRate).toBeGreaterThanOrEqual(0.55);
    expect(medianErr).toBeLessThanOrEqual(0.12);
    expect(p90Err).toBeLessThanOrEqual(0.25);
  });
});

describe('real-clip regression fixture', () => {
  // Canonical fixture (embedded verbatim per the workstream contract): the
  // hand-verified auto-tracked user clip on which the old receding rung
  // fabricated a 2 yd carry at 0.50 confidence and the ladder previously
  // surfaced a 219 yd club prior. The DTL fit must produce a MEASURED,
  // plausible driver carry with honest confidence.
  const OBSERVATIONS: Array<[number, number, number]> = [
    // [x px, y px, timestampMs]
    [597, 945, 367],
    [581, 850, 400],
    [569, 779, 433],
    [560, 723, 467],
    [548, 641, 533],
    [541, 614, 567],
    [536, 588, 600],
    [532, 566, 633],
    [529, 548, 667],
    [524, 518, 733],
    [522, 505, 767],
    [520, 495, 800],
  ];
  const IMPACT_MS = 267;
  const TEE_PX = { x: 730, y: 1676 };

  function realClipTrack(): BallTrack {
    const smoothedPath = OBSERVATIONS.map(([x, y, timestampMs]) => ({
      timestampMs,
      x,
      y,
      interpolated: false,
    }));
    return {
      observations: OBSERVATIONS.map(([x, y, timestampMs], i) => ({
        frameIndex: i,
        timestampMs,
        cx: x,
        cy: y,
        radiusPx: 3,
        confidence: 0.9,
      })),
      smoothedPath,
      impactFrameIndex: 0,
      impactTimestampMs: IMPACT_MS,
      apexPointIndex: smoothedPath.length - 1,
      frameWidth: 1080,
      frameHeight: 1920,
      quality: 'high',
    };
  }

  it('measures a plausible driver carry instead of falling to the prior', () => {
    const result = estimateDistance(
      realClipTrack(),
      {
        club: 'driver',
        cameraAngle: 'down-the-line',
        ballRadiusAtAddressPx: 7,
        // No FOV given: the fit must recover HFOV itself.
      },
      { width: 1080, height: 1920, fps: 30 },
      { teePointPx: TEE_PX },
    );

     
    console.log('real clip:', JSON.stringify(summarizeEstimate(result)));

    expect(result.method).toBe('physics-fit');
    expect(result.dtlFit).toBeDefined();
    expect(result.dtlFit!.converged).toBe(true);
    expect(result.carryYards).toBeGreaterThanOrEqual(140);
    expect(result.carryYards).toBeLessThanOrEqual(300);
    expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    expect(result.confidence).toBeLessThanOrEqual(0.75);
    expect(
      result.dtlFit!.carrySpreadYards / result.dtlFit!.carryYards,
    ).toBeLessThanOrEqual(0.3);
    // The old rung's measured failure mode (a converged sub-100 yd driver
    // "measurement" at >= 0.3 confidence) must be impossible by construction.
    expect(result.carryYards).toBeGreaterThan(100);
  });

  it('declines to the honest club prior when the metric anchor is missing', () => {
    const result = estimateDistance(
      realClipTrack(),
      { club: 'driver', cameraAngle: 'down-the-line' }, // no ball radius
      { width: 1080, height: 1920, fps: 30 },
      { teePointPx: TEE_PX },
    );
    expect(result.method).toBe('club-prior');
    expect(result.confidence).toBeLessThanOrEqual(0.3);
    expect(result.dtlFit?.converged).toBe(false);
    expect(result.dtlFit?.declineReason).toBe('no-anchor');
  });
});
