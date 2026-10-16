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
          allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
  },
  ...obsidianmd.configs.recommended,
);
