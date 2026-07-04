/**
 * Sessions module — shot history drill-in (DESIGN.md §11): Home's recent
 * session card taps through to the full session list.
 *
 * The 'Sessions' route is mounted through App.tsx's existing route cast
 * (like the sport routes; the frozen RootStackParamList is not touched).
 */
import type { ScreenRegistration } from '../../types/modules';
import { SessionsScreen } from './SessionsScreen';

export const sessionsModule: {
  name: string;
  screens: ScreenRegistration[];
} = {
  name: 'sessions',
  screens: [
    {
      route: 'Sessions',
      component: SessionsScreen,
      title: 'Sessions',
    },
  ],
};
