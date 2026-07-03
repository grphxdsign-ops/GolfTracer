import type { VideoAsset } from '../../../types/media';
import { NATIVE_FRAME_SOURCE_ERROR, NativeFrameSource } from '../NativeFrameSource';

const asset: VideoAsset = {
  id: 'native',
  uri: 'file:///video.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
  durationMs: 10000,
  rotationDeg: 90,
  isSlowMotion: false,
  source: 'recorded',
  createdAt: 0,
};

describe('NativeFrameSource', () => {
  it('exposes the asset (rotation metadata intact)', () => {
    const source = new NativeFrameSource(asset);
    expect(source.asset).toBe(asset);
    expect(source.asset.rotationDeg).toBe(90);
  });

  it('rejects frameAt outside a device runtime', async () => {
    const source = new NativeFrameSource(asset);
    await expect(source.frameAt(0)).rejects.toThrow(NATIVE_FRAME_SOURCE_ERROR);
  });

  it('rejects iteration outside a device runtime', async () => {
    const source = new NativeFrameSource(asset);
    const iterate = async () => {
      for await (const frame of source.frames()) {
        void frame;
      }
    };
    await expect(iterate()).rejects.toThrow('requires device runtime');
  });
});
