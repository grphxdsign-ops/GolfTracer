/**
 * Manual mock for react-native-vision-camera (v4).
 * Enough surface for the capture adapter and screen smoke tests; no native
 * code is ever loaded in Jest.
 */

export const Camera: (props: Record<string, unknown>) => null = () => null;

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
