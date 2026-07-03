/**
 * Global Jest setup.
 *
 * Native modules that ship real native code are mapped to manual mocks via
 * `moduleNameMapper` in jest.config.js (vision-camera, worklets-core, Skia,
 * image-picker), so no native binding is ever touched in CI.
 */

// react-native-screens: use no-op JS behaviour in tests.
jest.mock('react-native-screens', () => {
  const actual = jest.requireActual<
    typeof import('react-native-screens')
  >('react-native-screens');
  return {
    ...actual,
    enableScreens: jest.fn(),
  };
});
