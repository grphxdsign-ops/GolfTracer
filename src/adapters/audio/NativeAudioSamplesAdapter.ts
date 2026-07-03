/**
 * NativeAudioSamplesAdapter — AudioSamplesAdapter backed by the
 * "GolfTracerAudioDecoder" NativeModule (classic bridge, identical contract
 * on iOS and Android), mirroring NativeFrameSource.
 *
 * Intended device implementation (not built here — decoding is native-only):
 * iOS opens the asset with AVAssetReader and exports the audio track as PCM
 * (kAudioFormatLinearPCM, float32); Android drives MediaExtractor +
 * MediaCodec over the audio track. Both mix down to mono float in [-1, 1],
 * downsample to the requested targetSampleRate (a few kHz is plenty for
 * transient detection), clip to the startMs/endMs window, and return the
 * samples base64-encoded (numbers cross the bridge as doubles, so raw
 * arrays would be prohibitively large).
 *
 * Outside a device runtime (Jest, dev sandboxes) the module is not
 * registered and every method rejects, matching NativeFrameSource; tests
 * inject a fake module through the constructor instead.
 */
import { NativeModules } from 'react-native';

import type { AudioSamples, AudioSamplesAdapter } from './AudioSamplesAdapter';
import { decodeBase64 } from '../frames/base64';

export const NATIVE_AUDIO_SOURCE_ERROR =
  'NativeAudioSamplesAdapter requires device runtime';

export interface NativeAudioOptions {
  startMs?: number;
  endMs?: number;
  targetSampleRate?: number;
}

export interface NativeAudioSamples {
  sampleRate: number;
  channelCount: number;
  durationMs: number;
  /** Mono float32 little-endian PCM, standard base64, no line wraps. */
  pcmBase64: string;
}

export interface AudioDecoderNativeModule {
  decodeSamples(uri: string, options: NativeAudioOptions): Promise<NativeAudioSamples>;
}

/**
 * Returns the native audio decoder, or null when it is not registered
 * (Jest, dev environments without the native app).
 */
export function getAudioDecoder(): AudioDecoderNativeModule | null {
  const m = (NativeModules as Record<string, unknown>).GolfTracerAudioDecoder;
  return m ? (m as AudioDecoderNativeModule) : null;
}

const toAudioSamples = (native: NativeAudioSamples): AudioSamples => {
  const bytes = decodeBase64(native.pcmBase64);
  // Device CPUs (arm64, x86_64) are little-endian, matching the payload.
  const data = new Float32Array(
    bytes.buffer,
    bytes.byteOffset,
    Math.floor(bytes.byteLength / 4),
  );
  return {
    sampleRate: native.sampleRate,
    channelCount: native.channelCount,
    data,
    durationMs: native.durationMs,
  };
};

export class NativeAudioSamplesAdapter implements AudioSamplesAdapter {
  private readonly module: AudioDecoderNativeModule | null;

  constructor(module: AudioDecoderNativeModule | null = getAudioDecoder()) {
    this.module = module;
  }

  async getSamples(
    uri: string,
    options?: { startMs?: number; endMs?: number; targetSampleRate?: number },
  ): Promise<AudioSamples> {
    if (this.module === null) {
      throw new Error(NATIVE_AUDIO_SOURCE_ERROR);
    }
    const nativeOptions: NativeAudioOptions = {};
    if (options?.startMs !== undefined) {
      nativeOptions.startMs = options.startMs;
    }
    if (options?.endMs !== undefined) {
      nativeOptions.endMs = options.endMs;
    }
    if (options?.targetSampleRate !== undefined) {
      nativeOptions.targetSampleRate = options.targetSampleRate;
    }
    return toAudioSamples(await this.module.decodeSamples(uri, nativeOptions));
  }
}
