/**
 * AppleAuthAdapter — seam over @invertase/react-native-apple-authentication.
 *
 * Maps the AuthenticationServices credential to the profileStore Account
 * shape so the onboarding SignIn screen never touches the native module
 * directly (jest maps the package to a manual mock). Cancellation is a
 * first-class, typed outcome — the UI treats it as "stay put", never as an
 * error dialog (DESIGN.md §8: no Alert.alert error surfaces).
 */
import { Platform } from 'react-native';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import type { AppleRequestResponseFullName } from '@invertase/react-native-apple-authentication';

import type { Account } from '../../state/profileStore';

/** ASAuthorizationError.canceled — the lib surfaces it as code '1001'. */
const APPLE_CANCELLED_CODE = '1001';

/** Thrown when the user dismisses the Apple sign-in sheet. Not a failure. */
export class AuthCancelledError extends Error {
  constructor() {
    super('Sign in was cancelled');
    this.name = 'AuthCancelledError';
  }
}

/**
 * Whether Sign in with Apple can be offered at all. False on Android and on
 * iOS < 13 (appleAuth.isSupported) — the UI then falls back to guest-first.
 */
export function isAppleSignInAvailable(): boolean {
  return Platform.OS === 'ios' && appleAuth.isSupported;
}

/** Apple only shares the name on FIRST sign-in — collapse it to one string. */
function displayName(
  fullName: AppleRequestResponseFullName | null,
): string | null {
  if (!fullName) {
    return null;
  }
  const joined = [fullName.givenName, fullName.familyName]
    .filter((part): part is string => Boolean(part))
    .join(' ');
  return joined.length > 0 ? joined : null;
}

function isCancellation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === APPLE_CANCELLED_CODE || code === 1001;
}

/**
 * Run the Apple sign-in sheet and map the credential to an Account.
 * Throws AuthCancelledError when the user dismisses the sheet; rethrows
 * anything else untouched.
 */
export async function signInWithApple(): Promise<Account> {
  if (!isAppleSignInAvailable()) {
    throw new Error('Sign in with Apple is not available on this device');
  }
  try {
    const credential = await appleAuth.performRequest({
      requestedOperation: appleAuth.Operation.LOGIN,
      requestedScopes: [appleAuth.Scope.FULL_NAME, appleAuth.Scope.EMAIL],
    });
    return {
      provider: 'apple',
      userId: credential.user,
      name: displayName(credential.fullName),
      email: credential.email ?? null,
    };
  } catch (error) {
    if (isCancellation(error)) {
      throw new AuthCancelledError();
    }
    throw error;
  }
}
