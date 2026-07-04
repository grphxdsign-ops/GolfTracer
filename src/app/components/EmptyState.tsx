/**
 * EmptyState — docs/DESIGN.md §7 (kit inventory) and §1 (confident, plain
 * copy; every empty/failure state gets a specific next step).
 *
 * Centered title + optional one-line explanation + optional single primary
 * action. No illustrations, no icons.
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

export function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps): React.JSX.Element {
  return (
    <View testID={testID} style={styles.container}>
      <Text style={[typography.heading, styles.centerText]}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          onPress={onAction}
          variant="primary"
          size="md"
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: spacing.lg,
  },
  centerText: {
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 300,
  },
  action: {
    marginTop: spacing.lg,
  },
});
