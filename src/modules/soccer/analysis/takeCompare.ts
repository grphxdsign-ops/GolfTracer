/**
 * Fast-take vs slow-take comparison — the coaching insight from the
 * measure_plan evaluation: the 75 km/h and 45 km/h takes differed in the
 * joint angles at contact. Pairs the two takes' joint-angle tables, computes
 * the per-joint deltas, surfaces the largest one, and assembles the
 * multi-take SoccerAnalysisResult (takes + bestTakeIndex + insights) the
 * sports session store holds.
 */
import type { JointAngleTable } from '../../sports/pose/jointAngles';
import type {
  SoccerAnalysisResult,
  SoccerTakeResult,
} from '../../sports/sportsSessionStore';

export type JointKey = 'shoulderHip' | 'hipKnee' | 'kneeAnkle';

export const JOINT_LABELS: Record<JointKey, string> = {
  shoulderHip: 'Shoulder–Hip',
  hipKnee: 'Hip–Knee',
  kneeAnkle: 'Knee–Ankle',
};

const JOINT_KEYS: readonly JointKey[] = ['shoulderHip', 'hipKnee', 'kneeAnkle'];

export interface AngleDelta {
  side: 'left' | 'right';
  joint: JointKey;
  label: string;
  fastDeg: number | null;
  slowDeg: number | null;
  /** fast − slow, or null when either take is missing its pose. */
  deltaDeg: number | null;
}

export interface TakeComparison {
  fastLabel: string;
  slowLabel: string;
  fastPeakSpeedKmh: number;
  slowPeakSpeedKmh: number;
  /** fast − slow. */
  speedDeltaKmh: number;
  angleDeltas: AngleDelta[];
  /** The largest measurable joint-angle difference, or null when none. */
  keyDifference: AngleDelta | null;
}

function angleOf(
  table: JointAngleTable | null,
  side: 'left' | 'right',
  joint: JointKey,
): number | null {
  return table ? table[side][joint] : null;
}

/**
 * Compare two takes; the faster take is normalized to `fast` regardless of
 * argument order so the insight always reads "what the stronger kick did
 * differently".
 */
export function compareTakes(
  a: SoccerTakeResult,
  b: SoccerTakeResult,
): TakeComparison {
  const [fast, slow] = a.peakSpeedKmh >= b.peakSpeedKmh ? [a, b] : [b, a];

  const angleDeltas: AngleDelta[] = [];
  for (const side of ['left', 'right'] as const) {
    for (const joint of JOINT_KEYS) {
      const fastDeg = angleOf(fast.jointAnglesAtContact, side, joint);
      const slowDeg = angleOf(slow.jointAnglesAtContact, side, joint);
      angleDeltas.push({
        side,
        joint,
        label: JOINT_LABELS[joint],
        fastDeg,
        slowDeg,
        deltaDeg: fastDeg !== null && slowDeg !== null ? fastDeg - slowDeg : null,
      });
    }
  }

  let keyDifference: AngleDelta | null = null;
  for (const d of angleDeltas) {
    if (d.deltaDeg === null) continue;
    if (!keyDifference || Math.abs(d.deltaDeg) > Math.abs(keyDifference.deltaDeg!)) {
      keyDifference = d;
    }
  }

  return {
    fastLabel: fast.label,
    slowLabel: slow.label,
    fastPeakSpeedKmh: fast.peakSpeedKmh,
    slowPeakSpeedKmh: slow.peakSpeedKmh,
    speedDeltaKmh: fast.peakSpeedKmh - slow.peakSpeedKmh,
    angleDeltas,
    keyDifference,
  };
}

/** Human-readable coaching insights from a take comparison. */
export function comparisonInsights(cmp: TakeComparison): string[] {
  const insights: string[] = [
    `${cmp.fastLabel} was ${Math.round(cmp.speedDeltaKmh)} km/h faster than ` +
      `${cmp.slowLabel} (${Math.round(cmp.fastPeakSpeedKmh)} vs ` +
      `${Math.round(cmp.slowPeakSpeedKmh)} km/h).`,
  ];
  if (cmp.keyDifference && cmp.keyDifference.deltaDeg !== null) {
    const d = cmp.keyDifference;
    insights.push(
      `Biggest difference at contact: ${d.side} ${d.label} angle was ` +
        `${Math.abs(Math.round(d.deltaDeg!))}° ` +
        `${d.deltaDeg! >= 0 ? 'larger' : 'smaller'} on the faster take.`,
    );
  }
  return insights;
}

/**
 * Append a freshly analyzed take to the session's soccer result: recomputes
 * the fastest-take index and, once at least two takes exist, the
 * fastest-vs-slowest coaching insights.
 */
export function appendTakeToResult(
  previous: SoccerAnalysisResult | null,
  take: SoccerTakeResult,
): SoccerAnalysisResult {
  const takes = [...(previous?.takes ?? []), take];
  let bestTakeIndex = 0;
  let slowestIndex = 0;
  for (let i = 1; i < takes.length; i++) {
    if (takes[i]!.peakSpeedKmh > takes[bestTakeIndex]!.peakSpeedKmh) {
      bestTakeIndex = i;
    }
    if (takes[i]!.peakSpeedKmh < takes[slowestIndex]!.peakSpeedKmh) {
      slowestIndex = i;
    }
  }
  const insights =
    takes.length >= 2 && bestTakeIndex !== slowestIndex
      ? comparisonInsights(
          compareTakes(takes[bestTakeIndex]!, takes[slowestIndex]!),
        )
      : [];
  return { takes, bestTakeIndex, insights };
}
