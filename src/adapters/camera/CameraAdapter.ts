/**
 * Camera adapter contract — the only surface the capture module uses to talk
 * to a camera. Native behaviour lives behind this interface so all capture
 * logic stays pure TypeScript and unit-testable on Linux.
 */
import type { VideoAsset } from '../../types/media';

/** One recordable format a physical camera device offers. */
export interface CaptureFormat {
  width: number;
  height: number;
  maxFps: number;
  supportsHdr: boolean;
}

export interface DeviceCaptureCapabilities {
  formats: CaptureFormat[];
}

export interface StartRecordingOptions {
  /** Frames per second to record at (must be <= the chosen format's maxFps). */
  fps: number;
  width: number;
  height: number;
  /**
   * HDR corrupts tracer output (colour/tonemap artifacts around the bright
   * ball), so this defaults to false and should stay false for analysis.
   */
  enableHdr?: boolean;
  fileType?: 'mp4' | 'mov';
}

export interface CameraAdapter {
  getCapabilities(): Promise<DeviceCaptureCapabilities>;
  startRecording(opts: StartRecordingOptions): Promise<void>;
  stopRecording(): Promise<VideoAsset>;
}
