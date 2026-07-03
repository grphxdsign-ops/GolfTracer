/**
 * Video exporter adapter — the seam where an on-device encoder turns the
 * dummy renderer's geometric frame sequence into a real video file,
 * mirroring the detector/pose adapter pattern (pure-TS fake for tests +
 * rejecting native stub documenting the real backend).
 *
 * On-device upgrade path (NativeVideoExporter):
 *  - Rasterize each RenderedFrame's circles/lines to an offscreen Skia
 *    surface (@shopify/react-native-skia `Skia.Surface.MakeOffscreen` +
 *    `makeImageSnapshot`), or drive a react-three-fiber/native (expo-gl)
 *    scene for a shaded 3D dummy and read back the GL framebuffer.
 *  - Feed the RGBA frames to a hardware encoder: AVAssetWriter with
 *    AVAssetWriterInputPixelBufferAdaptor on iOS, MediaCodec + MediaMuxer
 *    on Android (or ffmpeg-kit as a portable software fallback), at the
 *    requested fps, and resolve with the muxed .mp4 file URI.
 */
import type { RenderedFrame } from '../render/dummyRenderer';

export interface VideoExportRequest {
  /** Frames in presentation order (timestamps must not decrease). */
  frames: RenderedFrame[];
  fps: number;
  widthPx: number;
  heightPx: number;
}

export interface ExportedVideo {
  frameCount: number;
  durationMs: number;
  widthPx: number;
  heightPx: number;
  fps: number;
  mimeType: string;
  /** Encoded payload (fake: serialized frames; native: file contents ref). */
  buffer: Uint8Array;
  /** File URI when the backend writes to disk (native only). */
  uri?: string;
}

export interface VideoExporter {
  exportVideo(request: VideoExportRequest): Promise<ExportedVideo>;
}

function validateRequest(request: VideoExportRequest): void {
  if (request.frames.length === 0) {
    throw new Error('exportVideo needs at least one frame');
  }
  if (request.fps <= 0) {
    throw new Error(`fps must be positive: ${request.fps}`);
  }
  for (let i = 1; i < request.frames.length; i++) {
    if (request.frames[i]!.timestampMs < request.frames[i - 1]!.timestampMs) {
      throw new Error(
        `frame timestamps must not decrease (frame ${i} at ` +
          `${request.frames[i]!.timestampMs}ms after ` +
          `${request.frames[i - 1]!.timestampMs}ms)`,
      );
    }
  }
}

const asciiBytes = (text: string): Uint8Array => {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  return bytes;
};

/**
 * FakeVideoExporter — deterministic pure-TS exporter: serializes the frame
 * sequence (order-preserving, one JSON line per frame) into the buffer so
 * tests can assert frame count and ordering by decoding it back.
 */
export class FakeVideoExporter implements VideoExporter {
  /** Every export this instance has performed, in call order. */
  readonly exports: ExportedVideo[] = [];

  exportVideo(request: VideoExportRequest): Promise<ExportedVideo> {
    try {
      validateRequest(request);
    } catch (error) {
      return Promise.reject(error);
    }
    const lines = request.frames.map((frame) =>
      JSON.stringify({
        index: frame.index,
        timestampMs: frame.timestampMs,
        shapeCount: frame.shapes.length,
      }),
    );
    const first = request.frames[0]!;
    const last = request.frames[request.frames.length - 1]!;
    const exported: ExportedVideo = {
      frameCount: request.frames.length,
      durationMs: last.timestampMs - first.timestampMs,
      widthPx: request.widthPx,
      heightPx: request.heightPx,
      fps: request.fps,
      mimeType: 'application/x-fake-video',
      buffer: asciiBytes(lines.join('\n')),
    };
    this.exports.push(exported);
    return Promise.resolve(exported);
  }
}

export const NATIVE_VIDEO_EXPORTER_ERROR =
  'NativeVideoExporter requires device runtime (Skia offscreen surface / ' +
  'r3f-native rasterization + AVAssetWriter / MediaCodec encode); use ' +
  'FakeVideoExporter in this environment';

export class NativeVideoExporter implements VideoExporter {
  exportVideo(_request: VideoExportRequest): Promise<ExportedVideo> {
    return Promise.reject(new Error(NATIVE_VIDEO_EXPORTER_ERROR));
  }
}

export type VideoExporterKind = 'fake' | 'native';

export function createVideoExporter(
  kind: VideoExporterKind = 'fake',
): VideoExporter {
  switch (kind) {
    case 'native':
      return new NativeVideoExporter();
    case 'fake':
      return new FakeVideoExporter();
  }
}

/** Decode a FakeVideoExporter buffer back into its frame summaries. */
export function decodeFakeVideoBuffer(
  buffer: Uint8Array,
): { index: number; timestampMs: number; shapeCount: number }[] {
  let text = '';
  for (let i = 0; i < buffer.length; i++) {
    text += String.fromCharCode(buffer[i]!);
  }
  return text.split('\n').map((line) => {
    const parsed: unknown = JSON.parse(line);
    return parsed as { index: number; timestampMs: number; shapeCount: number };
  });
}
