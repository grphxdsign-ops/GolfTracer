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

import type {
  CameraAngle,
  ClubType,
  RootStackParamList,
} from '../../../types';
import { useSessionStore } from '../../../state/sessionStore';
import { colors, radii, sharedStyles, spacing, typography } from '../../../app/theme';
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

function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={[typography.subtitle, { marginBottom: spacing.sm }]}>
      {children}
    </Text>
  );
}

export function CalibrationScreen() {
  const navigation = useNavigation<CalibrationNavigation>();
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
      contentContainerStyle={{ paddingBottom: spacing.xl }}
    >
      <View style={sharedStyles.card}>
        <SectionTitle>Club</SectionTitle>
        <View style={styles.chipGrid}>
          {CLUBS.map((c) => {
            const selected = c.value === club;
            return (
              <Pressable
                key={c.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setClub(c.value)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text
                  style={[
                    styles.chipText,
                    selected && styles.chipTextSelected,
                  ]}
                >
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={sharedStyles.card}>
        <SectionTitle>Camera angle</SectionTitle>
        <View style={styles.segmentRow}>
          {CAMERA_ANGLES.map((a) => {
            const selected = a.value === cameraAngle;
            return (
              <Pressable
                key={a.value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setCameraAngle(a.value)}
                style={[styles.segment, selected && styles.segmentSelected]}
              >
                <Text
                  style={[
                    styles.chipText,
                    selected && styles.chipTextSelected,
                  ]}
                >
                  {a.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[typography.label, { marginTop: spacing.sm }]}>
          Down-the-line or behind gives the cleanest downrange view for the
          flight fit. Face-on works best for launch angle.
        </Text>
      </View>

      <View style={sharedStyles.card}>
        <SectionTitle>Camera field of view (optional)</SectionTitle>
        <TextInput
          accessibilityLabel="Horizontal field of view in degrees"
          value={fovText}
          onChangeText={setFovText}
          placeholder="e.g. 66 (degrees). Leave blank if unknown."
          placeholderTextColor={colors.textDisabled}
          keyboardType="numeric"
          style={styles.input}
        />
      </View>

      <View style={sharedStyles.card}>
        <SectionTitle>Reference points (optional)</SectionTitle>
        <Text style={[typography.label, { marginBottom: spacing.sm }]}>
          Tap where known ground markers (tee markers, yardage flags) appear
          in the frame, then enter their real distances. 4+ points unlock
          measured landing distance.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tap to add a reference point"
          onPress={handleTapArea}
          style={[
            styles.tapArea,
            { width: TAP_AREA_HEIGHT * (frameWidth / frameHeight) },
          ]}
        >
          <Text style={typography.label}>
            Video frame placeholder — tap to add a point
          </Text>
          {referencePoints.map((p, i) => (
            <View
              key={`marker-${i}`}
              pointerEvents="none"
              style={[
                styles.marker,
                {
                  left:
                    (p.imageX / frameWidth) *
                      TAP_AREA_HEIGHT *
                      (frameWidth / frameHeight) -
                    5,
                  top: (p.imageY / frameHeight) * TAP_AREA_HEIGHT - 5,
                },
              ]}
            />
          ))}
        </Pressable>

        {referencePoints.map((p, i) => (
          <View key={`ref-${i}`} style={styles.refRow}>
            <Text style={[typography.body, styles.refLabel]}>
              {p.label} ({p.imageX}, {p.imageY})
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
              style={[styles.input, styles.refInput]}
            />
            <TextInput
              accessibilityLabel={`${p.label} lateral yards`}
              value={String(p.worldZYards)}
              onChangeText={(t) =>
                updateReferencePoint(i, {
                  worldZYards: Number.parseFloat(t) || 0,
                })
              }
              keyboardType="numeric"
              style={[styles.input, styles.refInput]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${p.label}`}
              onPress={() => removeReferencePoint(i)}
              style={styles.removeButton}
            >
              <Text style={styles.removeButtonText}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={handleContinue}
        style={sharedStyles.button}
      >
        <Text style={sharedStyles.buttonText}>Estimate distance</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextSelected: {
    color: colors.text,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  segmentSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.accent,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    color: colors.text,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceRaised,
  },
  tapArea: {
    height: TAP_AREA_HEIGHT,
    maxWidth: '100%',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.background,
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
    backgroundColor: colors.accent,
  },
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  refLabel: {
    flex: 1.4,
    fontSize: 13,
  },
  refInput: {
    flex: 1,
    paddingVertical: spacing.xs,
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  removeButtonText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
});
