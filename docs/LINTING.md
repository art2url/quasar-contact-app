# Linting and Code Quality Setup

This project uses a comprehensive linting and formatting setup across all technologies: Angular,
Node.js, Astro, TypeScript, CSS, and HTML.

## Tools Used

- **ESLint**: JavaScript/TypeScript linting
- **Prettier**: Code formatting
- **Stylelint**: CSS/SCSS linting
- **Husky**: Git hooks
- **lint-staged**: Run linters on staged files
- **TypeScript**: Type checking

## Project Structure

```
├── eslint.config.js      # Root ESLint config (flat config)
├── .prettierrc.js        # Prettier config with Astro plugin
├── .prettierignore       # Prettier ignore patterns
├── .stylelintrc.js       # Stylelint config
├── .lintstagedrc.js      # lint-staged config
├── .husky/
│   └── pre-commit        # Pre-commit hooks
├── frontend/
│   └── eslint.config.js  # Angular-specific ESLint (flat config)
├── backend/
│   └── eslint.config.js  # Node.js-specific ESLint (flat config)
└── landing/
    └── eslint.config.js  # Astro-specific ESLint (flat config)
```

## Available Scripts

### Root Level

```bash
# Lint all projects
npm run lint

# Fix all linting issues
npm run lint:fix

# Format all code
npm run format

# Check formatting
npm run format:check

# Run all style checks (lint + format)
npm run style

# Fix all style issues
npm run style:fix
```

### Per Project

Each project (frontend, backend, landing) has its own linting scripts:

#### Frontend (Angular)

```bash
cd frontend
npm run lint           # ESLint for TS/HTML
npm run lint:fix       # Fix ESLint issues
npm run format         # Prettier formatting
npm run style:css      # Stylelint for CSS
npm run style:css:fix  # Fix CSS issues
npm run typecheck      # TypeScript checking
npm run style          # All checks
npm run style:fix      # Fix all issues
```

#### Backend (Node.js)

```bash
cd backend
npm run lint           # ESLint for TypeScript
npm run lint:fix       # Fix ESLint issues
npm run format         # Prettier formatting
npm run typecheck      # TypeScript checking
npm run style          # All checks
npm run style:fix      # Fix all issues
```

#### Landing (Astro)

```bash
cd landing
npm run lint           # ESLint for Astro/TS/JS
npm run lint:fix       # Fix ESLint issues
npm run format         # Prettier formatting
npm run style:css      # Stylelint for CSS
npm run typecheck      # Astro type checking
npm run style          # All checks
npm run style:fix      # Fix all issues
```

## IDE Integration

### VS Code

Install these extensions for the best experience:

```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "stylelint.vscode-stylelint",
    "astro-build.astro-vscode",
    "angular.ng-template"
  ]
}
```

Add to your VS Code settings.json:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "eslint.validate": ["javascript", "typescript", "astro"],
  "prettier.documentSelectors": ["**/*.astro"],
  "stylelint.validate": ["css", "scss"]
}
```

## Pre-commit Hooks

The project uses Husky to run linting and formatting checks before each commit:

1. **lint-staged**: Runs appropriate linters on staged files
2. **Type checking**: Runs TypeScript checks for all projects
3. **Format checking**: Ensures all code is properly formatted

To bypass pre-commit hooks (not recommended):

```bash
git commit --no-verify
```

## Configuration Details

### ESLint Rules

- **Modern Flat Config**: All projects use ESLint's new flat configuration format
  (`eslint.config.js`)
- **Root**: Basic JavaScript/TypeScript rules with ignores for project directories
- **Frontend**: Angular-specific rules + TypeScript strict mode
- **Backend**: Node.js specific rules + security rules + unused variable handling
- **Landing**: Astro-specific rules + TypeScript with declaration file exclusions

### Prettier Configuration

- Single quotes for strings
- 2-space indentation
- Trailing commas where valid
- 80-character line width (varies by file type)
- Different rules for JSON, Markdown, HTML, CSS, Astro
- **Astro Support**: Includes `prettier-plugin-astro` for .astro file formatting

### Stylelint Rules

- Standard CSS rules
- Property ordering (Recess order)
- SCSS support
- CSS custom properties support
- Accessibility considerations

## Setup for New Contributors

1. **Install dependencies**:

   ```bash
   npm run install:all
   ```

   If you encounter dependency conflicts, use:

   ```bash
   npm install --legacy-peer-deps
   cd frontend && npm install --legacy-peer-deps
   cd ../backend && npm install --legacy-peer-deps
   cd ../landing && npm install --legacy-peer-deps
   cd ..
   ```

2. **Husky Setup** (Automatic): The `prepare` script automatically sets up Husky pre-commit hooks
   when you run `npm install`. No manual initialization required with modern Husky v9+.

   ~~Old way (deprecated): `npx husky install`~~

3. **Run initial formatting**:

   ```bash
   npm run style:fix
   ```

4. **Verify setup**:
   ```bash
   npm run style
   ```

## Troubleshooting

### Common Issues

1. **ESLint errors on save**: Check VS Code ESLint extension settings
2. **Prettier conflicts**: Disable other formatting extensions
3. **Pre-commit hooks failing**: Run `npm run style:fix` before committing
4. **TypeScript errors**: Check tsconfig.json files in each project
5. **ESLint flat config issues**: Ensure you're using `eslint.config.js` (not `.eslintrc.js`)
6. **Astro parser errors**: Verify `prettier-plugin-astro` is installed in the landing project
7. **Dependency version conflicts**: Use `--legacy-peer-deps` flag during installation

### Disable Rules Temporarily

```javascript
// ESLint
/* eslint-disable rule-name */
code here
/* eslint-enable rule-name */

// Prettier
<!-- prettier-ignore -->
code here

// Stylelint
/* stylelint-disable rule-name */
.selector { }
/* stylelint-enable rule-name */
```

## Benefits

1. **Consistent Code Style**: All team members write code in the same style
2. **Fewer Bugs**: Static analysis catches common errors
3. **Better Readability**: Formatted code is easier to read and maintain
4. **Automated Quality**: Pre-commit hooks ensure quality before commits
5. **IDE Integration**: Real-time feedback while coding
6. **Multi-technology Support**: Works across Angular, Node.js, and Astro
7. **Modern Configuration**: Uses ESLint flat config format for better performance
8. **Fork-Ready**: All files maintain proper formatting for repository forking

## Maintenance

- Update linting dependencies regularly
- Review and adjust rules based on team feedback
- Keep configuration files in sync across projects
- Monitor performance impact of linting rules
- Test linting setup after dependency updates: `npm run style:fix`
