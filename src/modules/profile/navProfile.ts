/**
 * navProfile — the cast point for Profile's sign-out navigation reset,
 * mirroring navOnboarding/navTabs. Signing out re-arms onboarding in the
 * store; the navigator must follow by replacing the whole stack with
 * Welcome so back can never return to a signed-out shell.
 *
 * Profile lives INSIDE the tab navigator, whose router does not know
 * 'Welcome' — the reset must land on the parent (root) stack, so this
 * walks getParent() first and only falls back to the given navigator
 * (tests mock a flat navigation object with no parent).
 */
interface ResettableNavigator {
  reset(state: { index: number; routes: { name: string }[] }): void;
  getParent?(): ResettableNavigator | undefined;
}

export function resetToOnboarding(navigation: object): void {
  const nav = navigation as ResettableNavigator;
  (nav.getParent?.() ?? nav).reset({
    index: 0,
    routes: [{ name: 'Welcome' }],
  });
}
