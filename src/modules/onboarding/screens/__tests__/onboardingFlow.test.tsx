import { Text } from 'react-native';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import { Camera } from 'react-native-vision-camera';

import { onboardingModule } from '../..';
import { useProfileStore } from '../../../../state/profileStore';

// Screens read useSafeAreaInsets(); the package's jest mock supplies zero
// insets without needing a native SafeAreaProvider.
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual<{ default: unknown }>(
    'react-native-safe-area-context/jest/mock',
  ).default,
);

const performRequestMock = appleAuth.performRequest as unknown as jest.Mock;
const requestCameraPermissionMock =
  Camera.requestCameraPermission as unknown as jest.Mock;

function TabsStub() {
  return <Text>TabsRouteStub</Text>;
}

function renderFlow(initialRouteName = 'Welcome') {
  const Stack = createNativeStackNavigator();
  return render(
    <NavigationContainer>
      <Stack.Navigator initialRouteName={initialRouteName}>
        <Stack.Screen name="Tabs" component={TabsStub} />
        {onboardingModule.screens.map((s) => (
          <Stack.Screen
            key={s.route}
            name={s.route}
            component={s.component}
            options={{ title: s.title }}
          />
        ))}
      </Stack.Navigator>
    </NavigationContainer>,
  );
}

beforeEach(() => {
  useProfileStore.getState().reset();
  performRequestMock.mockClear();
  requestCameraPermissionMock.mockClear();
});

describe('onboarding flow', () => {
  it('registers the five onboarding routes in flow order', () => {
    expect(onboardingModule.screens.map((s) => s.route)).toEqual([
      'Welcome',
      'SignIn',
      'SportSelect',
      'OnboardingPreferences',
      'OnboardingPermissions',
    ]);
  });

  it('walks Welcome → sign in', async () => {
    renderFlow();
    expect(screen.getByText('Trace every shot.')).toBeTruthy();
    fireEvent.press(screen.getByText('Get started'));
    await waitFor(() =>
      expect(screen.getByText('Sign in with Apple')).toBeTruthy(),
    );
  });

  it('stores the Apple account and continues to sport select', async () => {
    renderFlow('SignIn');
    fireEvent.press(screen.getByText('Sign in with Apple'));
    await waitFor(() =>
      expect(screen.getByText('What do you play?')).toBeTruthy(),
    );
    expect(useProfileStore.getState().account).toEqual({
      provider: 'apple',
      userId: 'mock-apple-user',
      name: 'Mock Golfer',
      email: 'mock@privaterelay.appleid.com',
    });
  });

  it('continues as guest with a full guest profile', async () => {
    renderFlow('SignIn');
    fireEvent.press(screen.getByText('Continue as guest'));
    await waitFor(() =>
      expect(screen.getByText('What do you play?')).toBeTruthy(),
    );
    expect(useProfileStore.getState().account).toEqual({
      provider: 'guest',
      userId: 'guest',
      name: null,
      email: null,
    });
  });

  it('stays on sign in with a blame-free line when Apple is cancelled', async () => {
    performRequestMock.mockRejectedValueOnce({
      code: '1001',
      message: 'The user canceled the authorization attempt',
    });
    renderFlow('SignIn');
    fireEvent.press(screen.getByText('Sign in with Apple'));
    await waitFor(() =>
      expect(screen.getByTestId('signin-notice')).toBeTruthy(),
    );
    expect(
      screen.getByText('No problem — sign in any time, or continue as guest.'),
    ).toBeTruthy();
    expect(screen.queryByText('What do you play?')).toBeNull();
    expect(useProfileStore.getState().account).toBeNull();
  });

  it('requires at least one sport before continuing', async () => {
    renderFlow('SportSelect');
    const cta = screen.getByRole('button', { name: 'Continue' });
    expect(cta.props.accessibilityState.disabled).toBe(true);

    // Coming-soon sports render disabled and unselectable.
    const tennis = screen.getByTestId('sport-tile-tennis');
    expect(tennis.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(screen.getByTestId('sport-tile-golf'));
    expect(useProfileStore.getState().sports).toEqual(['golf']);
    expect(
      screen.getByRole('button', { name: 'Continue' }).props.accessibilityState
        .disabled,
    ).toBe(false);

    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(screen.getByText('Set your preferences')).toBeTruthy(),
    );
  });

  it('multi-selects and deselects sports via the store', () => {
    renderFlow('SportSelect');
    fireEvent.press(screen.getByTestId('sport-tile-golf'));
    fireEvent.press(screen.getByTestId('sport-tile-soccer'));
    expect(useProfileStore.getState().sports).toEqual(['golf', 'soccer']);
    fireEvent.press(screen.getByTestId('sport-tile-golf'));
    expect(useProfileStore.getState().sports).toEqual(['soccer']);
  });

  it('writes preferences to the store and continues to permissions', async () => {
    renderFlow('OnboardingPreferences');
    fireEvent.press(screen.getByText('Meters'));
    fireEvent.press(screen.getByText('Left-handed'));
    fireEvent.press(screen.getByTestId('pref-analytics'));
    expect(useProfileStore.getState().preferences).toEqual({
      units: 'meters',
      handedness: 'left',
      shareAnalytics: false,
    });

    fireEvent.press(screen.getByText('Continue'));
    await waitFor(() =>
      expect(screen.getByText('Two quick permissions')).toBeTruthy(),
    );
  });

  it('requests the camera permission from the primer card', async () => {
    renderFlow('OnboardingPermissions');
    fireEvent.press(screen.getByText('Allow camera'));
    await waitFor(() => expect(screen.getByText('Allowed')).toBeTruthy());
    expect(requestCameraPermissionMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Allow camera')).toBeNull();
  });

  it('never blocks on a denied camera permission', async () => {
    requestCameraPermissionMock.mockResolvedValueOnce('denied');
    renderFlow('OnboardingPermissions');
    fireEvent.press(screen.getByText('Allow camera'));
    await waitFor(() =>
      expect(
        screen.getByText(/recording asks again when you use it/),
      ).toBeTruthy(),
    );

    fireEvent.press(screen.getByText('Finish'));
    await waitFor(() => expect(screen.getByText('TabsRouteStub')).toBeTruthy());
    expect(useProfileStore.getState().onboardingComplete).toBe(true);
  });

  it('finish completes onboarding and resets the stack to the tab shell', async () => {
    renderFlow('OnboardingPermissions');
    expect(useProfileStore.getState().onboardingComplete).toBe(false);
    fireEvent.press(screen.getByText('Finish'));
    await waitFor(() => expect(screen.getByText('TabsRouteStub')).toBeTruthy());
    expect(useProfileStore.getState().onboardingComplete).toBe(true);
    // The photo library card never fires a fake OS prompt.
    expect(requestCameraPermissionMock).not.toHaveBeenCalled();
  });
});
