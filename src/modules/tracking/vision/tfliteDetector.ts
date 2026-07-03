/**
 * TFLite ball detector — device-runtime stub.
 *
 * Upgrade path (not available in the Linux CI environment):
 *  - Runtime: react-native-fast-tflite (JSI, zero-copy TensorFlow Lite).
 *  - Model: YOLOv8n fine-tuned on golf-ball crops (small-object anchors,
 *    ~640px input), exported INT8-quantized for mobile NPUs/GPU delegates.
 *  - Longer term: a TrackNet-family temporal heatmap net (3-frame stack) is
 *    the SOTA option for tiny, motion-blurred balls; the BallDetector
 *    interface stays frame+ROI shaped so that a stacked-frame detector can
 *    keep an internal frame buffer and slot in without tracker changes.
 *
 * On device the detector would crop the ROI, letterbox it to the model input,
 * run inference, and map box centers back to frame pixel coordinates with
 * confidence = objectness × class score.
 */
import type { VideoFrame } from '../../../types/media';
import type { BallDetector, BallObservation } from '../../../types/tracking';

export class TfliteBallDetector implements BallDetector {
  detect(
    _frame: VideoFrame,
    _roi?: { x: number; y: number; w: number; h: number },
  ): Promise<BallObservation[]> {
    return Promise.reject(
      new Error(
        'TfliteBallDetector requires device runtime (react-native-fast-tflite); ' +
          'use the classical detector in this environment',
      ),
    );
  }
}
