import { SyntheticFrameSource } from '../../../adapters/frames/SyntheticFrameSource';
import { useCaptureStore } from '../logic/captureStore';

const makeSource = (durationMs = 12000) =>
  new SyntheticFrameSource({ durationMs, fps: 30 });

describe('captureStore', () => {
  beforeEach(() => {
    useCaptureStore.getState().reset();
  });

  it('stages a pending clip and seeds a default trim window', () => {
    const source = makeSource();
    useCaptureStore.getState().setPending(source.asset, source);
    const s = useCaptureStore.getState();
    expect(s.pendingVideo).toBe(source.asset);
    expect(s.pendingFrameSource).toBe(source);
    expect(s.trim).toEqual({ startMs: 0, endMs: 11000 });
    expect(s.playheadMs).toBe(0);
  });

  it('clamps trim edits to the clip and preserves them in the store', () => {
    const source = makeSource(10000);
    useCaptureStore.getState().setPending(source.asset, source);
    useCaptureStore.getState().setTrim({ startMs: -400, endMs: 99999 });
    expect(useCaptureStore.getState().trim).toEqual({ startMs: 0, endMs: 10000 });
  });

  it('ignores trim edits when nothing is staged', () => {
    useCaptureStore.getState().setTrim({ startMs: 0, endMs: 1000 });
    expect(useCaptureStore.getState().trim).toBeNull();
  });

  it('clamps the playhead into the clip', () => {
    const source = makeSource(10000);
    useCaptureStore.getState().setPending(source.asset, source);
    useCaptureStore.getState().setPlayhead(-100);
    expect(useCaptureStore.getState().playheadMs).toBe(0);
    useCaptureStore.getState().setPlayhead(20000);
    expect(useCaptureStore.getState().playheadMs).toBe(10000);
  });

  it('drives the upload state machine via dispatch', () => {
    useCaptureStore.getState().dispatchUpload({ type: 'ENQUEUE' });
    useCaptureStore.getState().dispatchUpload({ type: 'PREPARED' });
    expect(useCaptureStore.getState().upload.status).toBe('uploading');
  });

  it('resets upload state when a new clip is staged', () => {
    useCaptureStore.getState().dispatchUpload({ type: 'ENQUEUE' });
    const source = makeSource();
    useCaptureStore.getState().setPending(source.asset, source);
    expect(useCaptureStore.getState().upload.status).toBe('idle');
  });

  it('clearPending drops everything', () => {
    const source = makeSource();
    useCaptureStore.getState().setPending(source.asset, source);
    useCaptureStore.getState().clearPending();
    const s = useCaptureStore.getState();
    expect(s.pendingVideo).toBeNull();
    expect(s.pendingFrameSource).toBeNull();
    expect(s.trim).toBeNull();
  });
});
