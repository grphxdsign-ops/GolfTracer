/**
 * Manual mock for @invertase/react-native-apple-authentication — the real
 * module binds to AuthenticationServices and only exists on iOS. Tests drive
 * sign-in through this mock's performRequest.
 */
export const appleAuth = {
  isSupported: true,
  Operation: { LOGIN: 1, REFRESH: 2, LOGOUT: 3, IMPLICIT: 0 },
  Scope: { EMAIL: 0, FULL_NAME: 1 },
  State: { REVOKED: 0, AUTHORIZED: 1, NOT_FOUND: 2, TRANSFERRED: 3 },
  performRequest: jest.fn(async () => ({
    user: 'mock-apple-user',
    email: 'mock@privaterelay.appleid.com',
    fullName: { givenName: 'Mock', familyName: 'Golfer' },
    identityToken: 'mock-identity-token',
    authorizationCode: 'mock-auth-code',
  })),
  getCredentialStateForUser: jest.fn(async () => 1),
  onCredentialRevoked: jest.fn(() => () => undefined),
};

export default appleAuth;
