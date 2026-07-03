import { fireEvent, render, screen } from '@testing-library/react-native';

import { ReviewScreen } from '../screens/ReviewScreen';
import { SyntheticFrameSource } from '../../../adapters/frames/SyntheticFrameSource';
import { TrimmedFrameSource } from '../../../adapters/frames/TrimmedFrameSource';
import { useCaptureStore } from '../logic/captureStore';
import { useSessionStore } from '../../../state/sessionStore';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<typeof import('@react-navigation/native')>(
    '@react-navigation/native',
  ),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const stageClip = (durationMs = 12000) => {
  const source = new SyntheticFrameSource({
    durationMs,
    fps: 30,
    asset: { recordedFps: 240, isSlowMotion: true },
  });
  useCaptureStore.getState().setPending(source.asset, source);
  return source;
};

describe('ReviewScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    useCaptureStore.getState().reset();
    useSessionStore.getState().reset();
  });

  it('shows an empty state when nothing is staged', () => {
    render(<ReviewScreen />);
    expect(screen.getByText('No clip to review')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Record a swing' }));
    expect(mockNavigate).toHaveBeenCalledWith('Record');
  });

  it('renders clip info including effective sampling rate', () => {
    stageClip();
    render(<ReviewScreen />);
    expect(screen.getByText(/240 fps/)).toBeTruthy();
    expect(screen.getByText(/slow-motion/)).toBeTruthy();
  });

  it('publishes the clip to the session store and navigates to Analyze', () => {
    const source = stageClip(12000); // default trim 0–11000 ≠ whole clip
    render(<ReviewScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Use this video' }));

    const session = useSessionStore.getState();
    expect(session.video).toBe(source.asset);
    expect(session.frameSource).toBeInstanceOf(TrimmedFrameSource);
    expect(session.frameSource?.asset).toBe(source.asset);
    expect(mockNavigate).toHaveBeenCalledWith('Analyze');
  });

  it('publishes the raw frame source when the trim covers the whole clip', () => {
    const source = stageClip(8000); // default trim covers 0–8000 entirely
    render(<ReviewScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Use this video' }));
    expect(useSessionStore.getState().frameSource).toBe(source);
  });

  it('keeps trim edits in the store (not component state)', () => {
    stageClip(12000);
    render(<ReviewScreen />);
    fireEvent.press(screen.getByRole('button', { name: 'Start +0.5s' }));
    fireEvent.press(screen.getByRole('button', { name: 'End −0.5s' }));
    expect(useCaptureStore.getState().trim).toEqual({ startMs: 500, endMs: 10500 });

    // Remount: edits survive because they never lived in component state.
    screen.unmount();
    render(<ReviewScreen />);
    expect(screen.getByText('Trim 0.5s – 10.5s')).toBeTruthy();
  });

  it('clamps playhead nudges into the clip', () => {
    stageClip(12000);
    render(<ReviewScreen />);
    fireEvent.press(screen.getByRole('button', { name: '◀ 0.5s' }));
    expect(useCaptureStore.getState().playheadMs).toBe(0);
    fireEvent.press(screen.getByRole('button', { name: '0.5s ▶' }));
    expect(useCaptureStore.getState().playheadMs).toBe(500);
  });
});
