/**
 * App shell — FROZEN after scaffold. Registers the Home screen plus every
 * screen contributed by the module registry.
 */
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../types/navigation';
import { modules } from './registry';
import { HomeScreen } from './screens/HomeScreen';
import { colors, navigationTheme } from './theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

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

export function App() {
  return (
    <NavigationContainer theme={appTheme}>
      <Stack.Navigator initialRouteName="Home" screenOptions={navigationTheme}>
        <Stack.Screen
          name="Home"
          component={HomeScreen}
          options={{ title: 'GolfTracer AI' }}
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
  );
}
