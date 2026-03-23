// Compiles electron/main.ts + electron/preload.ts → electron-dist/ (CommonJS)
// Uses esbuild (already available as a Vite transitive dependency).
const { build } = require('esbuild')

build({
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
  outdir: 'electron-dist',
  platform: 'node',
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
  external: ['electron'],
  sourcemap: true,
  bundle: true,
  logLevel: 'info',
}).catch(() => process.exit(1))
