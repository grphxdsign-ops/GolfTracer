/**
 * Thin, typed wrapper over react-native-vision-camera (v4).
 *
 * Contains no logic beyond mapping between vision-camera's types and our
 * frozen media contracts. The wrapper talks to the native `Camera` view
 * through a minimal structural interface (`VisionCameraController`) so tests
 * can substitute a fake controller and never touch native code.
 */
import type { VideoAsset } from '../../types/media';
import type {
  CameraAdapter,
  CaptureFormat,
  DeviceCaptureCapabilities,
  StartRecordingOptions,
} from './CameraAdapter';

/** Structural subset of vision-camera's `CameraDeviceFormat`. */
export interface VisionDeviceFormatLike {
  videoWidth: number;
  videoHeight: number;
  maxFps: number;
  supportsVideoHdr: boolean;
}

/** Structural subset of vision-camera's `CameraDevice`. */
export interface VisionDeviceLike {
  formats: VisionDeviceFormatLike[];
}

/** Structural subset of vision-camera's `VideoFile` recording result. */
export interface VisionVideoFileLike {
  path: string;
  /** Duration in seconds (vision-camera convention). */
  duration: number;
  width: number;
  height: number;
}

export interface VisionRecordingOptions {
  fileType?: 'mp4' | 'mov';
  videoHdr?: boolean;
  onRecordingFinished: (video: VisionVideoFileLike) => void;
  onRecordingError: (error: Error) => void;
}

/**
 * Structural subset of vision-camera's imperative `Camera` handle. A real
 * `Camera` ref satisfies this interface; tests pass a fake.
 */
export interface VisionCameraController {
  startRecording(options: VisionRecordingOptions): void;
  stopRecording(): Promise<void>;
}

/** Pure mapping: vision-camera device formats → capture capabilities. */
export function mapDeviceCapabilities(
  device: VisionDeviceLike,
): DeviceCaptureCapabilities {
  return {
    formats: device.formats.map(
      (f): CaptureFormat => ({
        width: f.videoWidth,
        height: f.videoHeight,
        maxFps: f.maxFps,
        supportsHdr: f.supportsVideoHdr,
      }),
    ),
  };
}

let assetCounter = 0;

/** Pure mapping: a finished vision-camera recording → VideoAsset. */
export function videoFileToAsset(
  file: VisionVideoFileLike,
  recordedFps: number,
  now: number = Date.now(),
): VideoAsset {
  assetCounter += 1;
  return {
    id: `rec-${now}-${assetCounter}`,
    uri: file.path,
    width: file.width,
    height: file.height,
    // vision-camera records in real time: the container fps equals the
    // sensor fps, so no slow-motion remux reconciliation is needed here.
    fps: recordedFps,
    recordedFps,
    durationMs: Math.round(file.duration * 1000),
    // vision-camera writes upright video; orientation metadata is baked in.
    rotationDeg: 0,
    isSlowMotion: false,
    source: 'recorded',
    createdAt: now,
  };
}

export class VisionCameraAdapter implements CameraAdapter {
  private pendingFile: Promise<VisionVideoFileLike> | null = null;
  private requestedFps = 30;

  constructor(
    private readonly device: VisionDeviceLike,
    private readonly getController: () => VisionCameraController | null,
  ) {}

  async getCapabilities(): Promise<DeviceCaptureCapabilities> {
    return mapDeviceCapabilities(this.device);
  }

  async startRecording(opts: StartRecordingOptions): Promise<void> {
    const controller = this.getController();
    if (controller === null) {
      throw new Error('Camera is not ready');
    }
    if (this.pendingFile !== null) {
      throw new Error('Already recording');
    }
    this.requestedFps = opts.fps;
    this.pendingFile = new Promise<VisionVideoFileLike>((resolve, reject) => {
      controller.startRecording({
        fileType: opts.fileType ?? 'mp4',
        videoHdr: opts.enableHdr ?? false,
        onRecordingFinished: resolve,
        onRecordingError: reject,
      });
    });
  }

  async stopRecording(): Promise<VideoAsset> {
    const controller = this.getController();
    const pending = this.pendingFile;
    if (controller === null || pending === null) {
      throw new Error('Not recording');
    }
    this.pendingFile = null;
    await controller.stopRecording();
    const file = await pending;
    return videoFileToAsset(file, this.requestedFps);
  }
}
