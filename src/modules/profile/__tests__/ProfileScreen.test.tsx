/**
 * Profile tab tests: account states, live preference editing (the promise
 * onboarding makes), sports toggling, the two-tap clear-history confirm,
 * and sign-out re-arming onboarding + resetting the navigator.
 */
import { NavigationContainer } from '@react-navigation/native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ProfileScreen } from '../ProfileScreen';
import { useProfileStore } from '../../../state/profileStore';
import { useHistoryStore } from '../../../state/historyStore';

jest.mock('react-native-safe-area-context', () =>
  jest.requireActual<{ default: unknown }>(
    'react-native-safe-area-context/jest/mock',
  ).default,
);

const mockNavigate = jest.fn();
const mockReset = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate, reset: mockReset }),
  };
});

const renderProfile = () =>
  render(
    <NavigationContainer>
      <ProfileScreen />
    </NavigationContainer>,
  );

describe('ProfileScreen', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockReset.mockClear();
    useProfileStore.getState().reset();
    useHistoryStore.getState().clear();
  });

  it('shows the guest account state', () => {
    renderProfile();
    expect(screen.getByText('Guest')).toBeTruthy();
    expect(
      screen.getByText('Guest — history stays on this device'),
    ).toBeTruthy();
  });

  it('shows the Apple account with monogram initials', () => {
    useProfileStore.getState().setAccount({
      provider: 'apple',
      userId: 'u1',
      name: 'Sam Sneed',
      email: null,
    });
    renderProfile();
    expect(screen.getByText('Sam Sneed')).toBeTruthy();
    expect(screen.getByText('SS')).toBeTruthy();
    expect(screen.getByText('Signed in with Apple')).toBeTruthy();
  });

  it('edits units and handedness straight into the store', () => {
    renderProfile();
    fireEvent.press(screen.getByRole('button', { name: 'Meters' }));
    expect(useProfileStore.getState().preferences.units).toBe('meters');
    fireEvent.press(screen.getByRole('button', { name: 'Left' }));
    expect(useProfileStore.getState().preferences.handedness).toBe('left');
  });

  it('toggles the analytics chip', () => {
    renderProfile();
    fireEvent.press(screen.getByTestId('profile-analytics'));
    expect(useProfileStore.getState().preferences.shareAnalytics).toBe(false);
  });

  it('materializes the complement when tapping a sport in the default-all state', () => {
    // No explicit pick = all available active; tapping soccer means
    // "turn soccer OFF", leaving golf as the selection.
    renderProfile();
    fireEvent.press(screen.getByTestId('profile-sport-soccer'));
    expect(useProfileStore.getState().sports).toEqual(['golf']);
  });

  it('toggles sports normally once a selection exists, ignoring coming-soon rows', () => {
    useProfileStore.getState().toggleSport('golf');
    renderProfile();
    fireEvent.press(screen.getByTestId('profile-sport-soccer'));
    expect(useProfileStore.getState().sports).toEqual(['golf', 'soccer']);
    fireEvent.press(screen.getByTestId('profile-sport-tennis'));
    expect(useProfileStore.getState().sports).toEqual(['golf', 'soccer']);
  });

  it('never lets the last active sport be zeroed out', () => {
    useProfileStore.getState().toggleSport('golf');
    renderProfile();
    fireEvent.press(screen.getByTestId('profile-sport-golf'));
    expect(useProfileStore.getState().sports).toEqual(['golf']);
  });

  it('clears history only after the second confirming tap', () => {
    useHistoryStore.getState().addShot({
      sport: 'golf',
      quality: 'high',
      club: 'driver',
      method: 'physics-fit',
      carryYards: 240,
    });
    renderProfile();
    fireEvent.press(screen.getByTestId('profile-clear-history'));
    expect(useHistoryStore.getState().shots).toHaveLength(1);
    expect(screen.getByText('Tap again to clear')).toBeTruthy();
    fireEvent.press(screen.getByTestId('profile-clear-history'));
    expect(useHistoryStore.getState().shots).toHaveLength(0);
  });

  it('signs out: re-arms onboarding and resets the navigator to Welcome', () => {
    useProfileStore.setState({ onboardingComplete: true });
    renderProfile();
    fireEvent.press(screen.getByTestId('profile-sign-out'));
    expect(useProfileStore.getState().onboardingComplete).toBe(false);
    expect(useProfileStore.getState().account).toBeNull();
    expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{ name: 'Welcome' }],
    });
  });
});
