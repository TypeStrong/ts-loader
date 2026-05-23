const tsEslintPlugin = require('@typescript-eslint/eslint-plugin');
const tsEslintParser = require('@typescript-eslint/parser');
const nPlugin = require('eslint-plugin-n');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
  {
    ignores: ['.test/**', 'dist/**', 'test/**'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsEslintParser,
      ecmaVersion: 2018,
      sourceType: 'module',
    },
    plugins: {
      '@typescript-eslint': tsEslintPlugin,
      n: nPlugin,
    },
    settings: {
      node: {
        tryExtensions: ['.js', '.json', '.ts', '.d.ts'],
      },
    },
    rules: {
      ...nPlugin.configs['flat/recommended-module'].rules,
      ...tsEslintPlugin.configs.recommended.rules,
      ...prettierConfig.rules,
      'n/no-unsupported-features/es-syntax': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "args": "all",
          "argsIgnorePattern": "^_",
          "caughtErrors": "all",
          "caughtErrorsIgnorePattern": "^_",
          "destructuredArrayIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "ignoreRestSiblings": true
        }
      ]
    },
  },
];
