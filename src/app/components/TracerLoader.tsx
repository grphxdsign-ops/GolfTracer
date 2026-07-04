/**
 * TracerLoader — the logomark, animated for loading moments (docs/DESIGN.md
 * §1.1 / §5). A ball is hit: the ember tracer flashes in and a white-hot
 * ball flies out along the arc to the head, then the whole trail fades
 * away, looping — like watching shot after shot. This is Tracr's one
 * loading treatment; it replaces generic spinners (§8).
 *
 * The trail is drawn once in Skia (shared arc geometry with TracerMark,
 * tracerArc.ts); only the ball's position and the mark's opacity animate,
 * both on the native driver — so the loop never floods the JS thread and the
 * animation stays test-safe. Reduce-motion renders the static full mark.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  vec,
} from '@shopify/react-native-skia';

import { tracer } from '../theme';
import { TracerMark } from './TracerMark';
import { useReducedMotion } from './useReducedMotion';
import {
  ARC_COLORS,
  ARC_POSITIONS,
  arcPoint,
  BULB,
  buildCrescentPath,
  HEAD,
  VIEWPORT,
} from './tracerArc';

export interface TracerLoaderProps {
  /** Rendered square size in pt. Authored in a 100×100 viewport. */
  size?: number;
  testID?: string;
}

/** One cycle: flash + fly-out, hold, fade-away, brief dark beat. */
const CYCLE_MS = 2200;
/** Fraction of the cycle spent flying out (fast off the face). */
const FLY_END = 0.6;
/** Ball-path samples along the arc. */
const BALL_SAMPLES = 24;

const CRESCENT = buildCrescentPath();
/** Decelerating flight — fast off the face, floating to apex. */
const easeOutCubic = (x: number): number => 1 - Math.pow(1 - x, 3);

export function TracerLoader({
  size = 120,
  testID,
}: TracerLoaderProps): React.JSX.Element {
  const reduced = useReducedMotion();
  const clock = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      return;
    }
    clock.setValue(0);
    const loop = Animated.loop(
      Animated.timing(clock, {
        toValue: 1,
        duration: CYCLE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, clock]);

  if (reduced) {
    // No stage light to travel — the settled mark carries the shot's voice.
    return <TracerMark size={size} testID={testID} />;
  }

  const scale = size / VIEWPORT;
  const ballR = Math.max(3, size * 0.032);
  const glowR = ballR * 2.6;

  // Ball path: fly out over [0, FLY_END] with an ease-out along the arc,
  // then hold at the head through the fade. Native-driver transform
  // interpolation follows the multi-point path with no per-frame JS. The
  // glow wrapper (2·glowR) centers on the arc point, so its top-left is the
  // point minus glowR.
  const input: number[] = [];
  const xs: number[] = [];
  const ys: number[] = [];
  const push = (t: number, param: number) => {
    const pt = arcPoint(param).p;
    input.push(t);
    xs.push(pt.x * scale - glowR);
    ys.push(pt.y * scale - glowR);
  };
  for (let i = 0; i <= BALL_SAMPLES; i++) {
    push((FLY_END * i) / BALL_SAMPLES, easeOutCubic(i / BALL_SAMPLES));
  }
  // Hold at the head for the remainder of the cycle.
  push(1, 1);

  const translateX = clock.interpolate({ inputRange: input, outputRange: xs });
  const translateY = clock.interpolate({ inputRange: input, outputRange: ys });
  // Flash in as the ball launches, hold, fade the trail away, dark beat.
  // Clamp so the tail beyond the fade holds at 0 rather than extrapolating.
  const opacity = clock.interpolate({
    inputRange: [0, 0.06, 0.8, 0.98],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View
      testID={testID}
      style={[styles.box, { width: size, height: size, opacity }]}
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Group transform={[{ scale }]}>
          {/* Glow underlay for the static ember trail. */}
          <Group>
            <BlurMask blur={9} style="normal" />
            <Path path={CRESCENT} color={tracer.glow} />
            <Circle cx={BULB.p.x} cy={BULB.p.y} r={BULB.w * 1.8} color={tracer.glow} />
          </Group>
          {/* Impact bulb glow at the strike point. */}
          <Circle cx={BULB.p.x} cy={BULB.p.y} r={BULB.w} color={tracer.tail} />
          {/* Ember trail: tail → mid → white-gold head. */}
          <Path path={CRESCENT}>
            <LinearGradient
              start={vec(BULB.p.x, BULB.p.y)}
              end={vec(HEAD.p.x, HEAD.p.y)}
              colors={[...ARC_COLORS]}
              positions={[...ARC_POSITIONS]}
            />
          </Path>
        </Group>
      </Canvas>
      {/* The ball flies along the arc — RN views so it rides the native
          driver with the fade. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ball,
          {
            width: glowR * 2,
            height: glowR * 2,
            borderRadius: glowR,
            backgroundColor: tracer.glow,
            transform: [{ translateX }, { translateY }],
          },
        ]}
      >
        <Animated.View
          style={{
            width: ballR * 2,
            height: ballR * 2,
            borderRadius: ballR,
            backgroundColor: tracer.head,
          }}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ball: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
