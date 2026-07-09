/**
 * build-analytics-runtime.mjs
 *
 * Compiles the analytics static runtime UMD bundle for embedding
 * in exported static site pages.
 *
 * Usage:
 *   node scripts/build-analytics-runtime.mjs
 *
 * Output:
 *   resources/analytics-runtime.umd.js
 *
 * This script is run automatically during the Electron pre-package step.
 * Add it to package.json:
 *
 *   "scripts": {
 *     "build:analytics-runtime": "node scripts/build-analytics-runtime.mjs"
 *   }
 *
 * And hook it in forge.config.js or electron-builder.yml:
 *
 *   hooks: {
 *     generateAssets: async () => {
 *       await import('./scripts/build-analytics-runtime.mjs');
 *     }
 *   }
 */

import esbuild from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outfile = path.join(projectRoot, 'resources', 'analytics-runtime.umd.js');

// Ensure resources/ directory exists
fs.mkdirSync(path.join(projectRoot, 'resources'), { recursive: true });

const result = await esbuild.build({
  entryPoints: [
    path.join(
      projectRoot,
      'src',
      'renderer',
      'components',
      'analytics',
      'staticRuntime',
      'AnalyticsStaticRuntime.tsx',
    ),
  ],
  bundle: true,
  format: 'iife',
  globalName: 'AnalyticsRuntime',
  outfile,
  platform: 'browser',

  // Bundle everything — no CDN dependency, works offline, no global-name mismatches.
  // Bundle size is larger (~3-4 MB) but reliable and self-contained.
  external: [],

  define: {
    'process.env.NODE_ENV': '"production"',
  },

  minify: true,
  sourcemap: false,
  jsx: 'transform',
  jsxFactory: 'React.createElement',
  jsxFragment: 'React.Fragment',
  tsconfig: path.join(projectRoot, 'tsconfig.json'),
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
  },
  logLevel: 'info',
});

if (result.errors.length > 0) {
  console.error('Build failed:', result.errors);
  process.exit(1);
} else {
  const stat = fs.statSync(outfile);
  console.log(
    `✓ analytics-runtime.umd.js built (${(stat.size / 1024).toFixed(1)} KB) → ${outfile}`,
  );
}
