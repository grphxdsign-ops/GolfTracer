/**
 * Media picker adapter contract — abstracts "user picks a video from their
 * library" so the import flow is unit-testable without native pickers.
 */

/** Metadata for a video the user picked, before validation. */
export interface PickedVideoMeta {
  uri: string;
  width: number;
  height: number;
  durationMs: number;
  /** Container fps, when the picker can report it. */
  fps?: number;
  /**
   * Sensor fps for slow-motion clips (e.g. 240 for footage remuxed into a
   * 30fps container). Rarely available from pickers; carried when known so
   * timestamps can be normalized before any physics.
   */
  recordedFps?: number;
  /** Rotation metadata in degrees, when reported. */
  rotationDeg?: number;
  fileName?: string;
  fileSizeBytes?: number;
}

export type MediaPickResult =
  | { status: 'picked'; video: PickedVideoMeta }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface MediaPickerAdapter {
  pickVideo(): Promise<MediaPickResult>;
}
