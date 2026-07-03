/**
 * navigateSport — the single cast point for sport routes. Sport screens are
 * mounted through App.tsx's existing `route as keyof RootStackParamList`
 * cast without touching the frozen RootStackParamList; this helper performs
 * the matching cast on the navigation side so callers stay typed to the
 * SportRoute union.
 */

/** Routes registered by the sport modules (soccer + perfected action). */
export type SportRoute =
  | 'SoccerAnalyze'
  | 'SoccerResults'
  | 'PerfectedAction'
  | 'PerfectedResults';

interface SportNavigator {
  navigate(route: string): void;
}

/**
 * Navigate to a sport route with any react-navigation navigation prop
 * (whose `navigate` is typed against the frozen RootStackParamList).
 */
export function navigateSport(navigation: object, route: SportRoute): void {
  (navigation as SportNavigator).navigate(route);
}
