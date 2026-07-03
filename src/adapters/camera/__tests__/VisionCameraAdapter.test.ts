import {
  mapDeviceCapabilities,
  videoFileToAsset,
  VisionCameraAdapter,
  type VisionCameraController,
  type VisionRecordingOptions,
  type VisionVideoFileLike,
} from '../VisionCameraAdapter';

class FakeController implements VisionCameraController {
  lastOptions: VisionRecordingOptions | null = null;
  file: VisionVideoFileLike = {
    path: 'file:///tmp/rec.mp4',
    duration: 12.5,
    width: 1920,
    height: 1080,
  };
  failWith: Error | null = null;

  startRecording(options: VisionRecordingOptions): void {
    this.lastOptions = options;
  }

  async stopRecording(): Promise<void> {
    if (this.lastOptions === null) {
      throw new Error('no recording in flight');
    }
    if (this.failWith !== null) {
      this.lastOptions.onRecordingError(this.failWith);
    } else {
      this.lastOptions.onRecordingFinished(this.file);
    }
  }
}

const device = {
  formats: [
    { videoWidth: 1920, videoHeight: 1080, maxFps: 240, supportsVideoHdr: false },
    { videoWidth: 3840, videoHeight: 2160, maxFps: 30, supportsVideoHdr: true },
  ],
};

describe('mapDeviceCapabilities', () => {
  it('maps vision-camera formats onto capture capabilities', () => {
    expect(mapDeviceCapabilities(device)).toEqual({
      formats: [
        { width: 1920, height: 1080, maxFps: 240, supportsHdr: false },
        { width: 3840, height: 2160, maxFps: 30, supportsHdr: true },
      ],
    });
  });
});

describe('videoFileToAsset', () => {
  it('maps a finished recording to a VideoAsset', () => {
    const asset = videoFileToAsset(
      { path: 'file:///tmp/a.mp4', duration: 3.2, width: 1280, height: 720 },
      120,
      1234,
    );
    expect(asset).toMatchObject({
      uri: 'file:///tmp/a.mp4',
      width: 1280,
      height: 720,
      fps: 120,
      recordedFps: 120,
      durationMs: 3200,
      rotationDeg: 0,
      isSlowMotion: false,
      source: 'recorded',
      createdAt: 1234,
    });
  });
});

describe('VisionCameraAdapter', () => {
  it('reports mapped capabilities', async () => {
    const adapter = new VisionCameraAdapter(device, () => new FakeController());
    const caps = await adapter.getCapabilities();
    expect(caps.formats).toHaveLength(2);
    expect(caps.formats[0]?.maxFps).toBe(240);
  });

  it('records and returns the resulting VideoAsset with HDR forced off', async () => {
    const controller = new FakeController();
    const adapter = new VisionCameraAdapter(device, () => controller);
    await adapter.startRecording({ fps: 240, width: 1920, height: 1080 });
    expect(controller.lastOptions?.videoHdr).toBe(false);
    expect(controller.lastOptions?.fileType).toBe('mp4');
    const asset = await adapter.stopRecording();
    expect(asset.uri).toBe('file:///tmp/rec.mp4');
    expect(asset.fps).toBe(240);
    expect(asset.recordedFps).toBe(240);
    expect(asset.durationMs).toBe(12500);
    expect(asset.source).toBe('recorded');
  });

  it('propagates recording errors from the native side', async () => {
    const controller = new FakeController();
    controller.failWith = new Error('disk full');
    const adapter = new VisionCameraAdapter(device, () => controller);
    await adapter.startRecording({ fps: 60, width: 1920, height: 1080 });
    await expect(adapter.stopRecording()).rejects.toThrow('disk full');
  });

  it('throws when the camera view is not mounted', async () => {
    const adapter = new VisionCameraAdapter(device, () => null);
    await expect(
      adapter.startRecording({ fps: 60, width: 1920, height: 1080 }),
    ).rejects.toThrow('Camera is not ready');
  });

  it('rejects stop without start and double start', async () => {
    const controller = new FakeController();
    const adapter = new VisionCameraAdapter(device, () => controller);
    await expect(adapter.stopRecording()).rejects.toThrow('Not recording');
    await adapter.startRecording({ fps: 60, width: 1920, height: 1080 });
    await expect(
      adapter.startRecording({ fps: 60, width: 1920, height: 1080 }),
    ).rejects.toThrow('Already recording');
  });
});
