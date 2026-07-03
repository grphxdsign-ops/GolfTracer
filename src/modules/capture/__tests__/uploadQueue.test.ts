import {
  backoffDelayMs,
  BASE_BACKOFF_MS,
  INITIAL_UPLOAD_STATE,
  MAX_BACKOFF_MS,
  MAX_UPLOAD_ATTEMPTS,
  uploadReducer,
  type UploadEvent,
  type UploadState,
} from '../logic/uploadQueue';

const run = (events: UploadEvent[], from: UploadState = INITIAL_UPLOAD_STATE) =>
  events.reduce(uploadReducer, from);

describe('uploadReducer', () => {
  it('walks the happy path idle → preparing → uploading → done', () => {
    let s = INITIAL_UPLOAD_STATE;
    s = uploadReducer(s, { type: 'ENQUEUE' });
    expect(s.status).toBe('preparing');
    expect(s.attempt).toBe(1);
    s = uploadReducer(s, { type: 'PREPARED' });
    expect(s.status).toBe('uploading');
    s = uploadReducer(s, { type: 'SUCCEEDED' });
    expect(s.status).toBe('done');
    expect(s.error).toBeNull();
  });

  it('moves to failed with a backoff delay on failure', () => {
    const s = run([
      { type: 'ENQUEUE' },
      { type: 'PREPARED' },
      { type: 'FAILED', error: 'network down' },
    ]);
    expect(s.status).toBe('failed');
    expect(s.error).toBe('network down');
    expect(s.nextRetryDelayMs).toBe(BASE_BACKOFF_MS);
  });

  it('retries from failed and increments the attempt counter', () => {
    const failed = run([
      { type: 'ENQUEUE' },
      { type: 'PREPARED' },
      { type: 'FAILED', error: 'x' },
    ]);
    const retried = uploadReducer(failed, { type: 'RETRY' });
    expect(retried.status).toBe('preparing');
    expect(retried.attempt).toBe(2);
    expect(retried.error).toBeNull();
  });

  it('doubles backoff per attempt and caps it', () => {
    expect(backoffDelayMs(1)).toBe(1000);
    expect(backoffDelayMs(2)).toBe(2000);
    expect(backoffDelayMs(3)).toBe(4000);
    expect(backoffDelayMs(4)).toBe(8000);
    expect(backoffDelayMs(10)).toBe(MAX_BACKOFF_MS);
  });

  it('becomes terminally failed after the retry cap', () => {
    let s = INITIAL_UPLOAD_STATE;
    s = uploadReducer(s, { type: 'ENQUEUE' });
    for (let i = 0; i < MAX_UPLOAD_ATTEMPTS; i += 1) {
      s = uploadReducer(s, { type: 'PREPARED' });
      s = uploadReducer(s, { type: 'FAILED', error: `attempt ${i + 1}` });
      if (i < MAX_UPLOAD_ATTEMPTS - 1) {
        expect(s.nextRetryDelayMs).not.toBeNull();
        s = uploadReducer(s, { type: 'RETRY' });
      }
    }
    expect(s.status).toBe('failed');
    expect(s.attempt).toBe(MAX_UPLOAD_ATTEMPTS);
    expect(s.nextRetryDelayMs).toBeNull();
    // RETRY is ignored once terminal.
    expect(uploadReducer(s, { type: 'RETRY' })).toBe(s);
  });

  it('ignores invalid events in each state', () => {
    const idle = INITIAL_UPLOAD_STATE;
    expect(uploadReducer(idle, { type: 'PREPARED' })).toBe(idle);
    expect(uploadReducer(idle, { type: 'SUCCEEDED' })).toBe(idle);
    expect(uploadReducer(idle, { type: 'RETRY' })).toBe(idle);
    expect(uploadReducer(idle, { type: 'FAILED', error: 'x' })).toBe(idle);

    const preparing = uploadReducer(idle, { type: 'ENQUEUE' });
    expect(uploadReducer(preparing, { type: 'ENQUEUE' })).toBe(preparing);
    expect(uploadReducer(preparing, { type: 'SUCCEEDED' })).toBe(preparing);

    const done = run([
      { type: 'ENQUEUE' },
      { type: 'PREPARED' },
      { type: 'SUCCEEDED' },
    ]);
    expect(uploadReducer(done, { type: 'FAILED', error: 'x' })).toBe(done);
  });

  it('RESET returns to the initial state from anywhere', () => {
    const failed = run([
      { type: 'ENQUEUE' },
      { type: 'FAILED', error: 'x' },
    ]);
    expect(uploadReducer(failed, { type: 'RESET' })).toEqual(INITIAL_UPLOAD_STATE);
  });
});
