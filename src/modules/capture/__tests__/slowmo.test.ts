import type { VideoAsset } from '../../../types/media';
import {
  effectiveSamplingRate,
  normalizeTimestamps,
  slowMotionFactor,
} from '../logic/slowmo';

const asset = (overrides: Partial<VideoAsset> = {}): VideoAsset => ({
  id: 'a',
  uri: 'file:///a.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
  durationMs: 10000,
  rotationDeg: 0,
  isSlowMotion: false,
  source: 'imported',
  createdAt: 0,
  ...overrides,
});

describe('slow-motion normalization', () => {
  it('maps 1000ms media time to 125ms real time for 240fps in a 30fps container', () => {
    const slowmo = asset({ fps: 30, recordedFps: 240, isSlowMotion: true });
    const n = normalizeTimestamps(slowmo);
    expect(n.factor).toBeCloseTo(0.125, 10);
    expect(n.toRealMs(1000)).toBeCloseTo(125, 10);
  });

  it('round-trips media and real time', () => {
    const n = normalizeTimestamps(asset({ fps: 30, recordedFps: 120 }));
    expect(n.toMediaMs(n.toRealMs(3737))).toBeCloseTo(3737, 8);
  });

  it('reports real duration of a slow-mo clip', () => {
    // 40s of media at 30fps holding 240fps footage = 5s of reality.
    const n = normalizeTimestamps(
      asset({ fps: 30, recordedFps: 240, durationMs: 40000 }),
    );
    expect(n.realDurationMs).toBeCloseTo(5000, 8);
  });

  it('is the identity for normal video (recordedFps absent)', () => {
    const n = normalizeTimestamps(asset());
    expect(n.factor).toBe(1);
    expect(n.toRealMs(4321)).toBe(4321);
  });

  it('is the identity when recordedFps equals container fps', () => {
    expect(slowMotionFactor(asset({ fps: 60, recordedFps: 60 }))).toBe(1);
  });

  it('exposes effective sampling rate for the tracker', () => {
    expect(effectiveSamplingRate(asset({ fps: 30, recordedFps: 240 }))).toBe(240);
    expect(effectiveSamplingRate(asset({ fps: 60 }))).toBe(60);
  });
});
