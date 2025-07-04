module.exports = {
  // JavaScript and TypeScript files (root level)
  '*.{js,ts}': [
    'eslint --fix',
    'prettier --write',
  ],
  
  // Frontend Angular files
  'frontend/**/*.{ts,html}': [
    'cd frontend && npm run lint:fix',
    'cd frontend && npm run format',
  ],
  
  // Frontend CSS files
  'frontend/**/*.{css,scss}': [
    'cd frontend && npm run style:css:fix',
    'prettier --write',
  ],
  
  // Backend TypeScript files
  'backend/**/*.ts': [
    'cd backend && npm run lint:fix',
    'cd backend && npm run format',
  ],
  
  // Landing Astro files
  'landing/**/*.{astro,ts,js}': [
    'cd landing && npm run lint:fix',
    'cd landing && npm run format',
  ],
  
  // Landing CSS files
  'landing/**/*.css': [
    'cd landing && npm run style:css:fix',
    'prettier --write',
  ],
  
  // General CSS files
  '*.{css,scss}': [
    'stylelint --fix',
    'prettier --write',
  ],
  
  // JSON and Markdown files
  '*.{json,md}': [
    'prettier --write',
  ],
  
  // Package.json files
  '**/package.json': [
    'prettier --write',
  ],
};