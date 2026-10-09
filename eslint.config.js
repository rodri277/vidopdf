import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'tools/fixtures/**',
      'tests/fixtures/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'eslint.config.js',
            'commitlint.config.js',
            '.dependency-cruiser.cjs',
            'tools/*.mjs',
            'packages/pdf-adapters/scripts/*.mjs',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-nocheck': true, 'ts-expect-error': 'allow-with-description' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-exports': ['error', { restrictDefaultExports: { direct: true } }],
      // SPEC "Calidad": cyclomatic complexity at most 10 per function.
      complexity: ['error', 10],
    },
  },
  {
    files: ['packages/core/**/*.ts'],
    languageOptions: { globals: {} },
  },
  {
    ...jsxA11y.flatConfigs.strict,
    files: ['apps/web/**/*.{ts,tsx}'],
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Playwright loads global setup and teardown through their default export.
    files: [
      '**/*.config.{js,ts}',
      'eslint.config.js',
      'benchmarks/src/setup.ts',
      'benchmarks/src/teardown.ts',
    ],
    rules: { 'no-restricted-exports': 'off' },
  },
  {
    ...tseslint.configs.disableTypeChecked,
    files: [
      'tools/**/*.mjs',
      'packages/pdf-adapters/scripts/*.mjs',
      'eslint.config.js',
      'commitlint.config.js',
      '.dependency-cruiser.cjs',
    ],
  },
  {
    files: [
      'tools/**/*.mjs',
      'packages/pdf-adapters/scripts/*.mjs',
      'eslint.config.js',
      'commitlint.config.js',
      '.dependency-cruiser.cjs',
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['.dependency-cruiser.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
