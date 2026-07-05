module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // Must stay last in the plugins list (react-native-reanimated requirement).
  plugins: ['react-native-reanimated/plugin'],
};
