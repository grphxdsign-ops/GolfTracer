/**
 * ProgressSteps — docs/DESIGN.md §7 (kit inventory).
 *
 * Vertical pipeline steps with done / active / todo nodes, hairline
 * connectors, and per-step detail text. Detail strings render verbatim as
 * their own Text node (HomeScreen tests pin 'No video' / 'Not started' /
 * 'Not estimated').
 */
import { StyleSheet, Text, View } from 'react-native';

import { alpha, colors, spacing, typography } from '../theme';

export type ProgressStepState = 'done' | 'active' | 'todo';

export interface ProgressStep {
  key: string;
  label: string;
  detail?: string;
  state: ProgressStepState;
}

export interface ProgressStepsProps {
  steps: ReadonlyArray<ProgressStep>;
  testID?: string;
}

function StepNode({ state }: { state: ProgressStepState }): React.JSX.Element {
  if (state === 'done') {
    return (
      <View style={[styles.ring, styles.ringDone]}>
        <View style={styles.doneDot} />
      </View>
    );
  }
  if (state === 'active') {
    return (
      <View style={[styles.ring, styles.ringActive]}>
        <View style={styles.activeDot} />
      </View>
    );
  }
  return <View style={[styles.ring, styles.ringTodo]} />;
}

export function ProgressSteps({
  steps,
  testID,
}: ProgressStepsProps): React.JSX.Element {
  return (
    <View testID={testID}>
      {steps.map((step, index) => (
        <View
          key={step.key}
          accessible
          accessibilityLabel={`${step.label}: ${step.detail ?? step.state}`}
          style={styles.row}
        >
          <View style={styles.nodeColumn}>
            <StepNode state={step.state} />
            {index < steps.length - 1 ? (
              <View style={styles.connector} />
            ) : null}
          </View>
          <View style={styles.textColumn}>
            <Text
              style={[
                typography.body,
                step.state === 'todo' && styles.labelTodo,
              ]}
            >
              {step.label}
            </Text>
            {step.detail ? (
              <Text style={styles.detail}>{step.detail}</Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
  },
  nodeColumn: {
    width: 20,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  ring: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  ringDone: {
    backgroundColor: alpha(colors.primary, 0.25),
  },
  doneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  ringActive: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  ringTodo: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  connector: {
    flex: 1,
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginTop: 2,
  },
  textColumn: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  labelTodo: {
    color: colors.textMuted,
  },
  detail: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: colors.textMuted,
    marginTop: 2,
  },
});
