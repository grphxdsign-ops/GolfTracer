import type { VideoFrame } from '../../../types/media';
import { SyntheticFrameSource } from '../SyntheticFrameSource';
import { TrimmedFrameSource } from '../TrimmedFrameSource';

const collect = async (iterable: AsyncIterable<VideoFrame>): Promise<VideoFrame[]> => {
  const out: VideoFrame[] = [];
  for await (const frame of iterable) {
    out.push(frame);
  }
  return out;
};

describe('TrimmedFrameSource', () => {
  const inner = new SyntheticFrameSource({ fps: 10, durationMs: 1000 });
  const trimmed = new TrimmedFrameSource(inner, { startMs: 200, endMs: 600 });

  it('passes the asset through unchanged (time-base and rotation intact)', () => {
    expect(trimmed.asset).toBe(inner.asset);
  });

  it('defaults iteration to the trim window, keeping original timestamps', async () => {
    const frames = await collect(trimmed.frames());
    expect(frames.map((f) => f.timestampMs)).toEqual([200, 300, 400, 500, 600]);
  });

  it('intersects an explicit range with the trim window', async () => {
    const frames = await collect(trimmed.frames({ startMs: 0, endMs: 400 }));
    expect(frames.map((f) => f.timestampMs)).toEqual([200, 300, 400]);
    const tail = await collect(trimmed.frames({ startMs: 500, endMs: 5000 }));
    expect(tail.map((f) => f.timestampMs)).toEqual([500, 600]);
  });

  it('clamps frameAt into the trim window', async () => {
    const before = await trimmed.frameAt(0);
    expect(before.timestampMs).toBe(200);
    const after = await trimmed.frameAt(999);
    expect(after.timestampMs).toBe(600);
    const inside = await trimmed.frameAt(400);
    expect(inside.timestampMs).toBe(400);
  });
});
