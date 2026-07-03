/**
 * Broadcast-style tracer overlay: a Skia canvas drawing the TracerPath as a
 * wide translucent glow stroke under a solid core stroke (round caps), with
 * an animated reveal that draws points[0..k] where k is derived from the
 * observation timestamps via `revealCount` — never from wall-clock frame
 * counts, so the head keeps pace with the real flight.
 *
 * All geometry lives in overlayMath.ts (pure, unit-tested); this component is
 * a thin Skia rendering shell.
 */
import { useMemo } from 'react';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';

import type { TracerPath } from '../../types/tracking';
import {
  computeLetterbox,
  revealCount,
  videoToView,
  type Point,
  type RotationDeg,
} from './overlayMath';

export interface TracerOverlayProps {
  tracer: TracerPath;
  /** Native video dimensions (pre-rotation, as encoded). */
  videoWidth: number;
  videoHeight: number;
  rotationDeg?: RotationDeg;
  /** Size of the view the overlay is layered over. */
  viewWidth: number;
  viewHeight: number;
  /** Reveal progress 0..1 (timestamp-anchored). Default 1 = fully drawn. */
  revealFraction?: number;
}

export function TracerOverlay({
  tracer,
  videoWidth,
  videoHeight,
  rotationDeg = 0,
  viewWidth,
  viewHeight,
  revealFraction = 1,
}: TracerOverlayProps) {
  const mapping = useMemo(
    () =>
      computeLetterbox(videoWidth, videoHeight, rotationDeg, viewWidth, viewHeight),
    [videoWidth, videoHeight, rotationDeg, viewWidth, viewHeight],
  );

  const mapped: Point[] = useMemo(
    () => tracer.points.map((p) => videoToView(p, mapping)),
    [tracer.points, mapping],
  );

  const k = revealCount(tracer.points, revealFraction);

  const path = useMemo(() => {
    const skPath = Skia.Path.Make();
    if (k >= 2) {
      skPath.moveTo(mapped[0]!.x, mapped[0]!.y);
      for (let i = 1; i < k; i++) {
        skPath.lineTo(mapped[i]!.x, mapped[i]!.y);
      }
    }
    return skPath;
  }, [mapped, k]);

  if (viewWidth <= 0 || viewHeight <= 0 || k < 2) {
    return null;
  }

  const { style } = tracer;
  const head = mapped[k - 1]!;

  return (
    <Canvas
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: viewWidth,
        height: viewHeight,
      }}
    >
      {style.glowWidth > 0 ? (
        <Path
          path={path}
          color={style.glowColor}
          style="stroke"
          strokeWidth={style.glowWidth}
          strokeCap="round"
          strokeJoin="round"
        />
      ) : null}
      <Path
        path={path}
        color={style.color}
        style="stroke"
        strokeWidth={style.strokeWidth}
        strokeCap="round"
        strokeJoin="round"
      />
      <Circle
        cx={head.x}
        cy={head.y}
        r={Math.max(2, style.strokeWidth * 1.1)}
        color={style.color}
      />
    </Canvas>
  );
}
