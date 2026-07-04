/**
 * Calibration screen: pick the club, describe the camera setup, and
 * optionally tap ground reference points (tee markers, yardage flags) to
 * unlock homography-grade distance measurement.
 */
import { useCallback } from 'react';
import {
  GestureResponderEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  CameraAngle,
  ClubType,
  RootStackParamList,
} from '../../../types';
import { useSessionStore } from '../../../state/sessionStore';
import {
  colors,
  radii,
  sharedStyles,
  spacing,
  typography,
} from '../../../app/theme';
import {
  Button,
  Card,
  Chip,
  ScreenHeader,
  SectionLabel,
  SegmentedControl,
} from '../../../app/components';
import { draftToCalibrationInput, useDistanceStore } from '../distanceStore';

type CalibrationNavigation = NativeStackNavigationProp<
  RootStackParamList,
  'Calibration'
>;

const CLUBS: { value: ClubType; label: string }[] = [
  { value: 'driver', label: 'Driver' },
  { value: '3-wood', label: '3W' },
  { value: '5-wood', label: '5W' },
  { value: '3-iron', label: '3i' },
  { value: '5-iron', label: '5i' },
  { value: '7-iron', label: '7i' },
  { value: '9-iron', label: '9i' },
  { value: 'pitching-wedge', label: 'PW' },
  { value: 'sand-wedge', label: 'SW' },
  { value: 'lob-wedge', label: 'LW' },
];

const CAMERA_ANGLES: { value: CameraAngle; label: string }[] = [
  { value: 'down-the-line', label: 'Down the line' },
  { value: 'face-on', label: 'Face on' },
  { value: 'behind', label: 'Behind' },
];

/** Aspect-ratio box the user taps to place reference points. */
const TAP_AREA_HEIGHT = 180;

