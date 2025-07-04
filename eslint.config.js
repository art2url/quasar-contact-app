// Simple root ESLint configuration for basic files only
// Each project has its own specific ESLint configuration

module.exports = [
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      '*.min.js',
      'coverage/',
      '.angular/',
      'frontend/',
      'backend/',
      'landing/',
    ],
  },
  {
    files: ['*.js', '*.mjs', '*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      'no-console': 'warn',
      'no-debugger': 'error',
      'no-unused-vars': 'error',
      semi: ['error', 'always'],
      quotes: ['error', 'single'],
      'comma-dangle': ['error', 'always-multiline'],
      eqeqeq: 'error',
      'no-eval': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
