// Simple ESLint config for Astro project
import eslintPluginAstro from 'eslint-plugin-astro';

export default [
  {
    ignores: ['dist/', 'node_modules/', '.astro/', 'src/env.d.ts'],
  },
  {
    files: ['src/**/*.{js,ts,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        document: 'readonly',
        window: 'readonly',
      },
    },
    rules: {
      // Basic code quality
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-unused-vars': 'error',

      // Style consistency - FORCE SINGLE QUOTES
      semi: ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }],
      'comma-dangle': ['error', 'always-multiline'],

      // Best practices
      eqeqeq: 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  // Astro-specific configuration
  ...eslintPluginAstro.configs.recommended,
  {
    files: ['src/**/*.astro'],
    rules: {
      // Force consistent quotes in Astro files
      'astro/prefer-class-list-directive': 'error',
      'astro/prefer-object-class-list': 'error',
      'astro/no-unused-define-vars-in-style': 'error',
    },
  },
];
