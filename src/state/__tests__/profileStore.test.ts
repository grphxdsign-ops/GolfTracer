/**
 * Contract tests for the profile store — onboarding is the only writer,
 * everything reads. Persistence is exercised through the AsyncStorage jest
 * mock automatically (zustand persist hydrates asynchronously; these tests
 * pin the synchronous API surface).
 */
import { useProfileStore } from '../profileStore';

const reset = () => useProfileStore.getState().reset();

describe('profileStore', () => {
  beforeEach(reset);

  it('starts un-onboarded with no account and defaults', () => {
    const s = useProfileStore.getState();
    expect(s.onboardingComplete).toBe(false);
    expect(s.account).toBeNull();
    expect(s.sports).toEqual([]);
    expect(s.preferences).toEqual({
      units: 'yards',
      handedness: 'right',
      shareAnalytics: true,
    });
  });

  it('stores the Apple account and completes onboarding', () => {
    useProfileStore.getState().setAccount({
      provider: 'apple',
      userId: 'u1',
      name: 'Sam',
      email: null,
    });
    useProfileStore.getState().completeOnboarding();
    const s = useProfileStore.getState();
    expect(s.account?.provider).toBe('apple');
    expect(s.onboardingComplete).toBe(true);
  });

  it('toggles sports on and off preserving selection order', () => {
    const { toggleSport } = useProfileStore.getState();
    toggleSport('golf');
    toggleSport('soccer');
    expect(useProfileStore.getState().sports).toEqual(['golf', 'soccer']);
    toggleSport('golf');
    expect(useProfileStore.getState().sports).toEqual(['soccer']);
  });

  it('patches preferences partially', () => {
    useProfileStore.getState().setPreferences({ units: 'meters' });
    const s = useProfileStore.getState();
    expect(s.preferences.units).toBe('meters');
    expect(s.preferences.handedness).toBe('right');
  });

  it('reset clears the account and re-arms onboarding', () => {
    useProfileStore.getState().setAccount({
      provider: 'guest',
      userId: 'guest',
      name: null,
      email: null,
    });
    useProfileStore.getState().completeOnboarding();
    reset();
    const s = useProfileStore.getState();
    expect(s.account).toBeNull();
    expect(s.onboardingComplete).toBe(false);
  });
});
