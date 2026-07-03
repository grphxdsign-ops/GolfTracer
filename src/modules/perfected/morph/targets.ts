/**
 * BIOMECH_TARGETS — per-sport biomechanical target tables driving the
 * perfected-action morph: a curated expert reference track (scripted
 * keyframe skeleton whose key-event geometry encodes the cited optima), the
 * key-event timestamp, cited scalar metric targets, and the baseline →
 * perfected launch parameters that seed the simulated perfected flight.
 *
 * Sources per sport:
 *  - Soccer (instep kick): peak knee-extension angular velocity of skilled
 *    kickers ~1400-2200 deg/s just before ball contact, knee still flexed
 *    ~140-160 deg at contact, and a ball-to-foot speed ratio of ~1.1-1.4 —
 *    Nunome et al. (2006) Med Sci Sports Exerc 38(7); Lees & Nolan (1998)
 *    J Sports Sci 16(3) review; Levanon & Dapena (1998) MSSE 30(6).
 *  - Basketball (set/jump shot): optimal release angle ~45-52 deg for
 *    typical release speeds (52 deg minimum-speed free throw), elbow set
 *    ("L") angle ~75-90 deg before extension, ~2-3 Hz backspin — Brancazio
 *    (1981) Am J Phys 49(4); Miller & Bartlett (1996) J Sports Sci 14(3);
 *    Okubo & Hubbard (2006) J Sports Sci 24(12).
 *  - Tennis (serve): shoulder internal rotation is the dominant
 *    speed-producing joint action, peaking ~1500-2500 deg/s, with wrist
 *    flexion peaking in the last ~30 ms before impact and full arm
 *    extension at contact — Elliott, Marshall & Noffal (1995) J Appl
 *    Biomech 11(4); Fleisig et al. (2003) Sports Biomech 2(1).
 *  - Pickleball: no biomechanics literature of comparable depth exists yet;
 *    the drive targets are ported tennis groundstroke/serve proxies scaled
 *    to pickleball ball/paddle speeds (typical drives 40-90 km/h per the
 *    sport profile), and are flagged as proxies in their sources.
 */
import type { BallLaunch } from '../../sports/engine/ballFlight';
import type { SportId } from '../../sports/engine/sportProfile';
import {
  skeletonKeypoints,
  type NamedJointMap,
  type PoseKeyframe,
} from '../../sports/pose/fakePoseEstimator';

export interface BiomechMetricTarget {
  id: string;
  label: string;
  unit: string;
  /** Cited target range in `unit`. */
  range: [number, number];
  /** Literature source (see the file header for full citations). */
  source: string;
}

export interface SportBiomechTargets {
  sport: SportId;
  /**
   * Curated expert reference track the user's motion is DTW-aligned to and
   * morphed toward. Keyframe geometry encodes the cited key-event angles.
   */
  referenceTrack: PoseKeyframe[];
  /** Timestamp of the key event (contact/release) within the track, ms. */
  contactTimestampMs: number;
  /** Cited scalar targets, reported alongside the morph. */
  metrics: BiomechMetricTarget[];
  /** Typical measured (amateur) launch — the blend start at strength 0. */
  baselineLaunch: BallLaunch;
  /** Biomechanically perfected launch — the blend end at strength 1. */
  perfectedLaunch: BallLaunch;
}

interface P2 {
  x: number;
  y: number;
}

const DEG = Math.PI / 180;

/**
 * Place a joint at `lengthPx` from `vertex` so the interior angle
 * a-vertex-joint equals `interiorDeg`. Screen coordinates (y down):
 * winding +1 opens the angle toward +x (the direction the athlete faces).
 */
function jointAt(
  a: P2,
  vertex: P2,
  interiorDeg: number,
  lengthPx: number,
  winding: 1 | -1,
): P2 {
  const ux0 = a.x - vertex.x;
  const uy0 = a.y - vertex.y;
  const n = Math.hypot(ux0, uy0);
  const ux = ux0 / n;
  const uy = uy0 / n;
  const th = winding * interiorDeg * DEG;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  return {
    x: vertex.x + (ux * cos - uy * sin) * lengthPx,
    y: vertex.y + (ux * sin + uy * cos) * lengthPx,
  };
}

