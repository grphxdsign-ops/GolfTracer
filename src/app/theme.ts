/**
 * Shared visual language: dark green / white palette, spacing scale, and
 * reusable button/card styles. Part of the scaffold-owned app shell.
 */
import { StyleSheet } from 'react-native';

export const colors = {
  background: '#0B2818',
  surface: '#12351F',
  surfaceRaised: '#1A4429',
  primary: '#2E8B57',
  primaryPressed: '#26734A',
  accent: '#8FE388',
  text: '#FFFFFF',
  textMuted: '#B9D6C3',
  textDisabled: '#6E8A79',
  border: '#2A5A3C',
  danger: '#E5484D',
  success: '#46A758',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 12,
  lg: 20,
} as const;

export const typography = {
  title: { fontSize: 24, fontWeight: '700' as const, color: colors.text },
  subtitle: { fontSize: 16, fontWeight: '600' as const, color: colors.textMuted },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.text },
  label: { fontSize: 13, fontWeight: '500' as const, color: colors.textMuted },
} as const;

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.md,
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
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  buttonDisabled: {
    backgroundColor: colors.surfaceRaised,
  },
  buttonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  buttonTextDisabled: {
    color: colors.textDisabled,
  },
});

export const navigationTheme = {
  headerStyle: { backgroundColor: colors.surface },
  headerTintColor: colors.text,
  contentStyle: { backgroundColor: colors.background },
} as const;
