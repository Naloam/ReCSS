import tseslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'

const typescriptFiles = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts']

export default [
  {
    ignores: ['**/coverage/**', '**/dist/**', '**/node_modules/**'],
  },
  {
    files: typescriptFiles,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
]
