/**
 * Manual mock for react-native-worklets-core: run "worklets" inline on the
 * JS thread in tests.
 */

export const Worklets = {
  createRunOnJS: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
  createSharedValue: <T>(value: T) => ({ value }),
};

export const useSharedValue = <T>(value: T) => ({ value });

export const useRunOnJS = <T extends (...args: never[]) => unknown>(
  fn: T,
): T => fn;

export const useWorklet = <T extends (...args: never[]) => unknown>(
  _context: unknown,
  fn: T,
): T => fn;
