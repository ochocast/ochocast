// eslint.config.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['frontend/**/*.ts', 'frontend/**/*.tsx', 'frontend/**/*.js', 'frontend/**/*.jsx'],
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      react,
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './frontend/tsconfig.json',
      },
      globals: {
        process: 'readonly',
        localStorage: 'readonly',
        window: 'readonly',
        document: 'readonly',
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      'react/react-in-jsx-scope': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'eqeqeq': 'off',
      
      
      'semi': ['error', 'always'],
      'no-undef': 'off',
    },
  },
  {
    ignores: ['backend/**/*', 'node_modules/**/*', 'dist/**/*', 'build/**/*',
      'frontend/src/utils/logger.d.ts', 'frontend/src/utils/logger.js'],
  },
];