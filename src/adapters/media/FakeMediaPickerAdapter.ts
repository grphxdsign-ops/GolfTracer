/**
 * In-memory MediaPickerAdapter for tests: returns queued results in order,
 * falling back to 'cancelled' when the queue is empty.
 */
import type {
  MediaPickResult,
  MediaPickerAdapter,
  PickedVideoMeta,
} from './MediaPickerAdapter';

export class FakeMediaPickerAdapter implements MediaPickerAdapter {
  private readonly queue: MediaPickResult[];
  pickCount = 0;

  constructor(results: MediaPickResult[] = []) {
    this.queue = [...results];
  }

  enqueue(result: MediaPickResult): void {
    this.queue.push(result);
  }

  async pickVideo(): Promise<MediaPickResult> {
    this.pickCount += 1;
    return this.queue.shift() ?? { status: 'cancelled' };
  }
}

/** Convenience builder for a plausible picked-video result. */
export function pickedVideo(
  overrides: Partial<PickedVideoMeta> = {},
): MediaPickResult {
  return {
    status: 'picked',
    video: {
      uri: 'file:///fake/library/swing.mp4',
      width: 1920,
      height: 1080,
      durationMs: 12000,
      fps: 30,
      ...overrides,
    },
  };
}
