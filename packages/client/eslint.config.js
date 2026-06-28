import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // Generated Chakra UI snippets (not hand-written app code). The
    // react-refresh rule only guards HMR; it doesn't apply to generated files.
    files: ['src/components/ui/**'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // E2E specs are Playwright (Node), not React. The react-hooks rule
    // mis-reads Playwright's fixture `use` callback as the React `use` hook,
    // and react-refresh/HMR is irrelevant here. Node globals merge on top of
    // the browser globals from the base block (e2e uses both: process, and
    // localStorage inside injected page scripts).
    files: ['e2e/**'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Tooling config files run in Node (e.g. process.env), not the browser.
    files: ['*.config.{js,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
