import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // no raw HTML injection anywhere: the CSP enforces Trusted Types in production
      'no-restricted-properties': ['error',
        { property: 'innerHTML', message: 'Build DOM nodes or JSX; innerHTML is blocked by Trusted Types.' },
        { property: 'outerHTML', message: 'Blocked by Trusted Types.' }],
      'no-restricted-syntax': ['error', { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Not allowed: Trusted Types.' }],
    },
  },
  // Playwright fixtures call a function named use(): not a React hook
  { files: ['tests/e2e/**'], rules: { 'react-hooks/rules-of-hooks': 'off' } },
  // classic scripts served as they are (the pre-paint theme script)
  { files: ['public/**/*.js'], languageOptions: { globals: globals.browser } },
);
