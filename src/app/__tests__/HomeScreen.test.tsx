import { NavigationContainer } from '@react-navigation/native';
import { render, screen } from '@testing-library/react-native';

import { HomeScreen } from '../screens/HomeScreen';
import { useSessionStore } from '../../state/sessionStore';

// HomeScreen reads useSafeAreaInsets(); the package's jest mock supplies
// zero insets without needing a native SafeAreaProvider.
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual<{ default: unknown }>(
    'react-native-safe-area-context/jest/mock',
  ).default,
);

const renderHome = () =>
  render(
    <NavigationContainer>
      <HomeScreen />
    </NavigationContainer>,
  );

describe('HomeScreen', () => {
  beforeEach(() => {
    useSessionStore.getState().reset();
  });

  it('shows the empty-session status', () => {
    renderHome();
    expect(screen.getByText('No video')).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
    expect(screen.getByText('Not estimated')).toBeTruthy();
  });

  it('shows the header subtitle', () => {
    renderHome();
    expect(
      screen.getByText('Trace your ball flight and estimate carry.'),
    ).toBeTruthy();
  });

  it('renders the pipeline steps inside the pipeline card', () => {
    renderHome();
    expect(screen.getByTestId('home-pipeline-card')).toBeTruthy();
    expect(screen.getByTestId('home-pipeline-steps')).toBeTruthy();
    expect(screen.getByText('Video')).toBeTruthy();
    expect(screen.getByText('Tracking')).toBeTruthy();
  });

  it('disables Analyze until a video is set and Distance until tracking is done', () => {
    renderHome();
    const analyze = screen.getByRole('button', { name: 'Analyze' });
    const distance = screen.getByRole('button', { name: 'Distance' });
    expect(analyze.props.accessibilityState.disabled).toBe(true);
    expect(distance.props.accessibilityState.disabled).toBe(true);
  });
});
