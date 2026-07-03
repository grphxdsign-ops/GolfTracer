/**
 * Perfected-action pipeline: measured motion -> calibrated dummy skeleton
 * -> DTW-aligned morph toward the sport's biomech targets -> perfected
 * launch blend -> simulated perfected ball flight -> PerfectedResult for
 * the sports session store.
 */
import {
  simulateBallFlight,
  type BallLaunch,
} from '../sports/engine/ballFlight';
import { getSportProfile, type SportId } from '../sports/engine/sportProfile';
import type { PoseFrame } from '../sports/pose/PoseAdapter';
import {
  FakePoseEstimator,
  makeDefaultKickScript,
} from '../sports/pose/fakePoseEstimator';
import {
  computeJointAngleTable,
  type JointAngleTable,
} from '../sports/pose/jointAngles';
import type { PerfectedResult } from '../sports/sportsSessionStore';
import { calibrateSkeleton, pickCalibrationFrame } from './skeleton/dummyModel';
import { BIOMECH_TARGETS } from './morph/targets';
import {
  contactFrameIndex,
  morphMotion,
  samplePoseFrames,
} from './morph/morphMotion';

export interface PerfectActionInput {
  sport: SportId;
  /** The user's measured motion (pose frames across the action). */
  measuredFrames: PoseFrame[];
  /** Correction strength 0-1 (0 = as measured, 1 = fully perfected). */
  strength: number;
  /**
   * Measured launch speed (e.g. the soccer analysis peak shot speed), m/s.
   * Falls back to the sport's typical baseline when absent.
   */
  measuredSpeedMps?: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Blend the baseline (measured) launch toward the perfected one. */
export function blendLaunch(
  baseline: BallLaunch,
  perfected: BallLaunch,
  strength: number,
): BallLaunch {
  const t = Math.min(1, Math.max(0, strength));
  const launch: BallLaunch = {
    speedMps: lerp(baseline.speedMps, perfected.speedMps, t),
    launchAngleDeg: lerp(baseline.launchAngleDeg, perfected.launchAngleDeg, t),
    azimuthDeg: lerp(baseline.azimuthDeg ?? 0, perfected.azimuthDeg ?? 0, t),
    spinRpm: lerp(baseline.spinRpm ?? 0, perfected.spinRpm ?? 0, t),
    spinAxisDeg: lerp(baseline.spinAxisDeg ?? 0, perfected.spinAxisDeg ?? 0, t),
  };
  const bp = baseline.positionM;
  const pp = perfected.positionM;
  if (bp !== undefined || pp !== undefined) {
    const b = bp ?? { x: 0, y: 0, z: 0 };
    const p = pp ?? { x: 0, y: 0, z: 0 };
    launch.positionM = {
      x: lerp(b.x, p.x, t),
      y: lerp(b.y, p.y, t),
      z: lerp(b.z, p.z, t),
    };
  }
  return launch;
}

const fmt = (value: number, digits = 0): string => value.toFixed(digits);

function angleNotes(
  measured: JointAngleTable,
  target: JointAngleTable,
): string[] {
  const notes: string[] = [];
  const sides: ('left' | 'right')[] = ['left', 'right'];
  const labels: Record<keyof JointAngleTable['left'], string> = {
    shoulderHip: 'hip (shoulder-hip-knee)',
    hipKnee: 'knee (hip-knee-ankle)',
    kneeAnkle: 'ankle (knee-ankle-toe)',
  };
  for (const side of sides) {
    for (const key of Object.keys(labels) as (keyof JointAngleTable['left'])[]) {
      const from = measured[side][key];
      const to = target[side][key];
      if (Math.abs(to - from) >= 3) {
        notes.push(
          `${side === 'left' ? 'Left' : 'Right'} ${labels[key]} at contact: ` +
            `${fmt(from)} deg -> ${fmt(to)} deg`,
        );
      }
    }
  }
  return notes;
}

/**
 * Demo measured motion for the perfected-action screen when no analyzed
 * take is in the session: the fake pose estimator's scripted instep kick
 * sampled at 30 fps.
 */
export function demoMeasuredFrames(): PoseFrame[] {
  return samplePoseFrames(makeDefaultKickScript(), 30);
}

/** Run the full perfected-action pipeline. */
export function buildPerfectedResult(
  input: PerfectActionInput,
): PerfectedResult {
  const targets = BIOMECH_TARGETS[input.sport];
  const profile = getSportProfile(input.sport);
  const strength = Math.min(1, Math.max(0, input.strength));

  // Calibrate the dummy once from the user's best-seen frame, then morph.
  const skeleton = calibrateSkeleton(pickCalibrationFrame(input.measuredFrames));
  const motion = morphMotion(
    input.measuredFrames,
    targets.referenceTrack,
    skeleton,
    strength,
  );
  const contactIdx = contactFrameIndex(motion, targets.contactTimestampMs);
  const measuredAngles = computeJointAngleTable(
    input.measuredFrames[contactIdx]!,
  );
  // Target angles come from the EXACT expert contact pose retargeted onto
  // the user's skeleton (a one-frame morph at strength 1), not from the
  // nearest DTW grid sample.
  const expertContact = new FakePoseEstimator(
    targets.referenceTrack,
  ).keypointsAt(targets.contactTimestampMs);
  const contactMorph = morphMotion(
    [input.measuredFrames[contactIdx]!],
    [{ timestampMs: targets.contactTimestampMs, keypoints: expertContact }],
    skeleton,
    1,
  );
  const targetAngles = computeJointAngleTable(contactMorph.frames[0]!);

  // Perfected flight, seeded by the strength-blended release.
  const baseline: BallLaunch = {
    ...targets.baselineLaunch,
    speedMps: input.measuredSpeedMps ?? targets.baselineLaunch.speedMps,
  };
  const launch = blendLaunch(baseline, targets.perfectedLaunch, strength);
  const flight = simulateBallFlight(launch, profile.ball);

  const notes: string[] = [
    `Correction strength ${fmt(strength * 100)}%`,
    `Launch: ${fmt(baseline.speedMps, 1)} m/s @ ${fmt(baseline.launchAngleDeg)} deg -> ` +
      `${fmt(launch.speedMps, 1)} m/s @ ${fmt(launch.launchAngleDeg)} deg`,
    ...angleNotes(measuredAngles, targetAngles),
    ...targets.metrics.map(
      (m) =>
        `Target ${m.label.toLowerCase()}: ${fmt(m.range[0])}-${fmt(m.range[1])} ` +
        `${m.unit} (${m.source})`,
    ),
  ];

  return {
    sport: input.sport,
    morphedFrames: motion.frames.map((frame) => ({
      timestampMs: frame.timestampMs,
      keypoints: frame.keypoints,
    })),
    flight,
    targetAngles,
    notes,
  };
}
