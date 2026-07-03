import { FakeMediaPickerAdapter, pickedVideo } from '../FakeMediaPickerAdapter';

describe('FakeMediaPickerAdapter', () => {
  it('returns queued results in order, then cancels', async () => {
    const adapter = new FakeMediaPickerAdapter([
      pickedVideo({ uri: 'file:///one.mp4' }),
      { status: 'error', message: 'boom' },
    ]);
    const first = await adapter.pickVideo();
    expect(first.status).toBe('picked');
    if (first.status === 'picked') {
      expect(first.video.uri).toBe('file:///one.mp4');
    }
    expect(await adapter.pickVideo()).toEqual({ status: 'error', message: 'boom' });
    expect(await adapter.pickVideo()).toEqual({ status: 'cancelled' });
    expect(adapter.pickCount).toBe(3);
  });

  it('supports enqueueing after construction', async () => {
    const adapter = new FakeMediaPickerAdapter();
    adapter.enqueue(pickedVideo({ durationMs: 5000 }));
    const result = await adapter.pickVideo();
    expect(result.status).toBe('picked');
  });
});
