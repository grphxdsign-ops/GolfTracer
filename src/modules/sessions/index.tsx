/**
 * Sessions module — the shot library. SessionsScreen itself mounts as a
 * tab (App.tsx tab shell); this registry contributes the ShotDetail
 * drill-in pushed over the tabs from session rows and Home's latest-
 * session card (docs/RESEARCH-APPS.md §3.4).
 */
import type { ScreenRegistration } from '../../types/modules';
import { ShotDetailScreen } from './ShotDetailScreen';

export const sessionsModule: {
  name: string;
  screens: ScreenRegistration[];
} = {
  name: 'sessions',
  screens: [
    {
      route: 'ShotDetail',
      component: ShotDetailScreen,
      title: 'Shot',
    },
  ],
};
