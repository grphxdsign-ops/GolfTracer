/**
 * Goal detector adapter — the seam where a native/ML goal-and-net detector
 * plugs in without touching the soccer analysis code, mirroring the
 * tfliteDetector.ts pattern.
 *
 * Device upgrade path (not available in the Linux CI environment):
 *  - Runtime: react-native-fast-tflite (JSI TensorFlow Lite).
 *  - Model: YOLOv8s fine-tuned on goal-frame imagery with a corner-keypoint
 *    head (classes: goal, net; keypoints: the four post/crossbar junctions),
 *    exported INT8 for mobile NPUs. Detection runs once on a stable frame
 *    (the goal doesn't move), corners are refined by line intersection of
 *    the post/crossbar edges inside each corner box.
 *
 * The four detected corner boxes anchor the metric world frame: their known
 * FIFA positions on the goal plane give the image→goal-plane homography.
 */
import type { VideoFrame } from '../../../types/media';

export type GoalCornerId = 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight';

export const GOAL_CORNER_IDS: readonly GoalCornerId[] = [
  'bottomLeft',
  'bottomRight',
  'topLeft',
  'topRight',
];

/** One detected goal-corner box (centre + half-size, image pixels). */
export interface GoalCornerBox {
  corner: GoalCornerId;
  cx: number;
  cy: number;
  halfSizePx: number;
  confidence: number;
}

export interface GoalDetection {
  /** All four corners, in GOAL_CORNER_IDS order. */
  corners: GoalCornerBox[];
}

export interface GoalDetector {
  /** Detect the goal frame in one video frame, or null when not visible. */
  detect(frame: VideoFrame): Promise<GoalDetection | null>;
}

export type ScriptedGoalDetection =
  | GoalDetection
  | ((frame: VideoFrame) => GoalDetection | null);

/** Pure-TS GoalDetector returning scripted goal-corner boxes (tests/demos). */
export class FakeGoalDetector implements GoalDetector {
  private readonly scripted: ScriptedGoalDetection;

  constructor(scripted: ScriptedGoalDetection) {
    this.scripted = scripted;
  }

  detect(frame: VideoFrame): Promise<GoalDetection | null> {
    if (typeof this.scripted === 'function') {
      return Promise.resolve(this.scripted(frame));
    }
    return Promise.resolve(this.scripted);
  }
}

/** Device-runtime stub for the fine-tuned YOLO goal/net detector. */
export class TfliteGoalDetector implements GoalDetector {
  detect(_frame: VideoFrame): Promise<GoalDetection | null> {
    return Promise.reject(
      new Error(
        'TfliteGoalDetector requires device runtime (react-native-fast-tflite ' +
          'with the fine-tuned YOLO goal/net model); inject a FakeGoalDetector ' +
          'in this environment',
      ),
    );
  }
}

export type GoalDetectorKind = 'tflite' | 'fake';

export function createGoalDetector(
  kind: GoalDetectorKind = 'tflite',
  scripted?: ScriptedGoalDetection,
): GoalDetector {
  switch (kind) {
    case 'fake':
      if (!scripted) {
        throw new Error("createGoalDetector('fake') needs a scripted detection");
      }
      return new FakeGoalDetector(scripted);
    case 'tflite':
      return new TfliteGoalDetector();
  }
}

/**
 * Validate a detection has all four distinct corners; returns them keyed by
 * corner id. Throws a descriptive error otherwise so screens can surface it.
 */
export function cornersById(
  detection: GoalDetection,
): Record<GoalCornerId, GoalCornerBox> {
  const map = new Map<GoalCornerId, GoalCornerBox>();
  for (const box of detection.corners) {
    map.set(box.corner, box);
  }
  for (const id of GOAL_CORNER_IDS) {
    if (!map.has(id)) {
      throw new Error(`Goal detection is missing the ${id} corner`);
    }
  }
  return {
    bottomLeft: map.get('bottomLeft')!,
    bottomRight: map.get('bottomRight')!,
    topLeft: map.get('topLeft')!,
    topRight: map.get('topRight')!,
  };
}
