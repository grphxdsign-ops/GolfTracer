/**
 * Slow-motion time-base reconciliation.
 *
 * Slow-motion containers store high-fps footage remuxed at normal playback
 * fps: a 240fps clip in a 30fps container plays 8x slower than reality, so
 * 1000ms of media time is only 125ms of real time. Any time-base error here
 * directly corrupts downstream velocity estimates, so everything that does
 * physics must go through these helpers.
 */
import type { VideoAsset } from '../../../types/media';

/**
 * Ratio of real time to media time: realMs = mediaMs * factor.
 * 1 for normal video; 30/240 = 0.125 for 240fps-in-30fps slow-mo.
 */
export function slowMotionFactor(asset: VideoAsset): number {
  const recordedFps = asset.recordedFps ?? asset.fps;
  if (recordedFps <= 0 || asset.fps <= 0) {
    return 1;
  }
  return asset.fps / recordedFps;
}

export interface NormalizedTimestamps {
  /** realMs per mediaMs (see slowMotionFactor). */
  factor: number;
  /** Real-world duration of the clip in ms. */
  realDurationMs: number;
  toRealMs(mediaMs: number): number;
  toMediaMs(realMs: number): number;
}

/** Build a media-time ⇄ real-time mapper for an asset. */
export function normalizeTimestamps(asset: VideoAsset): NormalizedTimestamps {
  const factor = slowMotionFactor(asset);
  return {
    factor,
    realDurationMs: asset.durationMs * factor,
    toRealMs: (mediaMs) => mediaMs * factor,
    toMediaMs: (realMs) => realMs / factor,
  };
}

/**
 * Frames captured per *real* second — the sampling rate the tracking module
 * should adapt to. Equals recordedFps for slow-mo clips, container fps
 * otherwise.
 */
export function effectiveSamplingRate(asset: VideoAsset): number {
  return asset.recordedFps ?? asset.fps;
}