/** Heel + toe joints for an ankle: toe by interior angle, heel opposite. */
function foot(
  knee: P2,
  ankle: P2,
  interiorDeg: number,
  winding: 1 | -1,
): { heel: P2; footIndex: P2 } {
  const footIndex = jointAt(knee, ankle, interiorDeg, 24, winding);
  const dx = footIndex.x - ankle.x;
  const dy = footIndex.y - ankle.y;
  const n = Math.hypot(dx, dy);
  return {
    footIndex,
    heel: { x: ankle.x - (dx / n) * 10, y: ankle.y - (dy / n) * 10 },
  };
}

/** Shared torso/head/arms block (side view, athlete facing +x, y down). */
function torso(
  hipX: number,
  hipY: number,
  shoulderY: number,
): NamedJointMap {
  return {
    nose: { x: hipX + 10, y: shoulderY - 58 },
    leftShoulder: { x: hipX - 20, y: shoulderY },
    rightShoulder: { x: hipX + 20, y: shoulderY },
    leftHip: { x: hipX - 16, y: hipY },
    rightHip: { x: hipX + 16, y: hipY },
  };
}

interface LegSpec {
  knee: P2;
  kneeAngleDeg: number;
  kneeWinding: 1 | -1;
  footAngleDeg: number;
  footWinding: 1 | -1;
  shankPx?: number;
}

function leg(
  side: 'left' | 'right',
  hip: P2,
  spec: LegSpec,
): NamedJointMap {
  const ankle = jointAt(
    hip,
    spec.knee,
    spec.kneeAngleDeg,
    spec.shankPx ?? 96,
    spec.kneeWinding,
  );
  const { heel, footIndex } = foot(
    spec.knee,
    ankle,
    spec.footAngleDeg,
    spec.footWinding,
  );
  if (side === 'left') {
    return {
      leftKnee: spec.knee,
      leftAnkle: ankle,
      leftHeel: heel,
      leftFootIndex: footIndex,
    };
  }
  return {
    rightKnee: spec.knee,
    rightAnkle: ankle,
    rightHeel: heel,
    rightFootIndex: footIndex,
  };
}

function arm(
  side: 'left' | 'right',
  shoulder: P2,
  elbow: P2,
  elbowAngleDeg: number,
  elbowWinding: 1 | -1,
): NamedJointMap {
  const wrist = jointAt(shoulder, elbow, elbowAngleDeg, 52, elbowWinding);
  if (side === 'left') {
    return { leftElbow: elbow, leftWrist: wrist };
  }
  return { rightElbow: elbow, rightWrist: wrist };
}

// ---------------------------------------------------------------------------
// Soccer: expert right-footed instep kick.
// Key event t=480 ms — support knee softly flexed, kicking knee 158 deg
// after extending off the 70-deg backswing over 100 ms; the instantaneous
// knee-extension velocity peaks ~2300 deg/s mid-swing, at the top of the
// skilled range Nunome et al. report (means ~1400-2200 deg/s, individual
// elite kicks higher).
// ---------------------------------------------------------------------------

function soccerKeyframe(
  timestampMs: number,
  hipX: number,
  kick: LegSpec,
): PoseKeyframe {
  const hipY = 320;
  const shoulderY = 182;
  const plantHip = { x: hipX - 16, y: hipY };
  const kickHip = { x: hipX + 16, y: hipY };
  return {
    timestampMs,
    keypoints: skeletonKeypoints({
      ...torso(hipX, hipY, shoulderY),
      ...arm('left', { x: hipX - 20, y: shoulderY }, { x: hipX - 36, y: shoulderY + 52 }, 150, -1),
      ...arm('right', { x: hipX + 20, y: shoulderY }, { x: hipX + 36, y: shoulderY + 52 }, 140, 1),
      ...leg('left', plantHip, {
        knee: { x: hipX - 13, y: 423 },
        kneeAngleDeg: 170,
        kneeWinding: 1,
        footAngleDeg: 115,
        footWinding: 1,
      }),
      ...leg('right', kickHip, kick),
    }),
  };
}

