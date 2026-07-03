/**
 * Upload queue — a small pure state machine for future cloud analysis.
 *
 *   idle → preparing → uploading → done
 *          (preparing | uploading) → failed —RETRY→ preparing (capped backoff)
 *
 * The reducer is pure: side effects (actual uploads, timers) live with the
 * caller, which dispatches events into the capture store.
 */

export type UploadStatus = 'idle' | 'preparing' | 'uploading' | 'done' | 'failed';

export interface UploadState {
  status: UploadStatus;
  /** Number of attempts started so far (1-based once enqueued). */
  attempt: number;
  /** Backoff before the next retry; null when done, idle, or terminal. */
  nextRetryDelayMs: number | null;
  error: string | null;
}

export type UploadEvent =
  | { type: 'ENQUEUE' }
  | { type: 'PREPARED' }
  | { type: 'SUCCEEDED' }
  | { type: 'FAILED'; error: string }
  | { type: 'RETRY' }
  | { type: 'RESET' };

export const MAX_UPLOAD_ATTEMPTS = 4;
export const BASE_BACKOFF_MS = 1000;
export const MAX_BACKOFF_MS = 8000;

export const INITIAL_UPLOAD_STATE: UploadState = {
  status: 'idle',
  attempt: 0,
  nextRetryDelayMs: null,
  error: null,
};

/** Exponential backoff, capped: 1s, 2s, 4s, 8s, 8s, ... */
export function backoffDelayMs(attempt: number): number {
  const exponent = Math.max(0, attempt - 1);
  return Math.min(BASE_BACKOFF_MS * 2 ** exponent, MAX_BACKOFF_MS);
}

/**
 * Pure transition function. Events that are invalid in the current state
 * return the state unchanged.
 */
export function uploadReducer(state: UploadState, event: UploadEvent): UploadState {
  switch (event.type) {
    case 'ENQUEUE':
      if (state.status !== 'idle') {
        return state;
      }
      return { status: 'preparing', attempt: 1, nextRetryDelayMs: null, error: null };

    case 'PREPARED':
      if (state.status !== 'preparing') {
        return state;
      }
      return { ...state, status: 'uploading' };

    case 'SUCCEEDED':
      if (state.status !== 'uploading') {
        return state;
      }
      return { status: 'done', attempt: state.attempt, nextRetryDelayMs: null, error: null };

    case 'FAILED': {
      if (state.status !== 'preparing' && state.status !== 'uploading') {
        return state;
      }
      const retriesLeft = state.attempt < MAX_UPLOAD_ATTEMPTS;
      return {
        status: 'failed',
        attempt: state.attempt,
        nextRetryDelayMs: retriesLeft ? backoffDelayMs(state.attempt) : null,
        error: event.error,
      };
    }

    case 'RETRY':
      if (state.status !== 'failed' || state.nextRetryDelayMs === null) {
        return state; // terminal failure (retry cap reached) or not failed
      }
      return {
        status: 'preparing',
        attempt: state.attempt + 1,
        nextRetryDelayMs: null,
        error: null,
      };

    case 'RESET':
      return INITIAL_UPLOAD_STATE;
  }
}
