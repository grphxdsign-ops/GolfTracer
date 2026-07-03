/** Shared canned fixtures for screen tests. */
import type { FrameSource, VideoAsset } from '../../../types/media';
import type {
  TrackingResult,
  TrackPoint,
  TrackQuality,
} from '../../../types/tracking';
import { DEFAULT_TRACER_STYLE } from '../tracker/tracerGeometry';

export function cannedResult(quality: TrackQuality = 'high'): TrackingResult {
  const points: TrackPoint[] = [];
  for (let i = 0; i < 30; i++) {
    points.push({
      timestampMs: i * 10,
      x: 100 + 5 * i,
      y: 200 - 8 * i + 0.2 * i * i,
      interpolated: false,
    });
  }
  return {
    track: {
      observations: [],
      smoothedPath: points,
      impactFrameIndex: 5,
      impactTimestampMs: 50,
      apexPointIndex: 20,
      landingPointIndex: 29,
      frameWidth: 480,
      frameHeight: 270,
      quality,
    },
    tracer: {
      points,
      apexIndex: 20,
      style: { ...DEFAULT_TRACER_STYLE },
    },
  };
}

export function cannedAsset(): VideoAsset {
  return {
    id: 'test-video',
    uri: 'file://test.mov',
    width: 1920,
    height: 1080,
    fps: 120,
    durationMs: 1500,
    rotationDeg: 0,
    isSlowMotion: true,
    source: 'imported',
    createdAt: 0,
  };
}

export function cannedFrameSource(): FrameSource {
  return {
    asset: cannedAsset(),
    async *frames() {
      throw new Error('not used in screen tests');
    },
    frameAt() {
      return Promise.reject(new Error('not used in screen tests'));
    },
  };
}
