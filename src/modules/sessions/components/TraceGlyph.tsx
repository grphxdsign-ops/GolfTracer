/**
 * TraceGlyph — redraws a shot's persisted trace (ShotRecord.tracePoints).
 * Two voices, per the ember-quota rules (DESIGN.md §1.1/§2):
 *
 * - `mono`: warm-cream monochrome — session-list glyphs, where a repeated
 *   ember would be chrome ornament. Monochrome contexts use colors.text.
 * - `ember`: the full tracer gradient + glow — ShotDetail's hero redraw,
 *   the screen's ONE hot element. Tail→mid→head along the flight, same
 *   tokens as the live TracerOverlay.
 *
 * Static Skia drawing — history is settled; nothing animates here.
 */
import { useMemo } from 'react';
import { View } from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  Group,
  LinearGradient,
  Path,
  Skia,
  vec,
} from '@shopify/react-native-skia';

import { tracer } from '../../../app/theme';
import type { TracePoint } from '../../../state/historyStore';
import { traceToBox } from '../tracePreview';

export interface TraceGlyphProps {
  points: readonly TracePoint[];
  width: number;
  height: number;
  variant?: 'mono' | 'ember';
  testID?: string;
}

const MONO_COLOR = 'rgba(255,251,242,0.92)';

export function TraceGlyph({
  points,
  width,
  height,
  variant = 'mono',
  testID,
}: TraceGlyphProps): React.JSX.Element | null {
  const ember = variant === 'ember';
  const pad = ember ? 18 : 7;
  const strokeWidth = ember ? 3.4 : 2;

  const geometry = useMemo(() => {
    if (points.length < 2) {
      return null;
    }
    const scaled = traceToBox(points, width, height, pad);
    const path = Skia.Path.Make();
    scaled.forEach((p, i) => {
      if (i === 0) {
        path.moveTo(p.x, p.y);
      } else {
        // Midpoint quad smoothing: keeps 24 stored points reading as one
        // continuous flight instead of a segmented polyline.
        const prev = scaled[i - 1]!;
        path.quadTo(prev.x, prev.y, (prev.x + p.x) / 2, (prev.y + p.y) / 2);
      }
    });
    const last = scaled[scaled.length - 1]!;
    path.lineTo(last.x, last.y);
    return { path, head: last, tail: scaled[0]! };
  }, [points, width, height, pad]);

  if (!geometry) {
    return null;
  }

  return (
    // testID rides the wrapper View — the Skia jest mock nulls Canvas out.
    <View testID={testID} style={{ width, height }}>
      <Canvas style={{ width, height }}>
      {ember ? (
        <>
          <Group>
            <BlurMask blur={7} style="normal" />
            <Path
              path={geometry.path}
              color={tracer.glow}
              style="stroke"
              strokeWidth={strokeWidth * 2.4}
              strokeCap="round"
              strokeJoin="round"
            />
          </Group>
          <Path
            path={geometry.path}
            style="stroke"
            strokeWidth={strokeWidth}
            strokeCap="round"
            strokeJoin="round"
          >
            <LinearGradient
              start={vec(geometry.tail.x, geometry.tail.y)}
              end={vec(geometry.head.x, geometry.head.y)}
              colors={[tracer.tail, tracer.mid, tracer.head]}
              positions={[0, 0.55, 1]}
            />
          </Path>
          <Circle
            cx={geometry.head.x}
            cy={geometry.head.y}
            r={4}
            color={tracer.head}
          />
        </>
      ) : (
        <>
          <Path
            path={geometry.path}
            color={MONO_COLOR}
            style="stroke"
            strokeWidth={strokeWidth}
            strokeCap="round"
            strokeJoin="round"
          />
          <Circle
            cx={geometry.head.x}
            cy={geometry.head.y}
            r={3.4}
            color="rgba(255,251,242,0.18)"
          />
          <Circle
            cx={geometry.head.x}
            cy={geometry.head.y}
            r={2.1}
            color={MONO_COLOR}
          />
        </>
      )}
      </Canvas>
    </View>
  );
}