export function CalibrationScreen() {
  const navigation = useNavigation<CalibrationNavigation>();
  const insets = useSafeAreaInsets();
  const video = useSessionStore((s) => s.video);
  const setCalibration = useSessionStore((s) => s.setCalibration);

  const club = useDistanceStore((s) => s.club);
  const cameraAngle = useDistanceStore((s) => s.cameraAngle);
  const fovText = useDistanceStore((s) => s.fovText);
  const referencePoints = useDistanceStore((s) => s.referencePoints);
  const setClub = useDistanceStore((s) => s.setClub);
  const setCameraAngle = useDistanceStore((s) => s.setCameraAngle);
  const setFovText = useDistanceStore((s) => s.setFovText);
  const addReferencePoint = useDistanceStore((s) => s.addReferencePoint);
  const updateReferencePoint = useDistanceStore((s) => s.updateReferencePoint);
  const removeReferencePoint = useDistanceStore((s) => s.removeReferencePoint);

  const frameWidth = video?.width ?? 1920;
  const frameHeight = video?.height ?? 1080;
  const tapAreaWidth = TAP_AREA_HEIGHT * (frameWidth / frameHeight);

  const handleTapArea = useCallback(
    (event: GestureResponderEvent) => {
      const { locationX, locationY } = event.nativeEvent;
      // The placeholder tap area stands in for the video frame; scale taps
      // to frame pixel coordinates.
      const areaWidth = TAP_AREA_HEIGHT * (frameWidth / frameHeight);
      addReferencePoint({
        imageX: Math.round((locationX / areaWidth) * frameWidth),
        imageY: Math.round((locationY / TAP_AREA_HEIGHT) * frameHeight),
        worldXYards: 0,
        worldZYards: 0,
        label: `Point ${referencePoints.length + 1}`,
      });
    },
    [addReferencePoint, frameWidth, frameHeight, referencePoints.length],
  );

  const handleContinue = useCallback(() => {
    setCalibration(
      draftToCalibrationInput({ club, cameraAngle, fovText, referencePoints }),
    );
    navigation.navigate('Results');
  }, [
    setCalibration,
    club,
    cameraAngle,
    fovText,
    referencePoints,
    navigation,
  ]);

  return (
    <ScrollView
      style={sharedStyles.screen}
      contentContainerStyle={{
        paddingBottom: spacing.md + insets.bottom,
      }}
    >
      <ScreenHeader
        title="Calibration"
        subtitle="Tell the estimator how this shot was filmed."
      />

      <SectionLabel style={styles.firstSection}>Club</SectionLabel>
      <View style={styles.chipGrid}>
        {CLUBS.map((c) => (
          <Chip
            key={c.value}
            label={c.label}
            selected={c.value === club}
            onPress={() => setClub(c.value)}
          />
        ))}
      </View>

      <SectionLabel>Camera angle</SectionLabel>
      <SegmentedControl
        options={CAMERA_ANGLES.map((a) => ({ label: a.label, value: a.value }))}
        value={cameraAngle}
        onChange={(value) => setCameraAngle(value as CameraAngle)}
      />
      <Text style={[typography.caption, styles.hint]}>
        Down-the-line or behind gives the cleanest downrange view for the
        flight fit. Face-on works best for launch angle.
      </Text>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Camera field of view (optional)</Text>
        <TextInput
          accessibilityLabel="Horizontal field of view in degrees"
          value={fovText}
          onChangeText={setFovText}
          placeholder="e.g. 66 (degrees). Leave blank if unknown."
          placeholderTextColor={colors.textDisabled}
          keyboardType="numeric"
          style={styles.input}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Reference points (optional)</Text>
        <Text style={[typography.label, { marginBottom: spacing.sm }]}>
          Tap where known ground markers (tee markers, yardage flags) appear
          in the frame, then enter their real distances. 4+ points unlock
          measured landing distance.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tap to add a reference point"
          onPress={handleTapArea}
          style={[styles.tapArea, { width: tapAreaWidth }]}
        >
          <Text style={typography.caption}>
            Video frame placeholder — tap to add a point
          </Text>
          {referencePoints.map((p, i) => (
            <View
              key={`marker-${i}`}
              pointerEvents="none"
              style={[
                styles.marker,
                {
                  left: (p.imageX / frameWidth) * tapAreaWidth - 5,
                  top: (p.imageY / frameHeight) * TAP_AREA_HEIGHT - 5,
                },
              ]}
            />
          ))}
        </Pressable>

        {referencePoints.map((p, i) => (
          <View key={`ref-${i}`} style={styles.refCard}>
            <View style={styles.refTitleRow}>
              <Text style={typography.label} numberOfLines={1}>
                {p.label} ({p.imageX}, {p.imageY})
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${p.label}`}
                onPress={() => removeReferencePoint(i)}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.refRemove,
                  pressed && styles.refRemovePressed,
                ]}
              >
                <Text style={styles.refRemoveGlyph}>✕</Text>
              </Pressable>
            </View>
            <View style={styles.refInputRow}>
              <View style={styles.refInputGroup}>
                <Text style={[typography.caption, styles.refInputCaption]}>
                  Downrange (yd)
                </Text>
                <TextInput
                  accessibilityLabel={`${p.label} downrange yards`}
                  value={String(p.worldXYards)}
                  onChangeText={(t) =>
                    updateReferencePoint(i, {
                      worldXYards: Number.parseFloat(t) || 0,
                    })
                  }
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>
              <View style={styles.refInputGroup}>
                <Text style={[typography.caption, styles.refInputCaption]}>
                  Lateral (yd)
                </Text>
                <TextInput
                  accessibilityLabel={`${p.label} lateral yards`}
                  value={String(p.worldZYards)}
                  onChangeText={(t) =>
                    updateReferencePoint(i, {
                      worldZYards: Number.parseFloat(t) || 0,
                    })
                  }
                  keyboardType="numeric"
                  style={styles.input}
                />
              </View>
            </View>
          </View>
        ))}
      </Card>

      <Button
        label="Estimate distance"
        variant="primary"
        onPress={handleContinue}
        style={styles.cta}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  firstSection: {
    marginTop: 0,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  hint: {
    marginTop: spacing.sm,
  },
  card: {
    marginTop: spacing.lg,
  },
  cardTitle: {
    ...typography.subtitle,
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radii.sm,
    color: colors.text,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.stage,
  },
  tapArea: {
    height: TAP_AREA_HEIGHT,
    maxWidth: '100%',
    borderRadius: radii.lg,
    backgroundColor: colors.stage,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  marker: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  refCard: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  refTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  refInputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  refInputGroup: {
    flex: 1,
  },
  refInputCaption: {
    marginBottom: 2,
  },
  refRemove: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refRemovePressed: {
    backgroundColor: colors.surface,
  },
  refRemoveGlyph: {
    color: colors.textMuted,
    fontSize: 15,
  },
  cta: {
    marginTop: spacing.xl,
  },
});
