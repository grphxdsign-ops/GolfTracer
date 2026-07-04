/**
 * Compat contract for the theme rewrite (docs/DESIGN.md §2–§5): every legacy
 * export/key must keep existing so unmigrated screens compile and render,
 * and the new token groups must be present for migrated screens.
 */
import {
  colors,
  motion,
  navigationTheme,
  radii,
  sharedStyles,
  spacing,
  tracer,
  typography,
} from '../theme';

describe('theme compat contract', () => {
  it('keeps all legacy color keys', () => {
    const legacyColorKeys = [
      'background',
      'surface',
      'surfaceRaised',
      'primary',
      'primaryPressed',
      'accent',
      'text',
      'textMuted',
      'textDisabled',
      'border',
      'danger',
      'success',
    ] as const;
    for (const key of legacyColorKeys) {
      expect(colors[key]).toBeTruthy();
    }
  });

  it('keeps legacy spacing and radii keys', () => {
    for (const key of ['xs', 'sm', 'md', 'lg', 'xl'] as const) {
      expect(typeof spacing[key]).toBe('number');
    }
    for (const key of ['sm', 'md', 'lg'] as const) {
      expect(typeof radii[key]).toBe('number');
    }
  });

  it('keeps legacy typography roles', () => {
    for (const key of ['title', 'subtitle', 'body', 'label'] as const) {
      expect(typography[key]).toBeTruthy();
    }
  });

  it('keeps all sharedStyles keys', () => {
    const keys = [
      'screen',
      'centered',
      'card',
      'button',
      'buttonDisabled',
      'buttonText',
      'buttonTextDisabled',
    ] as const;
    for (const key of keys) {
      expect(sharedStyles[key]).toBeTruthy();
    }
  });

  it('keeps legacy navigationTheme keys', () => {
    expect(navigationTheme.headerStyle).toBeTruthy();
    expect(navigationTheme.headerTintColor).toBeTruthy();
    expect(navigationTheme.contentStyle).toBeTruthy();
  });

  it('exposes the new token groups', () => {
    expect(motion.duration.press).toBe(100);
    expect(tracer.head).toBeTruthy();
    expect(colors.stage).toBeTruthy();
    expect(radii.pill).toBe(999);
    expect(spacing.xxl).toBe(48);
  });
});
