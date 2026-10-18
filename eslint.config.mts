import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
  globalIgnores([
    'node_modules',
    'main.js',
    'package-lock.json',
    'esbuild.config.mjs',
    'package.json',
    'tsconfig.json',
    'versions.json',
  ]),
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mts', 'manifest.json', 'scripts/ai-review.mjs', 'scripts/ai-review.test.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    rules: {
      // These tools run in Node.js, outside Obsidian's renderer.
      'no-restricted-globals': 'off',
      'obsidianmd/no-global-this': 'off',
    },
  },
);
