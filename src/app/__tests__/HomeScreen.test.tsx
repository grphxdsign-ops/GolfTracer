import { NavigationContainer } from '@react-navigation/native';
import { render, screen } from '@testing-library/react-native';

import { HomeScreen } from '../screens/HomeScreen';
import { useSessionStore } from '../../state/sessionStore';

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

  it('disables Analyze until a video is set and Distance until tracking is done', () => {
    renderHome();
    const analyze = screen.getByRole('button', { name: 'Analyze' });
    const distance = screen.getByRole('button', { name: 'Distance' });
    expect(analyze.props.accessibilityState.disabled).toBe(true);
    expect(distance.props.accessibilityState.disabled).toBe(true);
  });
});
