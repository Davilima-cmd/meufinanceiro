import tseslint from 'typescript-eslint';
import prettier from 'eslint-plugin-prettier';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import next from '@next/eslint-plugin-next';
import globals from 'globals';

export const baseConfig = tseslint.config(
  { ignores: ['dist/', 'build/', '.turbo/', 'node_modules/', '*.config.*', 'coverage/'] },
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node, ...globals.es2022 },
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      prettier,
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      ...tseslint.configs.recommendedTypeChecked.rules,
      ...tseslint.configs.stylisticTypeChecked.rules,
      'prettier/prettier': 'error',
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-misused-promises': 'warn',
    },
  }
);

export const reactConfig = tseslint.config(...baseConfig, {
  files: ['**/*.{tsx,jsx}'],
  plugins: {
    react,
    'react-hooks': reactHooks,
  },
  languageOptions: {
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
  settings: { react: { version: 'detect' } },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    ...reactHooks.configs.recommended.rules,
  },
});

export const nextConfig = tseslint.config(...reactConfig, {
  plugins: { '@next/next': next },
  rules: {
    ...next.configs.recommended.rules,
    ...next.configs['core-web-vitals'].rules,
  },
});

export default baseConfig;
