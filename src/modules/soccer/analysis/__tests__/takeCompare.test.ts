import { computeJointAngleTable } from '../../../sports/pose/jointAngles';
import {
  cannedSoccerResult,
  cannedTake,
  scriptedContactPose,
} from '../../testutils/soccerFixtures';
import {
  appendTakeToResult,
  compareTakes,
  comparisonInsights,
} from '../takeCompare';

function slowTake() {
  // Slow take: 45 km/h with the right knee bent at contact (hip-knee 90°
  // instead of the fast take's 180°).
  const pose = scriptedContactPose(20, 170, true);
  return cannedTake({
    label: 'Take 2',
    peakSpeedMps: 45 / 3.6,
    peakSpeedKmh: 45,
    poseAtContact: pose,
    jointAnglesAtContact: computeJointAngleTable(pose),
  });
}

describe('compareTakes', () => {
  it('surfaces the speed delta and the fast-vs-slow joint-angle differences', () => {
    const fast = cannedTake(); // 75 km/h, straight right leg
    const slow = slowTake();

    const cmp = compareTakes(fast, slow);
    expect(cmp.fastLabel).toBe('Take 1');
    expect(cmp.slowLabel).toBe('Take 2');
    expect(cmp.fastPeakSpeedKmh).toBe(75);
    expect(cmp.slowPeakSpeedKmh).toBe(45);
    expect(cmp.speedDeltaKmh).toBeCloseTo(30, 6);
    expect(cmp.angleDeltas).toHaveLength(6);

    // The scripted difference: right hip-knee 180° (fast) vs 90° (slow).
    expect(cmp.keyDifference).not.toBeNull();
    expect(cmp.keyDifference!.side).toBe('right');
    expect(cmp.keyDifference!.joint).toBe('hipKnee');
    expect(cmp.keyDifference!.deltaDeg).toBeCloseTo(90, 5);
  });

  it('normalizes argument order so the faster take is always `fast`', () => {
    const cmp = compareTakes(slowTake(), cannedTake());
    expect(cmp.fastLabel).toBe('Take 1');
    expect(cmp.speedDeltaKmh).toBeGreaterThan(0);
  });

  it('yields null deltas when a take has no pose', () => {
    const fast = cannedTake();
    const slow = cannedTake({
      label: 'Take 2',
      peakSpeedKmh: 45,
      poseAtContact: null,
      jointAnglesAtContact: null,
    });
    const cmp = compareTakes(fast, slow);
    expect(cmp.speedDeltaKmh).toBeCloseTo(30, 6);
    expect(cmp.keyDifference).toBeNull();
    for (const d of cmp.angleDeltas) {
      expect(d.deltaDeg).toBeNull();
    }
  });
});

describe('comparisonInsights', () => {
  it('renders the speed insight and the key joint-angle insight', () => {
    const insights = comparisonInsights(compareTakes(cannedTake(), slowTake()));
    expect(insights[0]).toBe(
      'Take 1 was 30 km/h faster than Take 2 (75 vs 45 km/h).',
    );
    expect(insights[1]).toBe(
      'Biggest difference at contact: right Hip–Knee angle was 90° larger ' +
        'on the faster take.',
    );
  });
});

describe('appendTakeToResult', () => {
  it('starts a result from the first take with no insights', () => {
    const result = appendTakeToResult(null, cannedTake());
    expect(result.takes).toHaveLength(1);
    expect(result.bestTakeIndex).toBe(0);
    expect(result.insights).toEqual([]);
  });

  it('tracks the fastest take and emits fast-vs-slow insights on the second', () => {
    const first = appendTakeToResult(null, slowTake());
    const result = appendTakeToResult(first, cannedTake());
    expect(result.takes).toHaveLength(2);
    // The 75 km/h take (appended second) is the fastest.
    expect(result.bestTakeIndex).toBe(1);
    expect(result.insights.length).toBeGreaterThan(0);
    expect(result.insights[0]).toMatch(/faster than/);
  });

  it('keeps previous takes intact (history)', () => {
    const first = appendTakeToResult(null, cannedTake());
    const second = appendTakeToResult(first, slowTake());
    expect(second.takes[0]).toBe(first.takes[0]);
    expect(cannedSoccerResult().takes).toHaveLength(1);
  });
});
