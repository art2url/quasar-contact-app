// Simple ESLint config for Astro project
export default [
  {
    ignores: ['dist/', 'node_modules/', '.astro/'],
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

      // Style consistency
      semi: ['error', 'always'],
      quotes: ['error', 'single'],
      'comma-dangle': ['error', 'always-multiline'],

      // Best practices
      eqeqeq: 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
