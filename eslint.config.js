// Lint for sources, tests, and the build config. Types are checked by `tsc`, so the rules here stay syntactic.
import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['lib/', 'dev/lib/', 'node_modules/', 'docs_ru/', '.agents/worktrees/', '.claude/worktrees/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
      // A worktree under `.agents/worktrees/` adds sibling `tsconfig.json`
      // candidates; anchor the parser to the repository root so `lint` runs
      // from a worktree without guessing.
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['src/client/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
)
