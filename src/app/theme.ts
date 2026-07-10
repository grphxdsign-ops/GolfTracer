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
  /** Video/tracer/pose stages, segmented tracks, inputs — darkest tier. */
  stage: '#0A0E07',
  /** Screen background (tier 0) — warm olive-black. */
  background: '#11180E',
  /** Glass tier 1 — cards, list rows. Composites over whatever is beneath. */
  surface: 'rgba(255,251,235,0.055)',
  /** Glass tier 2 — selected rows, segmented thumb, secondary buttons. */
  surfaceRaised: 'rgba(255,251,235,0.09)',
  /** Glass tier 3 — chips/badges floating over video, tooltips. */
  overlay: 'rgba(255,251,235,0.13)',
  /** Top-edge catchlight hairline on glass cards. */
  glassHighlight: 'rgba(255,253,245,0.10)',
  primary: '#5BCE62',
  primaryPressed: '#4AB851',
  accent: '#A9E8A2',
  /** Glassy warm cream — never opaque white. */
  text: 'rgba(255,251,242,0.96)',
  textMuted: 'rgba(255,247,235,0.66)',
  textDisabled: 'rgba(255,247,235,0.38)',
  /** Label color on `primary` fills. */
  textOnAccent: '#0A1607',
  borderSubtle: 'rgba(255,248,235,0.10)',
  border: 'rgba(255,248,235,0.14)',
  borderStrong: 'rgba(255,248,235,0.22)',
  danger: '#E5544B',
  /** Pressed fill for danger buttons — mirrors primaryPressed. */
  dangerPressed: '#C93A3F',
  success: '#5BCE62',
  warning: '#E6AE4A',
} as const;

/**
 * Tint a `#RRGGBB`/`#RGB` token to a translucent rgba() string. All derived
 * tints (selected chips, done-step rings, trim regions) go through this so a
 * palette change propagates everywhere (DESIGN.md §2). Non-hex input is
 * returned unchanged — alpha-on-alpha stacking is a design smell, not a
 * runtime error.
 */
export function alpha(hex: string, a: number): string {
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const channels = m3
    ? [m3[1]! + m3[1]!, m3[2]! + m3[2]!, m3[3]! + m3[3]!]
    : m6
      ? [m6[1]!, m6[2]!, m6[3]!]
      : null;
  if (!channels) {
    return hex;
  }
  const [r, g, b] = channels.map((c) => parseInt(c, 16));
  return `rgba(${r},${g},${b},${a})`;
}

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
  /** Hero selection tiles (sport picker) — DESIGN.md §4. */
  xl: 24,
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
    // The one sanctioned text effect: a soft warm sheen on hero numerals
    // (DESIGN.md §2) — glassy broadcast glow, not a drop shadow.
    textShadowColor: 'rgba(255,236,200,0.28)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
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
    press: 90,
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
  /**
   * Named spring configs (DESIGN.md §5) — single source so Button/SportTile
   * never duplicate the numbers. `press` is the softened 2026 pass: damping
   * raised 22→30 (ζ≈0.75, ~3% overshoot, "snappy without being abrupt")
   * from the punchier ζ≈0.55 launch value, which read closer to a 2020
   * Framer demo than a restrained 2026 flagship.
   */
  spring: {
    press: { stiffness: 400, damping: 30, mass: 1 },
  },
} as const;

// `sharedStyles` is layout-primitive only (screen/centered) — visual
// components (card, button) live in the kit (Card, Button) and must not be
// re-implemented here. The scaffold's original card/button/buttonText*
// entries were deleted: zero callers remained (superseded by <Card>/
// <Button> everywhere), and their token values had already drifted from
// the real components (DESIGN.md §2/§5).
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
