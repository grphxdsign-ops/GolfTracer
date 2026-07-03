/**
 * Per-frame CURRENT SPEED and peak SHOT SPEED from world-frame displacement.
 *
 * Central differences over the 3D world positions give per-frame velocity;
 * a short moving average damps detector radius jitter (range noise dominates
 * because depth comes from the apparent diameter). The shot speed is the
 * series peak — for a kicked ball drag only decelerates it, so the peak sits
 * in the first few post-contact frames.
 */
import type { BallWorldPoint } from './ballWorld';

export const MPS_TO_KMH = 3.6;

export interface SpeedSample {
  frameIndex: number;
  timestampMs: number;
  speedMps: number;
  speedKmh: number;
}

export interface SpeedResult {
  series: SpeedSample[];
  shotSpeedMps: number;
  shotSpeedKmh: number;
  /** Index into `series` of the shot-speed peak. */
  peakIndex: number;
}

export interface SpeedOptions {
  /**
   * Media-time to real-time factor for slow-motion clips
   * (recordedFps / fps). Default 1 (media time == real time).
   */
  timeScale?: number;
  /** Moving-average window (odd, >= 1). Default 3. */
  smoothWindow?: number;
}

export function computeSpeed(
  world: BallWorldPoint[],
  options: SpeedOptions = {},
): SpeedResult {
  const timeScale = options.timeScale ?? 1;
  const window = Math.max(1, options.smoothWindow ?? 3);
  if (world.length < 2) {
    return { series: [], shotSpeedMps: 0, shotSpeedKmh: 0, peakIndex: -1 };
  }

  // Central differences (forward/backward at the ends).
  const raw: number[] = [];
  for (let i = 0; i < world.length; i++) {
    const a = world[Math.max(0, i - 1)]!;
    const b = world[Math.min(world.length - 1, i + 1)]!;
    const dtS = ((b.timestampMs - a.timestampMs) / 1000) * timeScale;
    if (dtS <= 0) {
      raw.push(0);
      continue;
    }
    const d = Math.hypot(b.xM - a.xM, b.yM - a.yM, b.zM - a.zM);
    raw.push(d / dtS);
  }

  const half = Math.floor(window / 2);
  const series: SpeedSample[] = world.map((p, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j < 0 || j >= raw.length) continue;
      sum += raw[j]!;
      n++;
    }
    const mps = n > 0 ? sum / n : 0;
    return {
      frameIndex: p.frameIndex,
      timestampMs: p.timestampMs,
      speedMps: mps,
      speedKmh: mps * MPS_TO_KMH,
    };
  });

  let peakIndex = 0;
  for (let i = 1; i < series.length; i++) {
    if (series[i]!.speedMps > series[peakIndex]!.speedMps) peakIndex = i;
  }
  const peak = series[peakIndex]!;
  return {
    series,
    shotSpeedMps: peak.speedMps,
    shotSpeedKmh: peak.speedKmh,
    peakIndex,
  };
}
