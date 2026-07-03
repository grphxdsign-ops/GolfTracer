/**
 * In-memory CameraAdapter used in all tests (and demos). Capabilities are
 * configurable and stopRecording() returns a canned VideoAsset, so screens
 * and logic can be exercised end-to-end without a device.
 */
import type { VideoAsset } from '../../types/media';
import type {
  CameraAdapter,
  DeviceCaptureCapabilities,
  StartRecordingOptions,
} from './CameraAdapter';

export const DEFAULT_FAKE_CAPABILITIES: DeviceCaptureCapabilities = {
  formats: [
    { width: 1920, height: 1080, maxFps: 240, supportsHdr: false },
    { width: 1920, height: 1080, maxFps: 60, supportsHdr: true },
    { width: 3840, height: 2160, maxFps: 30, supportsHdr: false },
    { width: 1280, height: 720, maxFps: 240, supportsHdr: false },
  ],
};

export interface FakeCameraAdapterOptions {
  capabilities?: DeviceCaptureCapabilities;
  /** Overrides merged onto the canned asset returned by stopRecording(). */
  asset?: Partial<VideoAsset>;
}

let fakeAssetCounter = 0;

export class FakeCameraAdapter implements CameraAdapter {
  readonly capabilities: DeviceCaptureCapabilities;
  private readonly assetOverrides: Partial<VideoAsset>;
  private recordingOpts: StartRecordingOptions | null = null;

  /** The options passed to the most recent startRecording() call. */
  lastStartOptions: StartRecordingOptions | null = null;

  constructor(options: FakeCameraAdapterOptions = {}) {
    this.capabilities = options.capabilities ?? DEFAULT_FAKE_CAPABILITIES;
    this.assetOverrides = options.asset ?? {};
  }

  get isRecording(): boolean {
    return this.recordingOpts !== null;
  }

  async getCapabilities(): Promise<DeviceCaptureCapabilities> {
    return this.capabilities;
  }

  async startRecording(opts: StartRecordingOptions): Promise<void> {
    if (this.recordingOpts !== null) {
      throw new Error('Already recording');
    }
    this.recordingOpts = opts;
    this.lastStartOptions = opts;
  }

  async stopRecording(): Promise<VideoAsset> {
    const opts = this.recordingOpts;
    if (opts === null) {
      throw new Error('Not recording');
    }
    this.recordingOpts = null;
    fakeAssetCounter += 1;
    return {
      id: `fake-rec-${fakeAssetCounter}`,
      uri: `file:///fake/recordings/${fakeAssetCounter}.mp4`,
      width: opts.width,
      height: opts.height,
      fps: opts.fps,
      recordedFps: opts.fps,
      durationMs: 12000,
      rotationDeg: 0,
      isSlowMotion: false,
      source: 'recorded',
      createdAt: 0,
      ...this.assetOverrides,
    };
  }
}
