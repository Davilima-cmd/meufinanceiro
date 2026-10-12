module.exports = {
  ...require('./index.js'),
  extends: [
    ...require('./index.js').extends,
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  plugins: [...require('./index.js').plugins, 'react', 'react-hooks'],
  settings: {
    react: {
      version: 'detect',
    },
  },
  rules: {
    ...require('./index.js').rules,
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
  },
};
