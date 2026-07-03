/**
 * Imported-video validation: reject clips the analysis pipeline cannot use,
 * with typed reasons the Import screen can display.
 */

export const MIN_DURATION_MS = 1500;
export const MAX_DURATION_MS = 60000;
export const MIN_FPS = 24;
export const SUPPORTED_ROTATIONS: readonly number[] = [0, 90, 180, 270];

export type ValidationIssueCode =
  | 'too-short'
  | 'too-long'
  | 'low-fps'
  | 'unsupported-rotation';

export interface ValidationIssue {
  code: ValidationIssueCode;
  message: string;
}

export interface ImportedVideoMeta {
  durationMs: number;
  fps: number;
  /** Raw rotation metadata in degrees; may be arbitrary for odd encoders. */
  rotationDeg: number;
  width: number;
  height: number;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; issues: ValidationIssue[] };

export function validateImportedVideo(meta: ImportedVideoMeta): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (meta.durationMs < MIN_DURATION_MS) {
    issues.push({
      code: 'too-short',
      message: `Video is too short (${(meta.durationMs / 1000).toFixed(1)}s). It must be at least ${MIN_DURATION_MS / 1000}s to capture the full ball flight.`,
    });
  } else if (meta.durationMs > MAX_DURATION_MS) {
    issues.push({
      code: 'too-long',
      message: `Video is too long (${Math.round(meta.durationMs / 1000)}s). Trim it to ${MAX_DURATION_MS / 1000}s or less before importing.`,
    });
  }

  if (meta.fps < MIN_FPS) {
    issues.push({
      code: 'low-fps',
      message: `Frame rate is too low (${meta.fps} fps). At least ${MIN_FPS} fps is needed to track the ball.`,
    });
  }

  if (!SUPPORTED_ROTATIONS.includes(meta.rotationDeg)) {
    issues.push({
      code: 'unsupported-rotation',
      message: `Unsupported rotation metadata (${meta.rotationDeg}°). Re-export the video with standard orientation.`,
    });
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
