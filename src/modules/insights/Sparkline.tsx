/**
 * Sparkline — small Skia trend line for the Insights hero cards. Pairs the
 * series with an optional baseline hairline (previous-window average) so
 * the line always reads against a reference, never as floating decoration
 * (docs/RESEARCH-APPS.md: sparkline + baseline-relative framing). Static —
 * data only changes between sessions, so nothing animates (DESIGN.md §5).
 */
import { useState } from 'react';
import { View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';

import { colors, spacing } from '../../app/theme';

export interface SparklineProps {
  /** Oldest→newest values. Needs ≥2 points to draw. */
  series: readonly number[];
  /** Optional reference value drawn as a muted hairline. */
  baseline?: number;
  height?: number;
  testID?: string;
}

const STROKE = 1.8;
const END_DOT_R = 2.6;

export function Sparkline({
  series,
  baseline,
  height = 36,
  testID,
}: SparklineProps): React.JSX.Element | null {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) =>
    setWidth(e.nativeEvent.layout.width);

  if (series.length < 2) {
    return null;
  }

  let path = null;
  let baselineY: number | null = null;
  let endX = 0;
  let endY = 0;
  if (width > 0) {
    const values =
      baseline !== undefined ? [...series, baseline] : [...series];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const padY = END_DOT_R + STROKE;
    const usable = height - padY * 2;
    const xAt = (i: number) =>
      END_DOT_R + (i / (series.length - 1)) * (width - END_DOT_R * 2);
    const yAt = (v: number) => padY + (1 - (v - min) / span) * usable;

    const p = Skia.Path.Make();
    series.forEach((v, i) => {
      if (i === 0) {
        p.moveTo(xAt(0), yAt(v));
      } else {
        p.lineTo(xAt(i), yAt(v));
      }
    });
    path = p;
    endX = xAt(series.length - 1);
    endY = yAt(series[series.length - 1]!);
    baselineY = baseline !== undefined ? yAt(baseline) : null;
  }

  return (
    <View
      testID={testID}
      onLayout={onLayout}
      style={{ height, marginTop: spacing.sm }}
    >
      {width > 0 && path ? (
        <Canvas style={{ width, height }}>
          {baselineY !== null ? (
            <Path
              path={`M 0 ${baselineY} L ${width} ${baselineY}`}
              color="rgba(255,248,235,0.16)"
              style="stroke"
              strokeWidth={1}
            />
          ) : null}
          <Path
            path={path}
            color={colors.primary}
            style="stroke"
            strokeWidth={STROKE}
            strokeCap="round"
            strokeJoin="round"
          />
          <Circle cx={endX} cy={endY} r={END_DOT_R} color={colors.accent} />
        </Canvas>
      ) : null}
    </View>
  );
}
