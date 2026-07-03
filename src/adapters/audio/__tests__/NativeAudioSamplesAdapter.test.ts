import {
  NATIVE_AUDIO_SOURCE_ERROR,
  NativeAudioSamplesAdapter,
  type AudioDecoderNativeModule,
  type NativeAudioSamples,
} from '../NativeAudioSamplesAdapter';

describe('NativeAudioSamplesAdapter', () => {
  it('rejects getSamples outside a device runtime', async () => {
    const adapter = new NativeAudioSamplesAdapter();
    await expect(adapter.getSamples('file:///video.mp4')).rejects.toThrow(
      NATIVE_AUDIO_SOURCE_ERROR,
    );
  });

  it('rejects with the error even when options are provided', async () => {
    const adapter = new NativeAudioSamplesAdapter();
    await expect(
      adapter.getSamples('file:///video.mp4', {
        startMs: 100,
        endMs: 900,
        targetSampleRate: 8000,
      }),
    ).rejects.toThrow('requires device runtime');
  });
});

describe('NativeAudioSamplesAdapter with an injected native module', () => {
  const B64_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  /** Standard base64 encoder (test-local inverse of the adapter's decoder). */
  const encodeBase64 = (bytes: Uint8Array): string => {
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i]!;
      const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
      const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
      out += B64_ALPHABET.charAt(b0 >> 2);
      out += B64_ALPHABET.charAt(((b0 & 0x03) << 4) | (b1 >> 4));
      out +=
        i + 1 < bytes.length
          ? B64_ALPHABET.charAt(((b1 & 0x0f) << 2) | (b2 >> 6))
          : '=';
      out += i + 2 < bytes.length ? B64_ALPHABET.charAt(b2 & 0x3f) : '=';
    }
    return out;
  };

  const pcmBase64 = (values: number[]): string => {
    const floats = new Float32Array(values);
    return encodeBase64(
      new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength),
    );
  };

  const nativeSamples = (values: number[]): NativeAudioSamples => ({
    sampleRate: 8000,
    channelCount: 1,
    durationMs: (values.length / 8000) * 1000,
    pcmBase64: pcmBase64(values),
  });

  interface FakeModule extends AudioDecoderNativeModule {
    decodeSamples: jest.Mock;
  }

  const makeModule = (values: number[]): FakeModule => ({
    decodeSamples: jest.fn().mockResolvedValue(nativeSamples(values)),
  });

  it('forwards the uri and full options to decodeSamples', async () => {
    const module = makeModule([0]);
    const adapter = new NativeAudioSamplesAdapter(module);
    await adapter.getSamples('file:///video.mp4', {
      startMs: 100,
      endMs: 900,
      targetSampleRate: 8000,
    });
    expect(module.decodeSamples).toHaveBeenCalledTimes(1);
    expect(module.decodeSamples).toHaveBeenCalledWith('file:///video.mp4', {
      startMs: 100,
      endMs: 900,
      targetSampleRate: 8000,
    });
  });

  it('omits unset option keys entirely', async () => {
    const module = makeModule([0]);
    const adapter = new NativeAudioSamplesAdapter(module);
    await adapter.getSamples('file:///video.mp4');
    const [, options] = module.decodeSamples.mock.calls[0] as [string, object];
    expect(Object.keys(options)).toEqual([]);
  });

  it('maps the native payload, decoding base64 PCM to Float32Array', async () => {
    const values = [0, 0.5, -0.5, 1, -1];
    const module = makeModule(values);
    const adapter = new NativeAudioSamplesAdapter(module);
    const samples = await adapter.getSamples('file:///video.mp4');
    expect(samples.sampleRate).toBe(8000);
    expect(samples.channelCount).toBe(1);
    expect(samples.durationMs).toBeCloseTo((values.length / 8000) * 1000);
    expect(Array.from(samples.data)).toEqual(values);
  });

  it('propagates decodeSamples rejections', async () => {
    const module = makeModule([0]);
    module.decodeSamples.mockRejectedValue(new Error('decoder blew up'));
    const adapter = new NativeAudioSamplesAdapter(module);
    await expect(adapter.getSamples('file:///video.mp4')).rejects.toThrow(
      'decoder blew up',
    );
  });
});
