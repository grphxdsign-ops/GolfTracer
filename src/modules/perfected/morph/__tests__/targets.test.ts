/**
 * BIOMECH_TARGETS tests: every sport ships a well-formed cited target set,
 * and the curated expert tracks actually encode the cited key-event
 * biomechanics (soccer knee angle + extension velocity, basketball elbow
 * set + release angle, tennis/pickleball arm extension at contact).
 */
import {
  POSE_LANDMARKS,
  POSE_LANDMARK_COUNT,
} from '../../../sports/pose/PoseAdapter';
import {
  computeJointAngleTable,
  angularVelocityDegPerS,
  jointAngleDeg,
} from '../../../sports/pose/jointAngles';
import {
  getSportProfile,
  type SportId,
} from '../../../sports/engine/sportProfile';
import { simulateBallFlight } from '../../../sports/engine/ballFlight';
import { BIOMECH_TARGETS } from '../targets';
import { samplePoseFrames } from '../morphMotion';

const L = POSE_LANDMARKS;
const SPORTS: SportId[] = ['soccer', 'basketball', 'tennis', 'pickleball'];

const frameAt = (sport: SportId, timestampMs: number) => {
  const track = BIOMECH_TARGETS[sport].referenceTrack;
  const kf = track.find((k) => k.timestampMs === timestampMs);
  if (!kf) {
    throw new Error(`no keyframe at ${timestampMs}ms`);
  }
  return { frameIndex: 0, timestampMs, keypoints: kf.keypoints };
};

describe('BIOMECH_TARGETS shape', () => {
  it.each(SPORTS)('%s has a well-formed cited target set', (sport) => {
    const t = BIOMECH_TARGETS[sport];
    expect(t.sport).toBe(sport);
    expect(t.referenceTrack.length).toBeGreaterThanOrEqual(3);
    for (const kf of t.referenceTrack) {
      expect(kf.keypoints).toHaveLength(POSE_LANDMARK_COUNT);
    }
    const first = t.referenceTrack[0]!.timestampMs;
    const last = t.referenceTrack[t.referenceTrack.length - 1]!.timestampMs;
    expect(t.contactTimestampMs).toBeGreaterThanOrEqual(first);
    expect(t.contactTimestampMs).toBeLessThanOrEqual(last);
    expect(t.metrics.length).toBeGreaterThan(0);
    for (const metric of t.metrics) {
      expect(metric.source.length).toBeGreaterThan(0);
      expect(metric.range[0]).toBeLessThan(metric.range[1]);
    }
    expect(t.perfectedLaunch.speedMps).toBeGreaterThan(
      0.9 * t.baselineLaunch.speedMps,
    );
  });

  it.each(SPORTS)('%s perfected launch produces a plausible flight', (sport) => {
    const t = BIOMECH_TARGETS[sport];
    const flight = simulateBallFlight(
      t.perfectedLaunch,
      getSportProfile(sport).ball,
    );
    expect(flight.flightTimeS).toBeGreaterThan(0.2);
    expect(flight.rangeM).toBeGreaterThan(3);
    expect(flight.rangeM).toBeLessThan(60);
  });
});

describe('soccer expert track biomechanics', () => {
  const target = BIOMECH_TARGETS.soccer;

  it('holds the cited kicking-knee angle at contact', () => {
    const table = computeJointAngleTable(
      frameAt('soccer', target.contactTimestampMs),
    );
    expect(table.right.hipKnee).toBeGreaterThanOrEqual(140);
    expect(table.right.hipKnee).toBeLessThanOrEqual(165);
  });

  it('extends the knee at a skilled-kicker angular velocity into contact', () => {
    const frames = samplePoseFrames(target.referenceTrack, 120);
    const series = frames.map((f) => ({
      timestampMs: f.timestampMs,
      angleDeg: computeJointAngleTable(f).right.hipKnee,
    }));
    const velocity = angularVelocityDegPerS(series);
    let peak = 0;
    for (let i = 0; i < frames.length; i++) {
      const t = frames[i]!.timestampMs;
      if (t >= 380 && t <= target.contactTimestampMs) {
        peak = Math.max(peak, velocity[i]!);
      }
    }
    // Nunome et al. (2006): skilled instep kicks ~1400-2200 deg/s.
    expect(peak).toBeGreaterThanOrEqual(1000);
    expect(peak).toBeLessThanOrEqual(2600);
  });
});

describe('basketball expert track biomechanics', () => {
  const target = BIOMECH_TARGETS.basketball;

  it('sets the elbow at the cited 75-90 deg "L"', () => {
    const set = frameAt('basketball', 0);
    const angle = jointAngleDeg(
      set.keypoints[L.rightShoulder]!,
      set.keypoints[L.rightElbow]!,
      set.keypoints[L.rightWrist]!,
    );
    expect(angle).toBeGreaterThanOrEqual(75);
    expect(angle).toBeLessThanOrEqual(90);
  });

  it('releases inside the cited 45-52 deg window', () => {
    expect(target.perfectedLaunch.launchAngleDeg).toBeGreaterThanOrEqual(45);
    expect(target.perfectedLaunch.launchAngleDeg).toBeLessThanOrEqual(52);
    const releaseMetric = target.metrics.find((m) => m.id === 'release-angle')!;
    expect(releaseMetric.range).toEqual([45, 52]);
  });
});

describe.each(['tennis', 'pickleball'] as const)(
  '%s expert track biomechanics',
  (sport) => {
    it('extends the hitting arm at contact', () => {
      const target = BIOMECH_TARGETS[sport];
      const contact = frameAt(sport, target.contactTimestampMs);
      const angle = jointAngleDeg(
        contact.keypoints[L.rightShoulder]!,
        contact.keypoints[L.rightElbow]!,
        contact.keypoints[L.rightWrist]!,
      );
      expect(angle).toBeGreaterThanOrEqual(150);
      expect(angle).toBeLessThanOrEqual(180);
    });
  },
);

describe('pickleball proxies', () => {
  it('flags its targets as ported tennis proxies', () => {
    for (const metric of BIOMECH_TARGETS.pickleball.metrics) {
      expect(metric.source).toMatch(/proxy/i);
    }
  });
});