const SOCCER_REFERENCE: PoseKeyframe[] = [
  // Address.
  soccerKeyframe(0, 178, {
    knee: { x: 198, y: 418 },
    kneeAngleDeg: 155,
    kneeWinding: 1,
    footAngleDeg: 115,
    footWinding: 1,
  }),
  // Backswing: kicking knee deeply flexed (~70 deg), foot folded behind.
  soccerKeyframe(380, 182, {
    knee: { x: 212, y: 412 },
    kneeAngleDeg: 70,
    kneeWinding: -1,
    footAngleDeg: 150,
    footWinding: -1,
  }),
  // Ball contact: knee 158 deg (still flexed), toe plantarflexed.
  soccerKeyframe(480, 186, {
    knee: { x: 210, y: 402 },
    kneeAngleDeg: 158,
    kneeWinding: 1,
    footAngleDeg: 155,
    footWinding: 1,
  }),
  // Follow-through: leg long and rising.
  soccerKeyframe(760, 194, {
    knee: { x: 230, y: 375 },
    kneeAngleDeg: 165,
    kneeWinding: 1,
    footAngleDeg: 150,
    footWinding: 1,
  }),
];

// ---------------------------------------------------------------------------
// Basketball: expert set/jump shot. Elbow set at 80 deg (the "L"), release
// with the arm extended (~170 deg) and legs driven from 120 to 172 deg.
// ---------------------------------------------------------------------------

function basketballKeyframe(
  timestampMs: number,
  hipY: number,
  shoulderY: number,
  legAngleDeg: number,
  shootArm: { elbow: P2; angleDeg: number },
): PoseKeyframe {
  const hipX = 180;
  const shoulder = { x: hipX + 20, y: shoulderY };
  return {
    timestampMs,
    keypoints: skeletonKeypoints({
      ...torso(hipX, hipY, shoulderY),
      // Guide hand rides quietly beside the ball.
      ...arm('left', { x: hipX - 20, y: shoulderY }, { x: hipX - 2, y: shoulderY + 6 }, 95, 1),
      ...arm('right', shoulder, shootArm.elbow, shootArm.angleDeg, 1),
      ...leg('left', { x: hipX - 16, y: hipY }, {
        knee: { x: hipX - 12, y: hipY + 92 },
        kneeAngleDeg: legAngleDeg,
        kneeWinding: 1,
        footAngleDeg: 110,
        footWinding: 1,
      }),
      ...leg('right', { x: hipX + 16, y: hipY }, {
        knee: { x: hipX + 20, y: hipY + 92 },
        kneeAngleDeg: legAngleDeg,
        kneeWinding: 1,
        footAngleDeg: 110,
        footWinding: 1,
      }),
    }),
  };
}

const BASKETBALL_REFERENCE: PoseKeyframe[] = [
  // Set point: elbow at 80 deg, knees loaded at 120 deg.
  basketballKeyframe(0, 340, 195, 120, {
    elbow: { x: 228, y: 225 },
    angleDeg: 80,
  }),
  // Drive: legs extending, elbow starting up.
  basketballKeyframe(180, 330, 188, 145, {
    elbow: { x: 224, y: 200 },
    angleDeg: 110,
  }),
  // Release: arm extended overhead, legs at 172 deg.
  basketballKeyframe(380, 318, 176, 172, {
    elbow: { x: 212, y: 142 },
    angleDeg: 170,
  }),
  // Follow-through: wrist snapped over ("hand in the cookie jar").
  basketballKeyframe(560, 320, 178, 170, {
    elbow: { x: 214, y: 146 },
    angleDeg: 155,
  }),
];

// ---------------------------------------------------------------------------
// Tennis: expert first serve. Trophy (elbow 90 deg, racquet drop) into full
// arm extension at contact, legs driving 130 -> 170 deg.
// ---------------------------------------------------------------------------

