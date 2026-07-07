/**
 * navTabs — the single cast point for cross-navigator tab jumps, mirroring
 * navSport/navOnboarding. Flow screens (Results, Analyze, onboarding…) live
 * on the root stack; landing back on a tab means navigating INTO the nested
 * Tabs navigator, which react-navigation cannot resolve from a bare
 * `navigate('Home')` on a parent stack. Every "go home / open a tab" jump
 * routes through here so the nesting shape lives in exactly one file.
 */
import type { TabParamList } from '../../types/navigation';

export type TabRoute = keyof TabParamList;

interface TabNavigator {
  navigate(route: string, params?: { screen: TabRoute }): void;
  reset(state: {
    index: number;
    routes: { name: string; params?: { screen: TabRoute } }[];
  }): void;
}

/** Jump to a tab from anywhere (flow screens included). */
export function navigateTab(navigation: object, tab: TabRoute): void {
  (navigation as TabNavigator).navigate('Tabs', { screen: tab });
}

/**
 * Replace the whole stack with the tab shell — used when a flow finishes
 * (e.g. "New shot" from Results) so back never re-enters a dead flow.
 */
export function resetToTab(navigation: object, tab: TabRoute): void {
  (navigation as TabNavigator).reset({
    index: 0,
    routes: [{ name: 'Tabs', params: { screen: tab } }],
  });
}
