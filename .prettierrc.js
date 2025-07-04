module.exports = {
  // Basic formatting
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  useTabs: false,

  // Line formatting
  printWidth: 80,
  endOfLine: 'lf',

  // Object/Array formatting
  trailingComma: 'es5',
  bracketSpacing: true,
  bracketSameLine: false,

  // Arrow function parentheses
  arrowParens: 'avoid',

  // Plugins
  plugins: ['prettier-plugin-astro'],

  // Overrides for different file types
  overrides: [
    {
      files: '*.json',
      options: {
        printWidth: 120,
        singleQuote: false,
      },
    },
    {
      files: '*.md',
      options: {
        printWidth: 100,
        proseWrap: 'always',
      },
    },
    {
      files: '*.html',
      options: {
        printWidth: 120,
        htmlWhitespaceSensitivity: 'css',
        bracketSameLine: true,
      },
    },
    {
      files: '*.astro',
      options: {
        parser: 'astro',
        printWidth: 100,
      },
    },
    {
      files: ['*.css', '*.scss', '*.less'],
      options: {
        printWidth: 100,
        singleQuote: false,
      },
    },
    {
      files: '*.ts',
      options: {
        parser: 'typescript',
        printWidth: 90,
      },
    },
    {
      files: '*.js',
      options: {
        parser: 'babel',
      },
    },
  ],
};
