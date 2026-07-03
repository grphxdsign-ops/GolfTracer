/**
 * TypeScript face of the "GolfTracerFrameDecoder" NativeModule.
 *
 * Both native implementations (iOS local pod, Android ReactContextBase
 * JavaModule) expose this exact module name and method contract via the
 * classic bridge. Numbers cross the bridge as doubles; integer values are
 * used throughout. All methods are Promise-based.
 */
import { NativeModules } from 'react-native';

export interface NativeOpenOptions {
  startMs?: number;
  endMs?: number;
  stride?: number;
  targetWidth?: number;
  fps?: number;
}

export interface NativeSessionInfo {
  sessionId: string;
  width: number;
  height: number;
  durationMs: number;
  nominalFps: number;
  rotationDeg: number;
}

export interface NativeFrame {
  index: number;
  timestampMs: number;
  width: number;
  height: number;
  /** Row-major width*height luma bytes, standard base64, no line wraps. */
  lumaBase64: string;
}

export interface NativeFrameBatch {
  frames: NativeFrame[];
  done: boolean;
}

export interface FrameDecoderNativeModule {
  openSession(uri: string, options: NativeOpenOptions): Promise<NativeSessionInfo>;
  nextFrames(sessionId: string, maxCount: number): Promise<NativeFrameBatch>;
  /** Idempotent; resolves null/undefined. */
  closeSession(sessionId: string): Promise<void>;
  /** 0 = "unset" sentinel for targetWidth and fps. */
  frameAt(
    uri: string,
    timestampMs: number,
    targetWidth: number,
    fps: number,
  ): Promise<NativeFrame>;
}

/**
 * Returns the native frame decoder, or null when it is not registered
 * (Jest, dev environments without the native app).
 */
export function getFrameDecoder(): FrameDecoderNativeModule | null {
  const m = (NativeModules as Record<string, unknown>).GolfTracerFrameDecoder;
  return m ? (m as FrameDecoderNativeModule) : null;
}
