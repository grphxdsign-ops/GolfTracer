/**
 * App shell — the tab-era navigator (docs/RESEARCH-APPS.md §3): a root
 * native stack whose first screen is the four-tab shell (Home · Sessions ·
 * Insights · Profile behind GlassTabBar's center Record action), with every
 * capture/analysis flow and the onboarding screens pushed full-screen over
 * it. Onboarding gates the initial route (DESIGN.md §10); the navigator
 * waits for the persisted profile to hydrate so onboarded users never
 * flash Welcome.
 */
import { useEffect, useState } from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar, StyleSheet, View } from 'react-native';
import {
  SafeAreaProvider,
  initialWindowMetrics,
} from 'react-native-safe-area-context';

import type {
  RootStackParamList,
  TabParamList,
} from '../types/navigation';
import { useProfileStore } from '../state/profileStore';
import { modules } from './registry';
import { HomeScreen } from './screens/HomeScreen';
import { SessionsScreen } from '../modules/sessions/SessionsScreen';
import { InsightsScreen } from '../modules/insights/InsightsScreen';
import { ProfileScreen } from '../modules/profile/ProfileScreen';
import { GlassTabBar } from './navigation/GlassTabBar';
import { TracerLoader } from './components';
import { colors, navigationTheme } from './theme';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const appTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

/** The persistent shell: in-content headers only (no native header bar). */
function Tabs(): React.JSX.Element {
  return (
    <Tab.Navigator
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Sessions" component={SessionsScreen} />
      <Tab.Screen name="Insights" component={InsightsScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

/**
 * True once the persisted profile store has rehydrated from AsyncStorage.
 * Mounting the navigator before that would pick initialRouteName from the
 * default (not-onboarded) state and flash Welcome at returning users.
 */
function useProfileHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() =>
    useProfileStore.persist.hasHydrated(),
  );
  useEffect(() => {
    const unsubscribe = useProfileStore.persist.onFinishHydration(() =>
      setHydrated(true),
    );
    // Hydration may have finished between the initial read and subscribing.
    if (useProfileStore.persist.hasHydrated()) {
      setHydrated(true);
    }
    return unsubscribe;
  }, []);
  return hydrated;
}

export function App() {
  const hydrated = useProfileHydrated();
  const onboardingComplete = useProfileStore((s) => s.onboardingComplete);

  return (
    // SafeAreaProvider is the one permitted shell addition: screens read
    // useSafeAreaInsets() for bottom padding and need a provider above the
    // navigator. initialMetrics avoids a first-frame inset flash.
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      {/* Every screen is dark (colors.background) — force light status-bar
          icons so they stay visible regardless of OS appearance. */}
      <StatusBar
        barStyle="light-content"
        backgroundColor={colors.background}
      />
      {hydrated ? (
        <NavigationContainer theme={appTheme}>
          <Stack.Navigator
            initialRouteName={
              (onboardingComplete
                ? 'Tabs'
                : 'Welcome') as keyof RootStackParamList
            }
            screenOptions={navigationTheme}
          >
            <Stack.Screen
              name="Tabs"
              component={Tabs}
              options={{ headerShown: false }}
            />
            {modules.flatMap((mod) =>
              mod.screens.map((screen) => (
                <Stack.Screen
                  key={screen.route}
                  name={screen.route as keyof RootStackParamList}
                  component={screen.component}
                  options={{ title: screen.title }}
                />
              )),
            )}
          </Stack.Navigator>
        </NavigationContainer>
      ) : (
        // While the profile hydrates, the tracer draws itself on the launch
        // screen instead of the wrong screen or a blank beat.
        <View style={styles.hydrating}>
          <TracerLoader size={132} testID="launch-loader" />
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  hydrating: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
