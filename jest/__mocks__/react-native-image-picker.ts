/**
 * Manual mock for react-native-image-picker: resolves as if the user
 * cancelled, so adapters can be exercised without a device.
 */

export interface MockPickerResponse {
  didCancel?: boolean;
  errorCode?: string;
  errorMessage?: string;
  assets?: unknown[];
}

export const launchImageLibrary = async (
  _options: Record<string, unknown>,
): Promise<MockPickerResponse> => ({ didCancel: true });

export const launchCamera = async (
  _options: Record<string, unknown>,
): Promise<MockPickerResponse> => ({ didCancel: true });
