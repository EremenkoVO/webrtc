#!/usr/bin/env node
'use strict';
/*
 * scripts/build.js
 *
 * Helper that verifies system dependencies and invokes node-gyp.
 * Run via:  node scripts/build.js
 * Or indirectly via:  npm install  (triggers "install" script in package.json)
 */

const { execSync, execFileSync } = require('child_process');
const os   = require('os');
const path = require('path');

const platform = os.platform();

/* ── Dependency hints per platform ──────────────────────────────────────────── */
const DEPS = {
  linux:  'libpipewire-0.3-dev  libspa-0.2-dev  libopus-dev\n' +
          '  Ubuntu/Debian: sudo apt install libpipewire-0.3-dev libspa-0.2-dev libopus-dev\n' +
          '  Arch:          sudo pacman -S pipewire opus',

  darwin: 'opus\n' +
          '  Homebrew: brew install opus',

  win32:  'Opus headers + import library\n' +
          '  vcpkg:  vcpkg install opus:x64-windows\n' +
          '  Manual: set OPUS_ROOT=<path> before running npm install',
};

console.log(`\n[native-audio-capture] Building for ${platform}…`);

/* ── Check for required tools ────────────────────────────────────────────── */
function which(cmd) {
  try {
    execFileSync(platform === 'win32' ? 'where' : 'which', [cmd],
                 { stdio: 'ignore' });
    return true;
  } catch (_) { return false; }
}

if (!which('node-gyp')) {
  console.error('[native-audio-capture] node-gyp not found.');
  console.error('  Install:  npm install -g node-gyp');
  process.exit(1);
}

/* ── Check for pkg-config + backend library (non-Windows) ────────────────── */
if (platform !== 'win32' && which('pkg-config')) {
  const lib = platform === 'linux' ? 'libpipewire-0.3' : 'opus';
  try {
    execFileSync('pkg-config', ['--exists', lib], { stdio: 'ignore' });
    console.log(`[native-audio-capture] ✓ ${lib} found via pkg-config`);
  } catch (_) {
    console.warn(`[native-audio-capture] ⚠ ${lib} not found via pkg-config.`);
    console.warn(`  Install dependencies:\n  ${DEPS[platform]}`);
    console.warn('  Build will proceed but may fail.\n');
  }
}

/* ── Run node-gyp ────────────────────────────────────────────────────────── */
const root = path.join(__dirname, '..');
try {
  execSync('node-gyp rebuild', {
    cwd:   root,
    stdio: 'inherit',
    env:   { ...process.env },
  });
  console.log('[native-audio-capture] ✓ Build succeeded');
  console.log('[native-audio-capture]   Binary: build/Release/stream_audio.node');
} catch (_) {
  console.error('\n[native-audio-capture] ✗ Build failed.');
  console.error(`  Required system dependencies:\n  ${DEPS[platform] || 'unknown platform'}`);
  process.exit(1);
}
