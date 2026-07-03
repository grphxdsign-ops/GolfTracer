import type { VideoAsset, VideoFrame } from '../../../types/media';
import { NATIVE_FRAME_SOURCE_ERROR, NativeFrameSource } from '../NativeFrameSource';
import type {
  FrameDecoderNativeModule,
  NativeFrame,
  NativeFrameBatch,
} from '../FrameDecoderNativeModule';

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

describe('NativeFrameSource with an injected native module', () => {
  const SESSION_ID = 'session-1';

  const nativeFrame = (index: number, lumaBase64 = 'AAEC/w=='): NativeFrame => ({
    index,
    timestampMs: (index * 1000) / asset.fps,
    width: 2,
    height: 2,
    lumaBase64,
  });

  interface FakeModule extends FrameDecoderNativeModule {
    openSession: jest.Mock;
    nextFrames: jest.Mock;
    closeSession: jest.Mock;
    frameAt: jest.Mock;
  }

  const makeModule = (batches: NativeFrameBatch[]): FakeModule => {
    let call = 0;
    return {
      openSession: jest.fn().mockResolvedValue({
        sessionId: SESSION_ID,
        width: 2,
        height: 2,
        durationMs: asset.durationMs,
        nominalFps: asset.fps,
        rotationDeg: 0,
      }),
      nextFrames: jest.fn().mockImplementation(() => {
        const batch = batches[call];
        call += 1;
        return batch
          ? Promise.resolve(batch)
          : Promise.reject(new Error('nextFrames called past the last batch'));
      }),
      closeSession: jest.fn().mockResolvedValue(undefined),
      frameAt: jest.fn().mockResolvedValue(nativeFrame(0)),
    };
  };

  const collect = async (iterable: AsyncIterable<VideoFrame>): Promise<VideoFrame[]> => {
    const out: VideoFrame[] = [];
    for await (const frame of iterable) {
      out.push(frame);
    }
    return out;
  };

  it('forwards the range and asset fps to openSession', async () => {
    const module = makeModule([{ frames: [], done: true }]);
    const source = new NativeFrameSource(asset, module);
    await collect(
      source.frames({ startMs: 100, endMs: 900, stride: 2, targetWidth: 320 }),
    );
    expect(module.openSession).toHaveBeenCalledTimes(1);
    expect(module.openSession).toHaveBeenCalledWith(asset.uri, {
      startMs: 100,
      endMs: 900,
      stride: 2,
      targetWidth: 320,
      fps: 30,
    });
  });

  it('omits unset range keys, sending only fps', async () => {
    const module = makeModule([{ frames: [], done: true }]);
    const source = new NativeFrameSource(asset, module);
    await collect(source.frames());
    const [, options] = module.openSession.mock.calls[0] as [string, object];
    expect(Object.keys(options)).toEqual(['fps']);
    expect(options).toEqual({ fps: 30 });
  });

  it('pulls batches until done and maps frames with decoded luma', async () => {
    const module = makeModule([
      { frames: [nativeFrame(0), nativeFrame(1)], done: false },
      { frames: [nativeFrame(2)], done: true },
    ]);
    const source = new NativeFrameSource(asset, module);
    const frames = await collect(source.frames());

    expect(frames.map((f) => f.index)).toEqual([0, 1, 2]);
    expect(frames.map((f) => f.timestampMs)).toEqual([0, 1000 / 30, 2000 / 30]);
    for (const frame of frames) {
      expect(frame.width).toBe(2);
      expect(frame.height).toBe(2);
      expect(frame.luma).toEqual(new Uint8Array([0, 1, 2, 255]));
    }
    expect(module.nextFrames).toHaveBeenCalledTimes(2);
    expect(module.nextFrames).toHaveBeenCalledWith(SESSION_ID, 6);
  });

  it('closes the session exactly once after normal completion', async () => {
    const module = makeModule([{ frames: [nativeFrame(0)], done: true }]);
    const source = new NativeFrameSource(asset, module);
    await collect(source.frames());
    expect(module.closeSession).toHaveBeenCalledTimes(1);
    expect(module.closeSession).toHaveBeenCalledWith(SESSION_ID);
  });

  it('closes the session exactly once after an early break (cancellation)', async () => {
    const module = makeModule([
      { frames: [nativeFrame(0), nativeFrame(1)], done: false },
      { frames: [nativeFrame(2)], done: true },
    ]);
    const source = new NativeFrameSource(asset, module);
    for await (const frame of source.frames()) {
      expect(frame.index).toBe(0);
      break; // early exit — iterator return() must trigger the finally
    }
    expect(module.closeSession).toHaveBeenCalledTimes(1);
    expect(module.closeSession).toHaveBeenCalledWith(SESSION_ID);
    expect(module.nextFrames).toHaveBeenCalledTimes(1);
  });

  it('propagates nextFrames rejections and still closes the session', async () => {
    const module = makeModule([{ frames: [nativeFrame(0)], done: false }]);
    module.nextFrames
      .mockReset()
      .mockRejectedValue(
        Object.assign(new Error('decoder blew up'), { code: 'E_DECODE_FAILED' }),
      );
    const source = new NativeFrameSource(asset, module);
    await expect(collect(source.frames())).rejects.toThrow('decoder blew up');
    expect(module.closeSession).toHaveBeenCalledTimes(1);
    expect(module.closeSession).toHaveBeenCalledWith(SESSION_ID);
  });

  it('swallows closeSession errors after successful iteration', async () => {
    const module = makeModule([{ frames: [nativeFrame(0)], done: true }]);
    module.closeSession.mockRejectedValue(new Error('close failed'));
    const source = new NativeFrameSource(asset, module);
    const frames = await collect(source.frames());
    expect(frames).toHaveLength(1);
  });

  it('frameAt sends the 0 sentinel when targetWidth is unset and maps the result', async () => {
    const module = makeModule([]);
    module.frameAt.mockResolvedValue(nativeFrame(3));
    const source = new NativeFrameSource(asset, module);

    const frame = await source.frameAt(100);
    expect(module.frameAt).toHaveBeenCalledWith(asset.uri, 100, 0, 30);
    expect(frame).toEqual({
      index: 3,
      timestampMs: 3000 / 30,
      width: 2,
      height: 2,
      luma: new Uint8Array([0, 1, 2, 255]),
    });
  });

  it('frameAt forwards an explicit targetWidth', async () => {
    const module = makeModule([]);
    const source = new NativeFrameSource(asset, module);
    await source.frameAt(2500, 320);
    expect(module.frameAt).toHaveBeenCalledWith(asset.uri, 2500, 320, 30);
  });
});
