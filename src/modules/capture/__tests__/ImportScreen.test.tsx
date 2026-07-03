import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ImportScreen } from '../screens/ImportScreen';
import {
  FakeMediaPickerAdapter,
  pickedVideo,
} from '../../../adapters/media/FakeMediaPickerAdapter';
import { SyntheticFrameSource } from '../../../adapters/frames/SyntheticFrameSource';
import type { VideoAsset } from '../../../types/media';
import { useCaptureStore } from '../logic/captureStore';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<typeof import('@react-navigation/native')>(
    '@react-navigation/native',
  ),
  useNavigation: () => ({ navigate: mockNavigate }),
}));

const syntheticFor = (asset: VideoAsset) =>
  new SyntheticFrameSource({ durationMs: asset.durationMs, fps: asset.fps, asset });

const pressChoose = () =>
  fireEvent.press(screen.getByRole('button', { name: 'Choose video' }));

describe('ImportScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    useCaptureStore.getState().reset();
  });

  it('imports a valid video, stages it, and navigates to Review', async () => {
    const picker = new FakeMediaPickerAdapter([
      pickedVideo({ uri: 'file:///lib/swing.mp4', durationMs: 12000, fps: 30 }),
    ]);
    render(<ImportScreen picker={picker} createFrameSource={syntheticFor} />);
    pressChoose();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Review'));

    const staged = useCaptureStore.getState();
    expect(staged.pendingVideo).toMatchObject({
      uri: 'file:///lib/swing.mp4',
      source: 'imported',
      fps: 30,
      durationMs: 12000,
      isSlowMotion: false,
    });
    expect(staged.pendingFrameSource).toBeInstanceOf(SyntheticFrameSource);
  });

  it('flags slow-motion imports and keeps both fps values', async () => {
    const picker = new FakeMediaPickerAdapter([
      pickedVideo({ fps: 30, recordedFps: 240 }),
    ]);
    render(<ImportScreen picker={picker} createFrameSource={syntheticFor} />);
    pressChoose();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Review'));
    expect(useCaptureStore.getState().pendingVideo).toMatchObject({
      fps: 30,
      recordedFps: 240,
      isSlowMotion: true,
    });
  });

  it('applies the user-declared slo-mo rate when the picker reports none', async () => {
    const picker = new FakeMediaPickerAdapter([pickedVideo({ fps: 30 })]);
    render(<ImportScreen picker={picker} createFrameSource={syntheticFor} />);
    fireEvent.press(screen.getByRole('button', { name: '240 fps slo-mo' }));
    pressChoose();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Review'));
    expect(useCaptureStore.getState().pendingVideo).toMatchObject({
      fps: 30,
      recordedFps: 240,
      isSlowMotion: true,
    });
  });

  it('prefers picker-reported recordedFps over the declared rate', async () => {
    const picker = new FakeMediaPickerAdapter([
      pickedVideo({ fps: 30, recordedFps: 120 }),
    ]);
    render(<ImportScreen picker={picker} createFrameSource={syntheticFor} />);
    fireEvent.press(screen.getByRole('button', { name: '240 fps slo-mo' }));
    pressChoose();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Review'));
    expect(useCaptureStore.getState().pendingVideo?.recordedFps).toBe(120);
  });

  it('shows validation reasons and does not navigate for a bad video', async () => {
    const picker = new FakeMediaPickerAdapter([
      pickedVideo({ durationMs: 800, fps: 15 }),
    ]);
    render(<ImportScreen picker={picker} createFrameSource={syntheticFor} />);
    pressChoose();
    expect(await screen.findByText(/too short/)).toBeTruthy();
    expect(screen.getByText(/Frame rate is too low/)).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(useCaptureStore.getState().pendingVideo).toBeNull();
  });

  it('shows unsupported-rotation errors', async () => {
    const picker = new FakeMediaPickerAdapter([pickedVideo({ rotationDeg: 45 })]);
    render(<ImportScreen picker={picker} createFrameSource={syntheticFor} />);
    pressChoose();
    expect(await screen.findByText(/Unsupported rotation/)).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('carries supported rotation metadata onto the asset', async () => {
    const picker = new FakeMediaPickerAdapter([pickedVideo({ rotationDeg: 90 })]);
    render(<ImportScreen picker={picker} createFrameSource={syntheticFor} />);
    pressChoose();
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Review'));
    expect(useCaptureStore.getState().pendingVideo?.rotationDeg).toBe(90);
  });

  it('shows picker errors', async () => {
    const picker = new FakeMediaPickerAdapter([
      { status: 'error', message: 'Photos permission denied' },
    ]);
    render(<ImportScreen picker={picker} />);
    pressChoose();
    expect(await screen.findByText('Photos permission denied')).toBeTruthy();
  });

  it('does nothing on cancel', async () => {
    const picker = new FakeMediaPickerAdapter();
    render(<ImportScreen picker={picker} />);
    pressChoose();
    await waitFor(() => expect(picker.pickCount).toBe(1));
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(useCaptureStore.getState().pendingVideo).toBeNull();
  });
});
