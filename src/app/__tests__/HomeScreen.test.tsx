/**
 * Home hub tests (DESIGN.md §11): greeting, conditional pipeline card,
 * sports shortcut row, and the recent session card.
 */
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { HomeScreen } from '../screens/HomeScreen';
import { useSessionStore } from '../../state/sessionStore';
import { useProfileStore } from '../../state/profileStore';
import { useHistoryStore } from '../../state/historyStore';
import type { FrameSource, VideoAsset, VideoFrame } from '../../types/media';

// HomeScreen reads useSafeAreaInsets(); the package's jest mock supplies
// zero insets without needing a native SafeAreaProvider.
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual<{ default: unknown }>(
    'react-native-safe-area-context/jest/mock',
  ).default,
);

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate }),
  };
});

const makeAsset = (): VideoAsset => ({
  id: 'clip-1',
  uri: 'file:///videos/clip-1.mov',
  width: 1920,
  height: 1080,
  fps: 240,
  recordedFps: 240,
  durationMs: 4000,
  rotationDeg: 0,
  isSlowMotion: true,
  source: 'recorded',
  createdAt: 1_700_000_000_000,
});

const makeFrameSource = (asset: VideoAsset): FrameSource => ({
  asset,
  frames(): AsyncIterable<VideoFrame> {
    return {
      [Symbol.asyncIterator]() {
        return {
          next: async () => ({ done: true as const, value: undefined }),
        };
      },
    };
  },
  frameAt: async (timestampMs: number): Promise<VideoFrame> => ({
    index: 0,
    timestampMs,
    width: asset.width,
    height: asset.height,
    luma: new Uint8Array(0),
  }),
});

const loadVideo = () => {
  const asset = makeAsset();
  useSessionStore.getState().setVideo(asset, makeFrameSource(asset));
};

const renderHome = () =>
  render(
    <NavigationContainer>
      <HomeScreen />
    </NavigationContainer>,
  );

describe('HomeScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    useSessionStore.getState().reset();
    useProfileStore.getState().reset();
    useHistoryStore.getState().clear();
  });

  it('shows the Tracr title with the standard subtitle when no name is known', () => {
    renderHome();
    expect(screen.getByText('Tracr')).toBeTruthy();
    expect(screen.getByText('Ready to trace your next shot.')).toBeTruthy();
  });

  it('greets by first name when the profile has an account name', () => {
    useProfileStore.getState().setAccount({
      provider: 'apple',
      userId: 'u1',
      name: 'Sam Sneed',
      email: null,
    });
    renderHome();
    expect(screen.getByText('Trace every shot, Sam.')).toBeTruthy();
  });

  it('keeps Record as the primary CTA with Import as secondary', () => {
    renderHome();
    fireEvent.press(screen.getByRole('button', { name: 'Record' }));
    expect(mockNavigate).toHaveBeenCalledWith('Record');
    fireEvent.press(screen.getByRole('button', { name: 'Import' }));
    expect(mockNavigate).toHaveBeenCalledWith('Import');
  });

  it('omits the pipeline card entirely while no session is in flight', () => {
    renderHome();
    expect(screen.queryByTestId('home-pipeline-card')).toBeNull();
    expect(screen.queryByText('No video')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Analyze' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Distance' })).toBeNull();
  });

  it('shows the pipeline with pinned detail strings once a video is loaded', () => {
    loadVideo();
    renderHome();
    expect(screen.getByTestId('home-pipeline-card')).toBeTruthy();
    expect(screen.getByTestId('home-pipeline-steps')).toBeTruthy();
    // Detail-string derivations are pinned — identical to the old dashboard.
    expect(screen.getByText('recorded · 240 fps · 4.0s')).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
    expect(screen.getByText('Not estimated')).toBeTruthy();
    // Continue actions ride with the in-flight session.
    const analyze = screen.getByRole('button', { name: 'Analyze' });
    const distance = screen.getByRole('button', { name: 'Distance' });
    expect(analyze.props.accessibilityState.disabled).toBe(false);
    expect(distance.props.accessibilityState.disabled).toBe(true);
  });

  it('shows all available sports when the profile has chosen none', () => {
    renderHome();
    expect(screen.getByTestId('home-sport-golf')).toBeTruthy();
    expect(screen.getByTestId('home-sport-soccer')).toBeTruthy();
    // Perfected action is a tool, not a sport — never in the sports row.
    expect(screen.queryByTestId('home-sport-perfected')).toBeNull();

    fireEvent.press(screen.getByTestId('home-sport-golf'));
    expect(mockNavigate).toHaveBeenCalledWith('Record');
    fireEvent.press(screen.getByTestId('home-sport-soccer'));
    expect(mockNavigate).toHaveBeenCalledWith('SoccerAnalyze');
  });

  it('shows only the chosen sports once the profile has a selection', () => {
    useProfileStore.getState().toggleSport('soccer');
    renderHome();
    expect(screen.getByTestId('home-sport-soccer')).toBeTruthy();
    expect(screen.queryByTestId('home-sport-golf')).toBeNull();
  });

  it('offers Perfected action under Tools and routes to it', () => {
    renderHome();
    const tool = screen.getByTestId('home-tool-perfected');
    expect(tool).toBeTruthy();
    fireEvent.press(tool);
    expect(mockNavigate).toHaveBeenCalledWith('PerfectedAction');
  });

  it('shows the no-sessions line when history is empty', () => {
    renderHome();
    expect(
      screen.getByText('No sessions yet — record your first shot.'),
    ).toBeTruthy();
    expect(screen.queryByTestId('home-recent-card')).toBeNull();
  });

  it('shows the latest shot as one card and opens Sessions on tap', () => {
    useHistoryStore.getState().addShot({
      sport: 'golf',
      quality: 'high',
      club: 'driver',
      method: 'physics-fit',
      carryYards: 241.4,
      totalYards: 262,
      at: Date.now(),
    });
    renderHome();

    // The sports row also says "Golf" — scope the checks to the card.
    const card = screen.getByTestId('home-recent-card');
    expect(within(card).getByText('Golf')).toBeTruthy();
    expect(within(card).getByText('241 yd carry')).toBeTruthy();
    expect(within(card).getByText('High')).toBeTruthy();
    expect(within(card).getByText('Just now')).toBeTruthy();

    fireEvent.press(card);
    expect(mockNavigate).toHaveBeenCalledWith('Sessions');
  });
});
