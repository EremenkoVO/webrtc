#!/usr/bin/env node
'use strict';
/*
 * scripts/detect_opus.js
 *
 * Detects the Opus library at configure time and writes config.gypi so that
 * binding.gyp can enable or disable Opus encoding based on what's available.
 *
 * Search order:
 *   macOS  → Homebrew prefix (Apple Silicon + Intel)
 *   Linux  → pkg-config
 *   Windows → %OPUS_ROOT% env var
 *
 * Output: config.gypi  (imported by binding.gyp)
 */

const fs      = require('fs');
const path    = require('path');
const { execSync } = require('child_process');

const platform = process.platform;

function findOpus() {
  /* ── macOS (Homebrew) ─────────────────────────────────────────────────── */
  if (platform === 'darwin') {
    const candidates = [
      '/opt/homebrew/opt/opus',   /* Apple Silicon */
      '/usr/local/opt/opus',      /* Intel Mac */
    ];

    /* Also try 'brew --prefix opus' in case it's in a non-standard location. */
    try {
      const p = execSync('brew --prefix opus 2>/dev/null', { encoding: 'utf8' }).trim();
      if (p) candidates.unshift(p);
    } catch (_) {}

    for (const prefix of candidates) {
      if (fs.existsSync(path.join(prefix, 'include', 'opus', 'opus.h'))) {
        return { prefix, include: path.join(prefix, 'include'), lib: path.join(prefix, 'lib') };
      }
    }
    return null;
  }

  /* ── Linux (pkg-config) ───────────────────────────────────────────────── */
  if (platform === 'linux') {
    try {
      execSync('pkg-config --exists opus 2>/dev/null', { stdio: 'ignore' });
      const cflags = execSync('pkg-config --cflags-only-I opus', { encoding: 'utf8' }).trim();
      const libs   = execSync('pkg-config --libs-only-L opus',   { encoding: 'utf8' }).trim();
      /* Extract first -I and -L path (strip flags). */
      const incMatch = cflags.match(/-I\s*(\S+)/);
      const libMatch = libs.match(/-L\s*(\S+)/);
      return {
        prefix: '',
        include: incMatch ? incMatch[1] : '/usr/include',
        lib:     libMatch ? libMatch[1] : '/usr/lib',
      };
    } catch (_) {
      return null;
    }
  }

  /* ── Windows (%OPUS_ROOT%) ────────────────────────────────────────────── */
  if (platform === 'win32') {
    const root = process.env.OPUS_ROOT;
    if (root && fs.existsSync(path.join(root, 'include', 'opus', 'opus.h'))) {
      return {
        prefix:  root,
        include: path.join(root, 'include'),
        lib:     path.join(root, 'lib'),
      };
    }
    return null;
  }

  return null;
}

/* ── Write config.gypi ────────────────────────────────────────────────────── */

const opus = findOpus();

const gypi = opus
  ? `{\n  "variables": {\n    "opus_found": "1",\n    "opus_include": "${opus.include.replace(/\\/g, '\\\\')}",\n    "opus_lib":     "${opus.lib.replace(/\\/g, '\\\\')}"\n  }\n}\n`
  : `{\n  "variables": {\n    "opus_found": "0",\n    "opus_include": ".",\n    "opus_lib":     "."\n  }\n}\n`;

fs.writeFileSync(path.join(__dirname, '..', 'config.gypi'), gypi);

if (opus) {
  console.log(`[detect_opus] ✓ Opus found at: ${opus.prefix || opus.include}`);
  console.log(`[detect_opus]   include: ${opus.include}`);
  console.log(`[detect_opus]   lib:     ${opus.lib}`);
} else {
  console.log('[detect_opus] ⚠ Opus not found — building WITHOUT Opus encoding (STREAM_AUDIO_NO_OPUS=1)');
  console.log('[detect_opus]   PCM capture and polling will still work.');
  if (platform === 'darwin')
    console.log('[detect_opus]   To enable: brew install opus  then rebuild.');
  else if (platform === 'linux')
    console.log('[detect_opus]   To enable: sudo apt install libopus-dev  then rebuild.');
  else if (platform === 'win32')
    console.log('[detect_opus]   To enable: set OPUS_ROOT=<path>  then rebuild.');
}
