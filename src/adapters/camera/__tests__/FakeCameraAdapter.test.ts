import { DEFAULT_FAKE_CAPABILITIES, FakeCameraAdapter } from '../FakeCameraAdapter';

describe('FakeCameraAdapter', () => {
  it('returns configurable capabilities', async () => {
    const capabilities = {
      formats: [{ width: 1280, height: 720, maxFps: 60, supportsHdr: false }],
    };
    const adapter = new FakeCameraAdapter({ capabilities });
    expect(await adapter.getCapabilities()).toBe(capabilities);

    const fallback = new FakeCameraAdapter();
    expect(await fallback.getCapabilities()).toBe(DEFAULT_FAKE_CAPABILITIES);
  });

  it('produces a canned asset reflecting the recording options', async () => {
    const adapter = new FakeCameraAdapter();
    await adapter.startRecording({ fps: 240, width: 1920, height: 1080 });
    expect(adapter.isRecording).toBe(true);
    const asset = await adapter.stopRecording();
    expect(adapter.isRecording).toBe(false);
    expect(asset.fps).toBe(240);
    expect(asset.width).toBe(1920);
    expect(asset.source).toBe('recorded');
  });

  it('applies asset overrides', async () => {
    const adapter = new FakeCameraAdapter({
      asset: { durationMs: 4000, rotationDeg: 90 },
    });
    await adapter.startRecording({ fps: 30, width: 1920, height: 1080 });
    const asset = await adapter.stopRecording();
    expect(asset.durationMs).toBe(4000);
    expect(asset.rotationDeg).toBe(90);
  });

  it('enforces the recording lifecycle', async () => {
    const adapter = new FakeCameraAdapter();
    await expect(adapter.stopRecording()).rejects.toThrow('Not recording');
    await adapter.startRecording({ fps: 30, width: 1920, height: 1080 });
    await expect(
      adapter.startRecording({ fps: 30, width: 1920, height: 1080 }),
    ).rejects.toThrow('Already recording');
  });
});
