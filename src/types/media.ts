/**
 * Media contracts — FROZEN after scaffold. Workstreams never edit this file.
 */

export type VideoSource = 'recorded' | 'imported';

export interface VideoAsset {
  id: string;
  uri: string;
  width: number;
  height: number;
  fps: number;
  recordedFps?: number;
  durationMs: number;
  rotationDeg: 0 | 90 | 180 | 270;
  isSlowMotion: boolean;
  source: VideoSource;
  createdAt: number;
}

export interface VideoFrame {
  index: number;
  timestampMs: number;
  width: number;
  height: number;
  /** Row-major grayscale, width*height bytes. */
  luma: Uint8Array;
}

export interface FrameRange {
  startMs?: number;
  endMs?: number;
  stride?: number;
  targetWidth?: number;
}

export interface FrameSource {
  readonly asset: VideoAsset;
  frames(range?: FrameRange): AsyncIterable<VideoFrame>;
  frameAt(timestampMs: number, targetWidth?: number): Promise<VideoFrame>;
}

export interface CaptureFormatPreference {
  preferFps: number;
  minFps: number;
  preferHeight: number;
}
