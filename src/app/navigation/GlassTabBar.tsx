/**
 * GlassTabBar — the persistent warm-glass bottom bar (docs/DESIGN.md §11,
 * docs/RESEARCH-APPS.md): four glyph tabs plus the raised center Record
 * action, the market-settled shape for capture-first sports apps
 * (SwingVision/Strava/HomeCourt). Glass = alpha fill over the background
 * with a top-edge glassHighlight hairline — never a native blur. Record is
 * deliberately label-free: the raised primary circle IS the label; text
 * under it read as clutter in the design audit.
 *
 * Icons are Skia line glyphs in the SportIcon brand style (single stroke
 * weight, round caps) in a 24×24 viewport. Active tint is colors.accent —
 * the tinted accent for selected icons/text on dark glass (§2), matching
 * the nav theme; the filled Record circle stays the bar's one primary.
 */
import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, Circle, Group, Path } from '@shopify/react-native-skia';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { alpha, colors, motion, radii, spacing } from '../theme';
import { useReducedMotion } from '../components/useReducedMotion';

const ICON_VIEWPORT = 24;
const ICON_SIZE = 22;
const RECORD_SIZE = 56;
const HALO_PAD = 5;

const iconStroke = (color: string) =>
  ({
    color,
    style: 'stroke',
    strokeWidth: 1.7,
    strokeCap: 'round',
    strokeJoin: 'round',
  }) as const;

/** Inactive tabs sit at 40% cream — quiet, but clearly present. */
const INACTIVE_TINT = 'rgba(255,247,235,0.4)';

export type TabGlyphName = 'Home' | 'Sessions' | 'Insights' | 'Profile';

const GLYPH_PATHS: Record<TabGlyphName, string[]> = {
  Home: [
    'M 4.5 10.5 L 12 4.5 L 19.5 10.5 L 19.5 19 L 4.5 19 Z',
    'M 9.5 19 L 9.5 13.5 L 14.5 13.5 L 14.5 19',
  ],
  Sessions: [
    'M 6.5 5 L 17.5 5 Q 20 5 20 7.5 L 20 14.5 Q 20 17 17.5 17 L 6.5 17 Q 4 17 4 14.5 L 4 7.5 Q 4 5 6.5 5 Z',
    'M 7.5 20 L 16.5 20',
  ],
  Insights: [
    'M 4.5 18.5 L 9.5 12.5 L 13.5 15.5 L 19.5 6.5',
    'M 15.5 6.5 L 19.5 6.5 L 19.5 10.5',
  ],
  Profile: [
    'M 5.5 19.5 C 6.5 15.8 9 14 12 14 C 15 14 17.5 15.8 18.5 19.5',
  ],
};

export function TabGlyph({
  name,
  color,
  size = ICON_SIZE,
}: {
  name: TabGlyphName;
  color: string;
  size?: number;
}): React.JSX.Element {
  return (
    <Canvas style={{ width: size, height: size }}>
      <Group transform={[{ scale: size / ICON_VIEWPORT }]}>
        {GLYPH_PATHS[name].map((d) => (
          <Path key={d} path={d} {...iconStroke(color)} />
        ))}
        {name === 'Profile' ? (
          <Circle cx={12} cy={8.5} r={3.5} {...iconStroke(color)} />
        ) : null}
      </Group>
    </Canvas>
  );
}

export function GlassTabBar({
  state,
  descriptors,
  navigation,
}: BottomTabBarProps): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const recordScale = useRef(new Animated.Value(1)).current;

  const pressRecordIn = () => {
    if (reducedMotion) return;
    Animated.timing(recordScale, {
      toValue: 0.94,
      duration: motion.duration.press,
      easing: motion.easing.standard,
      useNativeDriver: true,
    }).start();
  };
  const pressRecordOut = () => {
    if (reducedMotion) return;
    Animated.spring(recordScale, {
      toValue: 1,
      ...motion.spring.press,
      useNativeDriver: true,
    }).start();
  };

  const renderTab = (index: number) => {
    const route = state.routes[index]!;
    const focused = state.index === index;
    const label =
      descriptors[route.key]?.options.title ?? (route.name as string);
    const tint = focused ? colors.accent : INACTIVE_TINT;

    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <Pressable
        key={route.key}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        testID={`tab-${route.name}`}
        onPress={onPress}
        style={styles.tab}
      >
        <TabGlyph name={route.name as TabGlyphName} color={tint} />
        <Text style={[styles.label, { color: tint }]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View
      style={[
        styles.bar,
        { paddingBottom: Math.max(insets.bottom, spacing.sm) },
      ]}
    >
      {renderTab(0)}
      {renderTab(1)}
      <View style={styles.recordSlot}>
        <Animated.View
          style={[styles.recordHalo, { transform: [{ scale: recordScale }] }]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Record a shot"
            testID="tab-record"
            onPressIn={pressRecordIn}
            onPressOut={pressRecordOut}
            onPress={() => {
              // Record lives on the ROOT stack — target the parent
              // explicitly rather than relying on bubbling (review
              // finding); fall back for flat test mocks.
              const nav = navigation as {
                navigate(route: string): void;
                getParent?(): { navigate(route: string): void } | undefined;
              };
              (nav.getParent?.() ?? nav).navigate('Record');
            }}
            style={styles.recordButton}
          >
            <View style={styles.recordRing} />
          </Pressable>
        </Animated.View>
      </View>
      {renderTab(2)}
      {renderTab(3)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: alpha(colors.background, 0.94),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.glassHighlight,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  recordSlot: {
    width: RECORD_SIZE + HALO_PAD * 2 + spacing.sm,
    alignItems: 'center',
  },
  recordHalo: {
    marginTop: -(RECORD_SIZE / 2),
    width: RECORD_SIZE + HALO_PAD * 2,
    height: RECORD_SIZE + HALO_PAD * 2,
    borderRadius: radii.pill,
    backgroundColor: alpha(colors.primary, 0.13),
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordButton: {
    width: RECORD_SIZE,
    height: RECORD_SIZE,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: alpha(colors.primary, 0.4),
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordRing: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textOnAccent,
  },
});