function racquetKeyframe(
  timestampMs: number,
  hipY: number,
  shoulderY: number,
  legAngleDeg: number,
  hitArm: { elbow: P2; angleDeg: number; winding: 1 | -1 },
): PoseKeyframe {
  const hipX = 180;
  return {
    timestampMs,
    keypoints: skeletonKeypoints({
      ...torso(hipX, hipY, shoulderY),
      // Toss/balance arm.
      ...arm('left', { x: hipX - 20, y: shoulderY }, { x: hipX - 30, y: shoulderY - 40 }, 160, -1),
      ...arm('right', { x: hipX + 20, y: shoulderY }, hitArm.elbow, hitArm.angleDeg, hitArm.winding),
      ...leg('left', { x: hipX - 16, y: hipY }, {
        knee: { x: hipX - 12, y: hipY + 94 },
        kneeAngleDeg: legAngleDeg,
        kneeWinding: 1,
        footAngleDeg: 112,
        footWinding: 1,
      }),
      ...leg('right', { x: hipX + 16, y: hipY }, {
        knee: { x: hipX + 22, y: hipY + 94 },
        kneeAngleDeg: legAngleDeg,
        kneeWinding: 1,
        footAngleDeg: 112,
        footWinding: 1,
      }),
    }),
  };
}

const TENNIS_REFERENCE: PoseKeyframe[] = [
  // Trophy position: elbow cocked at 90 deg, racquet dropped behind.
  racquetKeyframe(0, 322, 186, 130, {
    elbow: { x: 214, y: 198 },
    angleDeg: 90,
    winding: -1,
  }),
  // Acceleration: shoulder internally rotating, elbow extending.
  racquetKeyframe(180, 316, 180, 150, {
    elbow: { x: 212, y: 162 },
    angleDeg: 130,
    winding: 1,
  }),
  // Contact: arm fully extended overhead (172 deg), legs at 170 deg.
  racquetKeyframe(280, 310, 174, 170, {
    elbow: { x: 210, y: 132 },
    angleDeg: 172,
    winding: 1,
  }),
  // Follow-through across the body.
  racquetKeyframe(520, 318, 182, 160, {
    elbow: { x: 224, y: 216 },
    angleDeg: 120,
    winding: 1,
  }),
];

// Pickleball drive: ported tennis proxies, compact and waist-high.
const PICKLEBALL_REFERENCE: PoseKeyframe[] = [
  // Compact backswing.
  racquetKeyframe(0, 324, 188, 145, {
    elbow: { x: 210, y: 230 },
    angleDeg: 120,
    winding: -1,
  }),
  // Contact out in front at waist height, arm long.
  racquetKeyframe(200, 320, 184, 160, {
    elbow: { x: 226, y: 236 },
    angleDeg: 165,
    winding: 1,
  }),
  // Short follow-through.
  racquetKeyframe(380, 322, 186, 158, {
    elbow: { x: 232, y: 224 },
    angleDeg: 150,
    winding: 1,
  }),
];

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

