'use strict';

// Load the compiled N-API binary.  Try Release first, fall back to Debug.
let addon;

try {
  addon = require('./build/Release/stream_audio.node');
} catch (_) {
  try {
    addon = require('./build/Debug/stream_audio.node');
  } catch (err) {
    throw new Error(
      `[native-audio-capture] Failed to load native binary: ${err.message}\n` +
      `Run 'npm install' inside the native-audio-capture directory to build it.`
    );
  }
}

// addon.AudioCapture is the N-API class exported by audio_capture_napi.cpp.
// main.ts resolves it as:  AudioCapture = module.AudioCapture || module
module.exports = addon;
