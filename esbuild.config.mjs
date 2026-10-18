import esbuild from 'esbuild';
import { builtinModules } from 'node:module';

const production = process.argv.includes('production');
const context = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  loader: { '.md': 'text' },
  external: [
    'obsidian',
    'electron',
    '@codemirror/*',
    '@lezer/*',
    'node:*',
    ...builtinModules,
  ],
  format: 'cjs',
  target: 'es2021',
  sourcemap: production ? false : 'inline',
  outfile: 'main.js',
  minify: production,
  logLevel: 'info',
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
