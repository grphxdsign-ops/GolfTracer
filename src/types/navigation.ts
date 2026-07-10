/**
 * Navigation contracts. The 2026 IA redesign (docs/RESEARCH-APPS.md) moved
 * the app from a flat stack to a tab shell: four tabs + flow screens pushed
 * full-screen over them. Tab route names live in TabParamList; everything
 * else stays a root-stack route. Sport/onboarding modules keep registering
 * flow screens through the registry cast (navSport/navOnboarding).
 */
import type { NavigatorScreenParams } from '@react-navigation/native';

/** The four persistent tabs (GlassTabBar adds the center Record action). */
export type TabParamList = {
  Home: undefined;
  Sessions: undefined;
  Insights: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  /** The tab shell — initial route once onboarding is complete. */
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Record: undefined;
  Import: undefined;
  Review: undefined;
  Analyze: undefined;
  TracerPreview: undefined;
  Calibration: undefined;
  Results: undefined;
  /** Historical shot drill-in from Sessions/Home. */
  ShotDetail: { shotId: string };
};
