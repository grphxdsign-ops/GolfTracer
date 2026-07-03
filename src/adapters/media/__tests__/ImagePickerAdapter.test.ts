import type { ImagePickerResponse } from 'react-native-image-picker';

import { ImagePickerAdapter, mapPickerResponse } from '../ImagePickerAdapter';

const pickedResponse: ImagePickerResponse = {
  assets: [
    {
      uri: 'file:///videos/swing.mov',
      width: 1920,
      height: 1080,
      duration: 12.4,
      fileName: 'swing.mov',
      fileSize: 1048576,
    },
  ],
};

describe('mapPickerResponse', () => {
  it('maps a picked video (duration seconds → ms)', () => {
    expect(mapPickerResponse(pickedResponse)).toEqual({
      status: 'picked',
      video: {
        uri: 'file:///videos/swing.mov',
        width: 1920,
        height: 1080,
        durationMs: 12400,
        fileName: 'swing.mov',
        fileSizeBytes: 1048576,
      },
    });
  });

  it('maps cancellation', () => {
    expect(mapPickerResponse({ didCancel: true })).toEqual({ status: 'cancelled' });
  });

  it('maps picker errors', () => {
    expect(
      mapPickerResponse({ errorCode: 'permission', errorMessage: 'denied' }),
    ).toEqual({ status: 'error', message: 'denied' });
    expect(mapPickerResponse({ errorCode: 'others' })).toEqual({
      status: 'error',
      message: 'Picker error: others',
    });
  });

  it('treats a response without a usable asset as an error', () => {
    expect(mapPickerResponse({ assets: [] }).status).toBe('error');
    expect(mapPickerResponse({ assets: [{}] }).status).toBe('error');
  });
});

describe('ImagePickerAdapter', () => {
  it('launches the library for a single video and maps the result', async () => {
    const launch = jest.fn().mockResolvedValue(pickedResponse);
    const adapter = new ImagePickerAdapter(launch);
    const result = await adapter.pickVideo();
    expect(result.status).toBe('picked');
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: 'video', selectionLimit: 1 }),
    );
  });

  it('converts thrown errors into an error result', async () => {
    const launch = jest.fn().mockRejectedValue(new Error('native crashed'));
    const adapter = new ImagePickerAdapter(launch);
    expect(await adapter.pickVideo()).toEqual({
      status: 'error',
      message: 'native crashed',
    });
  });

  it('uses the (mocked) native module by default', async () => {
    // jest maps react-native-image-picker to a manual mock that cancels.
    const adapter = new ImagePickerAdapter();
    expect(await adapter.pickVideo()).toEqual({ status: 'cancelled' });
  });
});
