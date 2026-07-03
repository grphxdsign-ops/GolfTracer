import type { VideoFrame } from '../../../types/media';
import { SyntheticFrameSource, type DiscPath } from '../SyntheticFrameSource';

const collect = async (iterable: AsyncIterable<VideoFrame>): Promise<VideoFrame[]> => {
  const out: VideoFrame[] = [];
  for await (const frame of iterable) {
    out.push(frame);
  }
  return out;
};

const lumaAt = (frame: VideoFrame, x: number, y: number): number =>
  frame.luma[y * frame.width + x] ?? -1;

describe('SyntheticFrameSource', () => {
  it('yields the correct frame count and timestamps', async () => {
    const source = new SyntheticFrameSource({ fps: 100, durationMs: 100 });
    const frames = await collect(source.frames());
    expect(frames).toHaveLength(10);
    expect(frames.map((f) => f.timestampMs)).toEqual([
      0, 10, 20, 30, 40, 50, 60, 70, 80, 90,
    ]);
    expect(frames.map((f) => f.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('honours startMs/endMs/stride in a range', async () => {
    const source = new SyntheticFrameSource({ fps: 100, durationMs: 200 });
    const frames = await collect(source.frames({ startMs: 50, endMs: 120, stride: 2 }));
    expect(frames.map((f) => f.timestampMs)).toEqual([50, 70, 90, 110]);
  });

  it('renders the background gradient from top to bottom luma', async () => {
    const source = new SyntheticFrameSource({
      width: 8,
      height: 5,
      fps: 10,
      durationMs: 100,
      gradientTopLuma: 40,
      gradientBottomLuma: 120,
    });
    const frame = await source.frameAt(0);
    expect(lumaAt(frame, 0, 0)).toBe(40);
    expect(lumaAt(frame, 7, 4)).toBe(120);
    expect(lumaAt(frame, 3, 2)).toBe(80); // midway
  });

  it('draws the moving disc at the position given by the path', async () => {
    const path: DiscPath = (t) => ({ x: 10 + t / 10, y: 20, r: 3 });
    const source = new SyntheticFrameSource({
      width: 64,
      height: 48,
      fps: 100,
      durationMs: 200,
      gradientTopLuma: 0,
      gradientBottomLuma: 0,
      discLuma: 255,
      discPath: path,
    });
    // At t=0 the disc is at (10, 20).
    const f0 = await source.frameAt(0);
    expect(lumaAt(f0, 10, 20)).toBe(255);
    expect(lumaAt(f0, 10 + 5, 20)).toBe(0); // outside radius
    // At t=100ms the disc has moved to (20, 20).
    const f10 = await source.frameAt(100);
    expect(lumaAt(f10, 20, 20)).toBe(255);
    expect(lumaAt(f10, 10, 20)).toBe(0); // old position now background
  });

  it('hides the disc when the path returns null', async () => {
    const source = new SyntheticFrameSource({
      width: 16,
      height: 16,
      gradientTopLuma: 7,
      gradientBottomLuma: 7,
      discPath: (t) => (t < 50 ? { x: 8, y: 8, r: 2 } : null),
      fps: 10,
      durationMs: 1000,
    });
    const visible = await source.frameAt(0);
    expect(lumaAt(visible, 8, 8)).toBe(250);
    const hidden = await source.frameAt(500);
    expect(lumaAt(hidden, 8, 8)).toBe(7);
  });

  it('scales frames and disc positions to targetWidth', async () => {
    const source = new SyntheticFrameSource({
      width: 100,
      height: 50,
      fps: 10,
      durationMs: 100,
      gradientTopLuma: 0,
      gradientBottomLuma: 0,
      discPath: () => ({ x: 40, y: 20, r: 6 }),
    });
    const frame = await source.frameAt(0, 50);
    expect(frame.width).toBe(50);
    expect(frame.height).toBe(25);
    expect(frame.luma).toHaveLength(50 * 25);
    expect(lumaAt(frame, 20, 10)).toBe(250); // disc centre scaled by 0.5
  });

  it('clamps frameAt to the clip bounds', async () => {
    const source = new SyntheticFrameSource({ fps: 10, durationMs: 1000 });
    const first = await source.frameAt(-100);
    expect(first.index).toBe(0);
    const last = await source.frameAt(99999);
    expect(last.index).toBe(source.frameCount - 1);
  });

  it('exposes a coherent VideoAsset', () => {
    const source = new SyntheticFrameSource({
      width: 320,
      height: 240,
      fps: 60,
      durationMs: 2000,
      asset: { id: 'demo' },
    });
    expect(source.asset).toMatchObject({
      id: 'demo',
      width: 320,
      height: 240,
      fps: 60,
      durationMs: 2000,
      rotationDeg: 0,
    });
    expect(source.frameCount).toBe(120);
  });
});