export const BIOMECH_TARGETS: Record<SportId, SportBiomechTargets> = {
  soccer: {
    sport: 'soccer',
    referenceTrack: SOCCER_REFERENCE,
    contactTimestampMs: 480,
    metrics: [
      {
        id: 'knee-extension-velocity',
        label: 'Knee extension speed at contact',
        unit: 'deg/s',
        range: [1400, 2200],
        source: 'Nunome et al. (2006) MSSE; Lees & Nolan (1998) J Sports Sci',
      },
      {
        id: 'knee-angle-at-contact',
        label: 'Kicking-knee angle at contact',
        unit: 'deg',
        range: [140, 165],
        source: 'Levanon & Dapena (1998) MSSE; Lees & Nolan (1998)',
      },
      {
        id: 'ball-foot-speed-ratio',
        label: 'Ball-to-foot speed ratio',
        unit: 'ratio',
        range: [1.1, 1.4],
        source: 'Nunome et al. (2006) MSSE',
      },
    ],
    baselineLaunch: {
      speedMps: 19,
      launchAngleDeg: 14,
      spinRpm: 200,
      spinAxisDeg: 35,
    },
    perfectedLaunch: {
      speedMps: 27,
      launchAngleDeg: 12,
      spinRpm: 350,
      spinAxisDeg: 0,
    },
  },
  basketball: {
    sport: 'basketball',
    referenceTrack: BASKETBALL_REFERENCE,
    contactTimestampMs: 380,
    metrics: [
      {
        id: 'release-angle',
        label: 'Release angle',
        unit: 'deg',
        range: [45, 52],
        source: 'Brancazio (1981) Am J Phys; Okubo & Hubbard (2006)',
      },
      {
        id: 'elbow-set-angle',
        label: 'Elbow set angle',
        unit: 'deg',
        range: [75, 90],
        source: 'Miller & Bartlett (1996) J Sports Sci',
      },
      {
        id: 'backspin',
        label: 'Backspin',
        unit: 'rpm',
        range: [120, 180],
        source: 'Brancazio (1981) Am J Phys (2-3 Hz backspin)',
      },
    ],
    baselineLaunch: {
      speedMps: 7.0,
      launchAngleDeg: 46,
      spinRpm: 120,
      spinAxisDeg: 0,
      positionM: { x: 0, y: 1.95, z: 0 },
    },
    perfectedLaunch: {
      speedMps: 7.3,
      launchAngleDeg: 51,
      spinRpm: 150,
      spinAxisDeg: 0,
      positionM: { x: 0, y: 2.05, z: 0 },
    },
  },
  tennis: {
    sport: 'tennis',
    referenceTrack: TENNIS_REFERENCE,
    contactTimestampMs: 280,
    metrics: [
      {
        id: 'shoulder-ir-velocity',
        label: 'Shoulder internal rotation speed',
        unit: 'deg/s',
        range: [1500, 2500],
        source: 'Elliott et al. (1995) J Appl Biomech; Fleisig et al. (2003)',
      },
      {
        id: 'wrist-flexion-timing',
        label: 'Peak wrist flexion before impact',
        unit: 'ms',
        range: [10, 30],
        source: 'Elliott et al. (1995) J Appl Biomech',
      },
      {
        id: 'elbow-at-contact',
        label: 'Elbow extension at contact',
        unit: 'deg',
        range: [160, 180],
        source: 'Fleisig et al. (2003) Sports Biomech',
      },
    ],
    baselineLaunch: {
      speedMps: 42,
      launchAngleDeg: -3,
      spinRpm: 1200,
      spinAxisDeg: 150,
      positionM: { x: 0, y: 2.6, z: 0 },
    },
    perfectedLaunch: {
      speedMps: 50,
      launchAngleDeg: -4,
      spinRpm: 2000,
      spinAxisDeg: 170,
      positionM: { x: 0, y: 2.75, z: 0 },
    },
  },
  pickleball: {
    sport: 'pickleball',
    referenceTrack: PICKLEBALL_REFERENCE,
    contactTimestampMs: 200,
    metrics: [
      {
        id: 'elbow-at-contact',
        label: 'Elbow extension at contact',
        unit: 'deg',
        range: [150, 175],
        source: 'Tennis groundstroke proxy (no pickleball literature yet)',
      },
      {
        id: 'contact-out-front',
        label: 'Contact ahead of the hip',
        unit: 'ratio',
        range: [0.2, 0.6],
        source: 'Tennis groundstroke proxy (no pickleball literature yet)',
      },
    ],
    baselineLaunch: {
      speedMps: 14,
      launchAngleDeg: 6,
      spinRpm: 600,
      spinAxisDeg: 180,
      positionM: { x: 0, y: 0.75, z: 0 },
    },
    perfectedLaunch: {
      speedMps: 18,
      launchAngleDeg: 4,
      spinRpm: 1000,
      spinAxisDeg: 180,
      positionM: { x: 0, y: 0.85, z: 0 },
    },
  },
};
