/**
 * Detector adapter — the seam where a native/ML detector implementation can
 * replace the pure-TS classical one without touching the tracking pipeline.
 *
 * Everything upstream depends only on the shared BallDetector interface from
 * src/types/tracking.ts; `createDetector` is the single switch point.
 */
import type { BallDetector } from '../../types/tracking';
import {
  ClassicalBallDetector,
  type ClassicalDetectorOptions,
} from '../../modules/tracking/vision/classicalDetector';
import { TfliteBallDetector } from '../../modules/tracking/vision/tfliteDetector';

export type DetectorKind = 'classical' | 'tflite';

export function createDetector(
  kind: DetectorKind = 'classical',
  options: ClassicalDetectorOptions = {},
): BallDetector {
  switch (kind) {
    case 'tflite':
      return new TfliteBallDetector();
    case 'classical':
      return new ClassicalBallDetector(options);
  }
}

export { ClassicalBallDetector, TfliteBallDetector };
export type { ClassicalDetectorOptions };
