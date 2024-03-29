module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  extends: ['plugin:node/recommended'/*, 'plugin:prettier/recommended'*/],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  settings: {
    node: {
      tryExtensions: ['.js', '.json', '.ts', '.d.ts'],
    },
  },
  rules: {
    // 'no-process-exit': 'off', // to investigate if we should throw an error instead of process.exit()
    // 'node/no-unsupported-features/es-builtins': 'off',
  },
  overrides: [
    {
      files: ['*.ts'],
      extends: [
        'plugin:@typescript-eslint/recommended', // Uses the recommended rules from the @typescript-eslint/eslint-plugin
        'prettier', // Uses eslint-config-prettier to disable ESLint rules from @typescript-eslint/eslint-plugin that would conflict with prettier
      ],
      rules: {
        'node/no-unsupported-features/es-syntax': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        // '@typescript-eslint/explicit-function-return-type': 'off',
        // '@typescript-eslint/no-namespace': 'off' // maybe we should consider enabling it in the future
        '@typescript-eslint/consistent-type-imports': 'error', // the replacement of "importsNotUsedAsValues": "error"
      },
    },
  ],
};
