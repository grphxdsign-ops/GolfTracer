/**
 * Profile store — account, preferences, and chosen sports. The onboarding
 * flow is the only writer; every surface reads. Persisted to AsyncStorage so
 * onboarding runs once and Tracr opens on Home thereafter.
 *
 * Contract file: screens consume via the exported hooks/actions only. The
 * shape below is pinned by src/state/__tests__/profileStore.test.ts.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SportId } from '../modules/sports/sportCatalog';

/** Account identity as returned by Sign in with Apple (or guest). */
export interface Account {
  provider: 'apple' | 'guest';
  /** Stable Apple user identifier (or 'guest'). */
  userId: string;
  /** Display name; Apple only shares it on FIRST sign-in — persist it. */
  name: string | null;
  /** May be a private-relay address, or null when scope was declined. */
  email: string | null;
}

export type Units = 'yards' | 'meters';
export type Handedness = 'right' | 'left';

export interface Preferences {
  units: Units;
  handedness: Handedness;
  /** Deliver tips/analysis summaries. Set during onboarding, togglable later. */
  shareAnalytics: boolean;
}

export interface ProfileState {
  account: Account | null;
  preferences: Preferences;
  /** Sports the user selected during onboarding; first is their primary. */
  sports: SportId[];
  onboardingComplete: boolean;

  setAccount(account: Account): void;
  setPreferences(patch: Partial<Preferences>): void;
  toggleSport(sport: SportId): void;
  completeOnboarding(): void;
  /** Sign out: clears the account and re-arms onboarding. */
  reset(): void;
}

const initialState = {
  account: null,
  preferences: {
    units: 'yards' as Units,
    handedness: 'right' as Handedness,
    shareAnalytics: true,
  },
  sports: [] as SportId[],
  onboardingComplete: false,
};

export const useProfileStore = create<ProfileState>()(
  persist(
    (set) => ({
      ...initialState,
      setAccount: (account) => set({ account }),
      setPreferences: (patch) =>
        set((s) => ({ preferences: { ...s.preferences, ...patch } })),
      toggleSport: (sport) =>
        set((s) => ({
          sports: s.sports.includes(sport)
            ? s.sports.filter((x) => x !== sport)
            : [...s.sports, sport],
        })),
      completeOnboarding: () => set({ onboardingComplete: true }),
      reset: () => set({ ...initialState }),
    }),
    {
      name: 'tracr-profile',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
