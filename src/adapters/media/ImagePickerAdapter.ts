/**
 * MediaPickerAdapter backed by react-native-image-picker. Thin mapping only;
 * the launch function is injectable so tests never touch native code.
 */
import { launchImageLibrary } from 'react-native-image-picker';
import type {
  ImageLibraryOptions,
  ImagePickerResponse,
} from 'react-native-image-picker';

import type {
  MediaPickResult,
  MediaPickerAdapter,
  PickedVideoMeta,
} from './MediaPickerAdapter';

export type LaunchLibraryFn = (
  options: ImageLibraryOptions,
) => Promise<ImagePickerResponse>;

const PICK_OPTIONS: ImageLibraryOptions = {
  mediaType: 'video',
  selectionLimit: 1,
  includeExtra: true,
  // 'current' keeps slow-motion assets in their original (high-fps) form
  // instead of a flattened compatibility transcode.
  assetRepresentationMode: 'current',
};

/** Pure mapping: image-picker response → MediaPickResult. */
export function mapPickerResponse(
  response: ImagePickerResponse,
): MediaPickResult {
  if (response.didCancel === true) {
    return { status: 'cancelled' };
  }
  if (response.errorCode !== undefined) {
    return {
      status: 'error',
      message: response.errorMessage ?? `Picker error: ${response.errorCode}`,
    };
  }
  const asset = response.assets?.[0];
  if (asset === undefined || asset.uri === undefined) {
    return { status: 'error', message: 'No video was selected' };
  }
  const video: PickedVideoMeta = {
    uri: asset.uri,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    // image-picker reports duration in seconds.
    durationMs: Math.round((asset.duration ?? 0) * 1000),
    fileName: asset.fileName,
    fileSizeBytes: asset.fileSize,
  };
  return { status: 'picked', video };
}

export class ImagePickerAdapter implements MediaPickerAdapter {
  constructor(private readonly launch: LaunchLibraryFn = launchImageLibrary) {}

  async pickVideo(): Promise<MediaPickResult> {
    try {
      const response = await this.launch(PICK_OPTIONS);
      return mapPickerResponse(response);
    } catch (error) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
