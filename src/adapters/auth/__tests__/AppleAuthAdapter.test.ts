import { appleAuth } from '@invertase/react-native-apple-authentication';

import {
  AuthCancelledError,
  isAppleSignInAvailable,
  signInWithApple,
} from '../AppleAuthAdapter';

const performRequestMock = appleAuth.performRequest as unknown as jest.Mock;

beforeEach(() => {
  performRequestMock.mockClear();
  appleAuth.isSupported = true;
});

describe('isAppleSignInAvailable', () => {
  it('is available on iOS when the OS supports it', () => {
    expect(isAppleSignInAvailable()).toBe(true);
  });

  it('is unavailable when AuthenticationServices is unsupported', () => {
    appleAuth.isSupported = false;
    expect(isAppleSignInAvailable()).toBe(false);
  });
});

describe('signInWithApple', () => {
  it('maps the credential to the profileStore Account shape', async () => {
    const account = await signInWithApple();
    expect(account).toEqual({
      provider: 'apple',
      userId: 'mock-apple-user',
      name: 'Mock Golfer',
      email: 'mock@privaterelay.appleid.com',
    });
    expect(performRequestMock).toHaveBeenCalledWith({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
    });
  });

  it('collapses a partial name and null email without faking data', async () => {
    performRequestMock.mockResolvedValueOnce({
      user: 'private-user',
      email: null,
      fullName: { givenName: 'Sam', familyName: null },
    });
    const account = await signInWithApple();
    expect(account.name).toBe('Sam');
    expect(account.email).toBeNull();
  });

  it('returns a null name when Apple shares no name (repeat sign-in)', async () => {
    performRequestMock.mockResolvedValueOnce({
      user: 'repeat-user',
      email: null,
      fullName: null,
    });
    const account = await signInWithApple();
    expect(account.name).toBeNull();
  });

  it('throws a typed AuthCancelledError when the user cancels', async () => {
    performRequestMock.mockRejectedValueOnce({
      code: '1001',
      message: 'The user canceled the authorization attempt',
    });
    await expect(signInWithApple()).rejects.toBeInstanceOf(AuthCancelledError);
  });

  it('rethrows non-cancellation errors untouched', async () => {
    const failure = new Error('network down');
    performRequestMock.mockRejectedValueOnce(failure);
    await expect(signInWithApple()).rejects.toBe(failure);
  });

  it('refuses to run when Apple sign-in is unavailable', async () => {
    appleAuth.isSupported = false;
    await expect(signInWithApple()).rejects.toThrow(
      'Sign in with Apple is not available',
    );
    expect(performRequestMock).not.toHaveBeenCalled();
  });
});
