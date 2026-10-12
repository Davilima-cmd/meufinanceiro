module.exports = {
  ...require('./react.js'),
  extends: [...require('./react.js').extends, 'plugin:@next/next/recommended'],
  plugins: [...require('./react.js').plugins, '@next/next'],
};
