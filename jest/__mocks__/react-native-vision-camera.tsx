/**
 * Manual mock for react-native-vision-camera (v4).
 * Enough surface for the capture adapter and screen smoke tests; no native
 * code is ever loaded in Jest.
 */

// Component + the static permission API the onboarding permissions screen
// calls (Camera.requestCameraPermission in vision-camera v4). Tests override
// the jest.fn to drive granted/denied paths.
export const Camera: ((props: Record<string, unknown>) => null) & {
  requestCameraPermission: jest.Mock;
} = Object.assign((_props: Record<string, unknown>): null => null, {
  requestCameraPermission: jest.fn(
    async (): Promise<'granted' | 'denied'> => 'granted',
  ),
});

export const useCameraDevice = (): undefined => undefined;

export const useCameraDevices = (): unknown[] => [];

export const useCameraFormat = (): undefined => undefined;

export const useCameraPermission = () => ({
  hasPermission: false,
  requestPermission: async () => false,
});

export const useMicrophonePermission = () => ({
  hasPermission: false,
  requestPermission: async () => false,
});
