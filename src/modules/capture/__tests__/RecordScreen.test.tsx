import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { RecordScreen } from '../screens/RecordScreen';
import { FakeCameraAdapter } from '../../../adapters/camera/FakeCameraAdapter';
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

describe('RecordScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    useCaptureStore.getState().reset();
  });

  it('shows the fps badge from the selected format', async () => {
    render(<RecordScreen adapter={new FakeCameraAdapter()} />);
    expect(await screen.findByText('240 fps · 1080p')).toBeTruthy();
  });

  it('shows capture tips (HDR off, 8s after impact)', async () => {
    render(<RecordScreen adapter={new FakeCameraAdapter()} />);
    expect(screen.getByText(/HDR off/)).toBeTruthy();
    expect(screen.getByText(/8 seconds after impact/)).toBeTruthy();
    // Let the capabilities promise settle inside act().
    await screen.findByText('240 fps · 1080p');
  });

  it('records with the selected format and stages the clip for review', async () => {
    const adapter = new FakeCameraAdapter();
    render(<RecordScreen adapter={adapter} createFrameSource={syntheticFor} />);

    const button = await screen.findByRole('button', { name: 'Start recording' });
    fireEvent.press(button);
    await screen.findByRole('button', { name: 'Stop recording' });
    expect(adapter.lastStartOptions).toMatchObject({
      fps: 240,
      width: 1920,
      height: 1080,
      enableHdr: false,
    });

    fireEvent.press(screen.getByRole('button', { name: 'Stop recording' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Review'));

    const staged = useCaptureStore.getState();
    expect(staged.pendingVideo?.source).toBe('recorded');
    expect(staged.pendingVideo?.fps).toBe(240);
    expect(staged.pendingFrameSource).toBeInstanceOf(SyntheticFrameSource);
    expect(staged.trim).not.toBeNull();
  });

  it('asks for camera permission when using the native camera path', () => {
    // No adapter prop: the (mocked) vision-camera hooks report no permission.
    render(<RecordScreen />);
    expect(screen.getByText('Camera access needed')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Grant camera access' }),
    ).toBeTruthy();
  });

  it('renders the fps badge inside the stage', async () => {
    render(<RecordScreen adapter={new FakeCameraAdapter()} />);
    expect(await screen.findByText('240 fps · 1080p')).toBeTruthy();
    expect(screen.getByTestId('record-fps-badge')).toBeTruthy();
  });

  it('surfaces adapter errors instead of crashing', async () => {
    const adapter = new FakeCameraAdapter();
    adapter.startRecording = async () => {
      throw new Error('sensor busy');
    };
    render(<RecordScreen adapter={adapter} />);
    const button = await screen.findByRole('button', { name: 'Start recording' });
    fireEvent.press(button);
    expect(await screen.findByText('sensor busy')).toBeTruthy();
  });
});
