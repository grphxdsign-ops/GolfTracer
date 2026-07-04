/**
 * Sports — step 3 of onboarding (DESIGN.md §10): "What do you play?"
 * One hero selection tile per catalog entry, ~104pt tall with sm gaps so at
 * most 4 tiles sit in a viewport; vertical scroll for the rest. Available
 * sports order first; coming-soon tiles stay unselectable. Multi-select via
 * profileStore.toggleSport; at least one sport is required to continue.
 */
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ScreenHeader, SportTile } from '../../../app/components';
import { sharedStyles, spacing } from '../../../app/theme';
import { useProfileStore } from '../../../state/profileStore';
import { SPORT_CATALOG } from '../../sports/sportCatalog';
import { navigateOnboarding } from '../navOnboarding';
import { OnboardingDots } from '../components/OnboardingDots';

export function SportSelectScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const chosen = useProfileStore((s) => s.sports);
  const toggleSport = useProfileStore((s) => s.toggleSport);

  // Available-first, otherwise catalog order (sort is stable).
  const ordered = [...SPORT_CATALOG].sort(
    (a, b) => Number(b.available) - Number(a.available),
  );

  return (
    <View style={sharedStyles.screen}>
      <OnboardingDots step={3} />
      <ScreenHeader
        title="What do you play?"
        subtitle="Pick every sport you want to trace. You can change this later."
      />
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
      >
        {ordered.map((sport) => (
          <SportTile
            key={sport.id}
            sport={sport}
            selected={chosen.includes(sport.id)}
            onPress={() => toggleSport(sport.id)}
            testID={`sport-tile-${sport.id}`}
          />
        ))}
      </ScrollView>
      <Button
        label="Continue"
        disabled={chosen.length === 0}
        onPress={() => navigateOnboarding(navigation, 'OnboardingPreferences')}
        style={{
          marginTop: spacing.md,
          marginBottom: insets.bottom + spacing.md,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    // 104pt tiles + sm gaps ⇒ max 4 tiles visible per viewport (§10).
    rowGap: spacing.sm,
    paddingBottom: spacing.sm,
  },
});
