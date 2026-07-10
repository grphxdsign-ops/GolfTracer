/**
 * Home tab tests (DESIGN.md §11): greeting header, latest-session hero →
 * ShotDetail, promoted insight → Insights tab, conditional pipeline card,
 * sports shortcut row, tools, and the no-history empty state (the only
 * place Home shows a Record button — the tab bar owns capture otherwise).
 */
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { HomeScreen, homeGreeting, weekLine } from '../screens/HomeScreen';
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

const addGolfShot = (carryYards: number, at = Date.now()) =>
  useHistoryStore.getState().addShot({
    sport: 'golf',
    quality: 'high',
    club: 'driver',
    method: 'physics-fit',
    carryYards,
    totalYards: carryYards + 20,
    at,
  });

const renderHome = () =>
  render(
    <NavigationContainer>
      <HomeScreen />
    </NavigationContainer>,
  );

describe('homeGreeting / weekLine', () => {
  it('greets by daypart and first name', () => {
    expect(homeGreeting(8, 'Sam')).toBe('Morning, Sam.');
    expect(homeGreeting(14, 'Sam')).toBe('Afternoon, Sam.');
    expect(homeGreeting(21, null)).toBe('Evening.');
  });

  it('counts the trailing week honestly', () => {
    expect(weekLine(0)).toBe('Ready to trace your next shot.');
    expect(weekLine(1)).toBe('1 session this week.');
    expect(weekLine(3)).toBe('3 sessions this week.');
  });
});

describe('HomeScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    useSessionStore.getState().reset();
    useProfileStore.getState().reset();
    useHistoryStore.getState().clear();
  });

  it('shows the daypart greeting with the standing subtitle when empty', () => {
    renderHome();
    expect(screen.getByText(/^(Morning|Afternoon|Evening)\.$/)).toBeTruthy();
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
    expect(
      screen.getByText(/^(Morning|Afternoon|Evening), Sam\.$/),
    ).toBeTruthy();
  });

  it('offers Record + Import heroes ONLY in the no-history empty state', () => {
    renderHome();
    fireEvent.press(screen.getByRole('button', { name: 'Record' }));
    expect(mockNavigate).toHaveBeenCalledWith('Record');
    fireEvent.press(screen.getByRole('button', { name: 'Import a clip' }));
    expect(mockNavigate).toHaveBeenCalledWith('Import');
  });

  it('replaces the Record hero with the latest-session card once history exists', () => {
    addGolfShot(241.4);
    renderHome();
    // The tab bar owns capture now — no Record button on Home.
    expect(screen.queryByRole('button', { name: 'Record' })).toBeNull();
    const card = screen.getByTestId('home-recent-card');
    expect(within(card).getByText('Golf · Driver')).toBeTruthy();
    expect(within(card).getByText('241')).toBeTruthy();
    expect(within(card).getByText('High')).toBeTruthy();
    // Import stays reachable under Tools.
    expect(screen.getByTestId('home-tool-import')).toBeTruthy();
  });

  it('opens the latest shot detail from the hero card', () => {
    addGolfShot(241.4);
    renderHome();
    const id = useHistoryStore.getState().shots[0]!.id;
    fireEvent.press(screen.getByTestId('home-recent-card'));
    expect(mockNavigate).toHaveBeenCalledWith('ShotDetail', { shotId: id });
  });

  it('shows the honest delta only once enough prior history exists', () => {
    // Two prior shots — below MIN_SHOTS_FOR_DELTA, no trend pill.
    addGolfShot(230, Date.now() - 3000);
    addGolfShot(235, Date.now() - 2000);
    addGolfShot(247);
    renderHome();
    expect(screen.queryByTestId('home-hero-trend')).toBeNull();
  });

  it('promotes one insight card when a club trends up, opening Insights', () => {
    // Six driver shots, newer half clearly longer → promoted insight.
    [230, 231, 229, 240, 242, 244].forEach((carry, i) =>
      addGolfShot(carry, Date.now() - (6 - i) * 1000),
    );
    renderHome();
    const card = screen.getByTestId('home-insight-card');
    expect(within(card).getByText(/Driver carry up \d+ yd/)).toBeTruthy();
    fireEvent.press(card);
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', { screen: 'Insights' });
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
});
