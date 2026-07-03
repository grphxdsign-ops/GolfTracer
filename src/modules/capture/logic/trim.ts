/**
 * Trim-window math for the Review screen.
 *
 * Research note: the tracer needs 8+ seconds of footage after impact to see
 * the full ball flight, plus a little pre-impact run-up for impact detection
 * — hence the default (impact - 2s, impact + 9s) window.
 */

export const PRE_IMPACT_MS = 2000;
export const POST_IMPACT_MS = 9000;
/** Smallest useful trim window. */
export const MIN_TRIM_SPAN_MS = 500;

export interface TrimWindow {
  startMs: number;
  endMs: number;
}

/**
 * Default trim window around an impact guess, clamped to the clip. Without a
 * guess, impact is assumed early in the clip (recording usually starts just
 * before the swing).
 */
export function computeTrimWindow(
  durationMs: number,
  impactGuessMs?: number,
): TrimWindow {
  const duration = Math.max(0, durationMs);
  const guess = Math.max(
    0,
    Math.min(duration, impactGuessMs ?? Math.min(PRE_IMPACT_MS, duration / 2)),
  );
  return {
    startMs: Math.max(0, guess - PRE_IMPACT_MS),
    endMs: Math.min(duration, guess + POST_IMPACT_MS),
  };
}

/**
 * Clamp a user-dragged trim window into the clip, preserving a minimum span
 * so the handles can never cross.
 */
export function clampTrimWindow(window: TrimWindow, durationMs: number): TrimWindow {
  const duration = Math.max(0, durationMs);
  const span = Math.min(MIN_TRIM_SPAN_MS, duration);
  let startMs = Math.max(0, Math.min(window.startMs, duration - span));
  let endMs = Math.min(duration, Math.max(window.endMs, span));
  if (endMs - startMs < span) {
    // Handles collided; anchor on the start handle.
    endMs = Math.min(duration, startMs + span);
    startMs = Math.max(0, endMs - span);
  }
  return { startMs, endMs };
}
