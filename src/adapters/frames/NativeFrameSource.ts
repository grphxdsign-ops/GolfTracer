/**
 * NativeFrameSource — FrameSource backed by the "GolfTracerFrameDecoder"
 * NativeModule (classic bridge, identical contract on iOS and Android).
 *
 * Frames are pulled in small batches through a native decode session
 * (openSession → nextFrames → closeSession) so a long 240fps clip never
 * lives in memory at once. Native yields upright, downscaled grayscale
 * frames with raw media-timeline timestamps; slow-motion fps remapping
 * stays in JS (VideoAsset.fps/recordedFps).
 *
 * Outside a device runtime (Jest, dev sandboxes) the module is not
 * registered and every method rejects, matching the historical stub;
 * tests inject a fake module through the constructor instead.
 */
import type {
  FrameRange,
  FrameSource,
  VideoAsset,
  VideoFrame,
} from '../../types/media';
import { decodeBase64 } from './base64';
import {
  getFrameDecoder,
  type FrameDecoderNativeModule,
  type NativeFrame,
  type NativeOpenOptions,
} from './FrameDecoderNativeModule';

export const NATIVE_FRAME_SOURCE_ERROR =
  'NativeFrameSource requires device runtime';

const BATCH_SIZE = 6;

const toVideoFrame = (frame: NativeFrame): VideoFrame => ({
  index: frame.index,
  timestampMs: frame.timestampMs,
  width: frame.width,
  height: frame.height,
  luma: decodeBase64(frame.lumaBase64),
});

export class NativeFrameSource implements FrameSource {
  private readonly module: FrameDecoderNativeModule | null;

  constructor(
    readonly asset: VideoAsset,
    module: FrameDecoderNativeModule | null = getFrameDecoder(),
  ) {
    this.module = module;
  }

  frames(range?: FrameRange): AsyncIterable<VideoFrame> {
    const { module, asset } = this;
    if (module === null) {
      return {
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(new Error(NATIVE_FRAME_SOURCE_ERROR)),
        }),
      };
    }
    return (async function* () {
      const options: NativeOpenOptions = { fps: asset.fps };
      if (range?.startMs !== undefined) {
        options.startMs = range.startMs;
      }
      if (range?.endMs !== undefined) {
        options.endMs = range.endMs;
      }
      if (range?.stride !== undefined) {
        options.stride = range.stride;
      }
      if (range?.targetWidth !== undefined) {
        options.targetWidth = range.targetWidth;
      }
      const { sessionId } = await module.openSession(asset.uri, options);
      try {
        for (;;) {
          const batch = await module.nextFrames(sessionId, BATCH_SIZE);
          for (const frame of batch.frames) {
            yield toVideoFrame(frame);
          }
          if (batch.done) {
            return;
          }
        }
      } finally {
        // Also runs on early break/return/throw from the consumer, giving
        // cancellation; close errors are irrelevant at this point.
        await module.closeSession(sessionId).catch(() => undefined);
      }
    })();
  }

  async frameAt(timestampMs: number, targetWidth?: number): Promise<VideoFrame> {
    if (this.module === null) {
      throw new Error(NATIVE_FRAME_SOURCE_ERROR);
    }
    const frame = await this.module.frameAt(
      this.asset.uri,
      timestampMs,
      targetWidth ?? 0,
      this.asset.fps,
    );
    return toVideoFrame(frame);
  }
}
