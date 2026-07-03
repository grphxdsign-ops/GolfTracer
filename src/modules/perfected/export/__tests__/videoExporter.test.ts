/**
 * Video exporter tests: the fake preserves frame count and ordering in its
 * serialized buffer, validates its input, and the native stub honestly
 * rejects off-device.
 */
import {
  FakeVideoExporter,
  NativeVideoExporter,
  NATIVE_VIDEO_EXPORTER_ERROR,
  createVideoExporter,
  decodeFakeVideoBuffer,
} from '../VideoExporter';
import type { RenderedFrame } from '../../render/dummyRenderer';

const makeFrames = (count: number): RenderedFrame[] =>
  Array.from({ length: count }, (_, i) => ({
    index: i,
    timestampMs: i * 33,
    widthPx: 640,
    heightPx: 360,
    shapes: [
      { kind: 'circle', role: 'ball', cx: 10 + i, cy: 20, r: 5 },
      { kind: 'line', role: 'flight', x1: 0, y1: 0, x2: i, y2: i },
    ],
  }));

describe('FakeVideoExporter', () => {
  it('exports every frame in order', async () => {
    const exporter = new FakeVideoExporter();
    const frames = makeFrames(12);
    const video = await exporter.exportVideo({
      frames,
      fps: 30,
      widthPx: 640,
      heightPx: 360,
    });

    expect(video.frameCount).toBe(12);
    expect(video.durationMs).toBe(11 * 33);
    expect(video.fps).toBe(30);
    expect(exporter.exports).toHaveLength(1);

    const decoded = decodeFakeVideoBuffer(video.buffer);
    expect(decoded).toHaveLength(12);
    decoded.forEach((entry, i) => {
      expect(entry.index).toBe(i);
      expect(entry.timestampMs).toBe(i * 33);
      expect(entry.shapeCount).toBe(2);
    });
  });

  it('rejects an empty frame list', async () => {
    const exporter = new FakeVideoExporter();
    await expect(
      exporter.exportVideo({ frames: [], fps: 30, widthPx: 640, heightPx: 360 }),
    ).rejects.toThrow(/at least one frame/);
  });

  it('rejects out-of-order timestamps', async () => {
    const exporter = new FakeVideoExporter();
    const frames = makeFrames(3);
    frames[2] = { ...frames[2]!, timestampMs: 10 };
    await expect(
      exporter.exportVideo({ frames, fps: 30, widthPx: 640, heightPx: 360 }),
    ).rejects.toThrow(/must not decrease/);
  });

  it('rejects a non-positive fps', async () => {
    const exporter = new FakeVideoExporter();
    await expect(
      exporter.exportVideo({
        frames: makeFrames(2),
        fps: 0,
        widthPx: 640,
        heightPx: 360,
      }),
    ).rejects.toThrow(/fps must be positive/);
  });
});

describe('NativeVideoExporter', () => {
  it('rejects off-device with the documented error', async () => {
    const exporter = new NativeVideoExporter();
    await expect(
      exporter.exportVideo({
        frames: makeFrames(1),
        fps: 30,
        widthPx: 640,
        heightPx: 360,
      }),
    ).rejects.toThrow(NATIVE_VIDEO_EXPORTER_ERROR);
  });
});

describe('createVideoExporter', () => {
  it('builds the requested adapter', () => {
    expect(createVideoExporter('fake')).toBeInstanceOf(FakeVideoExporter);
    expect(createVideoExporter('native')).toBeInstanceOf(NativeVideoExporter);
    expect(createVideoExporter()).toBeInstanceOf(FakeVideoExporter);
  });
});
