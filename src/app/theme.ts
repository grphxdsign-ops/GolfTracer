/**
 * GolfTracer design tokens — see docs/DESIGN.md §2 (color), §3 (typography),
 * §4 (spacing/radii), §5 (motion), §6 (tracer ember palette).
 *
 * Backwards-compatible rewrite of the scaffold theme: every legacy export and
 * key keeps existing (values re-pointed at the new palette) so unmigrated
 * screens still compile and render coherently while screen agents migrate.
 */
import { Easing, StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';

export const colors = {
  /** Video/tracer/pose stages, segmented-control tracks — darkest tier. */
  stage: '#060F0A',
  background: '#0B1F14',
  surface: '#122B1B',
  surfaceRaised: '#1A3823',
  /** Tooltips, popovers, chrome floating over video (tier 3). */
  overlay: '#234630',
  primary: '#4AC97E',
  primaryPressed: '#3BAF6A',
  accent: '#8FE3A8',
  text: '#F2F7F3',
  textMuted: '#A9C4B1',
  textDisabled: '#5E7767',
  /** Label color on `primary` fills. */
  textOnAccent: '#07130C',
  borderSubtle: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.12)',
  borderStrong: 'rgba(255,255,255,0.18)',
  danger: '#E5484D',
  /** Pressed fill for danger buttons — mirrors primaryPressed. */
  dangerPressed: '#C93A3F',
  success: '#4AC97E',
  warning: '#E0A83E',
} as const;

/** Tracer ember palette — video-stage only, never in chrome (DESIGN.md §2). */
export const tracer = {
  head: '#FFE9C4',
  mid: '#FF9E2C',
  tail: '#FF4D00',
  glow: 'rgba(255,122,26,0.35)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

/** Type roles — DESIGN.md §3. Tabular figures mandatory on aligning numbers. */
export const typography = StyleSheet.create({
  display: {
    fontSize: 48,
    lineHeight: 50,
    fontWeight: '600',
    letterSpacing: -1.2,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '700',
    letterSpacing: -0.56,
    color: colors.text,
  },
  heading: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '600',
    letterSpacing: -0.3,
    color: colors.text,
  },
  subtitle: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.2,
    color: colors.text,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    letterSpacing: 0,
    color: colors.text,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    letterSpacing: 0,
    color: colors.textMuted,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0,
    color: colors.textMuted,
  },
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: 0.66,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
} satisfies Record<string, TextStyle>);

/** Motion tokens — DESIGN.md §5. Transform/opacity only, native driver. */
export const motion = {
  duration: {
    press: 100,
    fast: 150,
    base: 200,
    gentle: 250,
    countUp: 700,
    reveal: 700,
  },
  easing: {
    enter: Easing.bezier(0.16, 1, 0.3, 1),
    exit: Easing.in(Easing.cubic),
    standard: Easing.out(Easing.cubic),
  },
} as const;

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  buttonDisabled: {
    backgroundColor: colors.surfaceRaised,
  },
  buttonText: {
    color: colors.textOnAccent,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextDisabled: {
    color: colors.textDisabled,
  },
});

/**
 * Native-stack screenOptions — header blends into the screen background
 * (no separate surface bar). Every key must remain a valid
 * NativeStackNavigationOptions member (spread directly in frozen App.tsx).
 */
export const navigationTheme = {
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.text,
  headerTitleStyle: { fontSize: 17, fontWeight: '600' as const },
  headerShadowVisible: false,
  headerBackTitleVisible: false,
  contentStyle: { backgroundColor: colors.background },
} as const;
