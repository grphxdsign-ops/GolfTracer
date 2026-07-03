/**
 * NativeFrameSource — placeholder FrameSource for real devices.
 *
 * The real implementation decodes grayscale frames from the video file on
 * the native side:
 *
 * - **Live capture** — a react-native-vision-camera frame processor (Worklets
 *   runtime) receives YUV frames; the Y plane is already the luma buffer this
 *   interface promises, so it is copied (optionally downscaled to
 *   `targetWidth`) into a `VideoFrame` per sample.
 * - **iOS files** — `AVAssetImageGenerator` (or `AVAssetReader` for
 *   sequential decode) yields CVPixelBuffers at requested timestamps; the
 *   luma plane of a kCVPixelFormatType_420YpCbCr8 buffer maps 1:1 onto
 *   `VideoFrame.luma`.
 * - **Android files** — `MediaCodec` + `MediaExtractor` decode into
 *   YUV_420_888 Images; plane 0 (Y) is copied out row by row honouring
 *   rowStride.
 *
 * All of that requires a device runtime, so in this Linux-verifiable
 * codebase every method rejects. Tests and demos use SyntheticFrameSource.
 */
import type {
  FrameRange,
  FrameSource,
  VideoAsset,
  VideoFrame,
} from '../../types/media';

export const NATIVE_FRAME_SOURCE_ERROR =
  'NativeFrameSource requires device runtime';

export class NativeFrameSource implements FrameSource {
  constructor(readonly asset: VideoAsset) {}

  frames(_range?: FrameRange): AsyncIterable<VideoFrame> {
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new Error(NATIVE_FRAME_SOURCE_ERROR)),
      }),
    };
  }

  frameAt(_timestampMs: number, _targetWidth?: number): Promise<VideoFrame> {
    return Promise.reject(new Error(NATIVE_FRAME_SOURCE_ERROR));
  }
}
