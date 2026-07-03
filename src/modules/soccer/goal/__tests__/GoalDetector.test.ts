import type { VideoFrame } from '../../../../types/media';
import {
  FakeGoalDetector,
  TfliteGoalDetector,
  cornersById,
  createGoalDetector,
  type GoalDetection,
} from '../GoalDetector';

function frame(index = 0): VideoFrame {
  return { index, timestampMs: index * 10, width: 8, height: 6, luma: new Uint8Array(48) };
}

function detection(): GoalDetection {
  return {
    corners: [
      { corner: 'bottomLeft', cx: 100, cy: 200, halfSizePx: 5, confidence: 0.9 },
      { corner: 'bottomRight', cx: 300, cy: 200, halfSizePx: 5, confidence: 0.9 },
      { corner: 'topLeft', cx: 100, cy: 120, halfSizePx: 5, confidence: 0.9 },
      { corner: 'topRight', cx: 300, cy: 120, halfSizePx: 5, confidence: 0.9 },
    ],
  };
}

describe('FakeGoalDetector', () => {
  it('returns a static scripted detection for every frame', async () => {
    const fake = new FakeGoalDetector(detection());
    await expect(fake.detect(frame(0))).resolves.toEqual(detection());
    await expect(fake.detect(frame(42))).resolves.toEqual(detection());
  });

  it('supports per-frame scripted functions (goal not always visible)', async () => {
    const fake = new FakeGoalDetector((f) => (f.index < 5 ? null : detection()));
    await expect(fake.detect(frame(0))).resolves.toBeNull();
    await expect(fake.detect(frame(9))).resolves.toEqual(detection());
  });
});

describe('createGoalDetector', () => {
  it('builds a fake from a scripted detection', async () => {
    const det = createGoalDetector('fake', detection());
    await expect(det.detect(frame())).resolves.toEqual(detection());
  });

  it("requires scripted data for 'fake'", () => {
    expect(() => createGoalDetector('fake')).toThrow(/scripted/);
  });

  it('returns the rejecting device stub for tflite', async () => {
    const det = createGoalDetector('tflite');
    expect(det).toBeInstanceOf(TfliteGoalDetector);
    await expect(det.detect(frame())).rejects.toThrow(/device runtime/);
  });
});

describe('cornersById', () => {
  it('keys all four corners', () => {
    const byId = cornersById(detection());
    expect(byId.bottomLeft.cx).toBe(100);
    expect(byId.topRight.cy).toBe(120);
  });

  it('throws a descriptive error when a corner is missing', () => {
    const partial: GoalDetection = { corners: detection().corners.slice(0, 3) };
    expect(() => cornersById(partial)).toThrow(/missing the topRight corner/);
  });
});
