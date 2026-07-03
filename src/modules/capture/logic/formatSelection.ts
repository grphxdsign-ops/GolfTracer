/**
 * Pure capture-format selection.
 *
 * Strategy (from Shot Tracer research): the ball leaves the face at
 * 100–170+ mph, so higher capture fps materially improves tracking — pick
 * the format maximizing fps up to the preference (240 → 120 → 60 → 30
 * fallback), tie-break by resolution closest to the preferred height, and
 * reject HDR outright (HDR tone-mapping corrupts tracer output).
 */
import type { CaptureFormatPreference } from '../../../types/media';
import type {
  CaptureFormat,
  DeviceCaptureCapabilities,
} from '../../../adapters/camera/CameraAdapter';

export const FPS_LADDER: readonly number[] = [240, 120, 60, 30];

/**
 * Default capture preference: chase 240fps for slow-mo strobe analysis but
 * accept anything down to the 1080p30 fast path.
 */
export const DEFAULT_CAPTURE_PREFERENCE: CaptureFormatPreference = {
  preferFps: 240,
  minFps: 30,
  preferHeight: 1080,
};

export interface SelectedCaptureFormat {
  format: CaptureFormat;
  width: number;
  height: number;
  /** The fps to record at (a ladder tier, not the format's raw maxFps). */
  fps: number;
}

function pickByHeight(
  candidates: CaptureFormat[],
  preferHeight: number,
): CaptureFormat | null {
  let best: CaptureFormat | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const format of candidates) {
    const delta = Math.abs(format.height - preferHeight);
    if (
      best === null ||
      delta < bestDelta ||
      // Equal distance from the target: prefer the larger frame.
      (delta === bestDelta && format.height > best.height)
    ) {
      best = format;
      bestDelta = delta;
    }
  }
  return best;
}

/**
 * Returns the best recordable format for the preference, or null when no
 * non-HDR format reaches `pref.minFps`.
 */
export function selectCaptureFormat(
  caps: DeviceCaptureCapabilities,
  pref: CaptureFormatPreference,
): SelectedCaptureFormat | null {
  // HDR corrupts tracer output — HDR-flagged formats are never eligible.
  const eligible = caps.formats.filter((f) => !f.supportsHdr);

  let tiers = FPS_LADDER.filter((t) => t <= pref.preferFps && t >= pref.minFps);
  if (tiers.length === 0) {
    // Preference sits below/outside the ladder; try the raw preference.
    tiers = pref.preferFps >= pref.minFps ? [pref.preferFps] : [];
  }

  for (const tier of tiers) {
    const candidates = eligible.filter((f) => f.maxFps >= tier);
    const best = pickByHeight(candidates, pref.preferHeight);
    if (best !== null) {
      return { format: best, width: best.width, height: best.height, fps: tier };
    }
  }
  return null;
}
