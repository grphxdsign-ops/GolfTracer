module.exports = {
  preset: 'react-native',
  setupFiles: ['./jest/setup.ts'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/.claude/',
    '<rootDir>/ios/',
    '<rootDir>/android/',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/.claude/',
    '<rootDir>/ios/',
    '<rootDir>/android/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-screens|react-native-safe-area-context|@shopify/react-native-skia|react-native-vision-camera|react-native-worklets-core|react-native-image-picker)/)',
  ],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '@react-native-async-storage/async-storage/jest/async-storage-mock',
    '^@invertase/react-native-apple-authentication$':
      '<rootDir>/jest/__mocks__/react-native-apple-authentication.ts',
    '^react-native-vision-camera$':
      '<rootDir>/jest/__mocks__/react-native-vision-camera.tsx',
    '^react-native-worklets-core$':
      '<rootDir>/jest/__mocks__/react-native-worklets-core.ts',
    '^@shopify/react-native-skia$':
      '<rootDir>/jest/__mocks__/shopify-react-native-skia.tsx',
    '^react-native-image-picker$':
      '<rootDir>/jest/__mocks__/react-native-image-picker.ts',
  },
};
