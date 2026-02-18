# native-audio-capture

C++ native N-API module for Electron — system and per-process audio capture
with Opus encoding.  Implements the architecture defined in the Cursor skill
`cursor_skill_native_audio_screencast.md`.

---

## Architecture

```
Electron Renderer
      │  IPC (Float32Array PCM)
Electron Main Process
      │  getAllAudioData() — polls ring buffer every 10 ms
AudioCaptureWrapper (N-API)
      │  stream_audio_poll_pcm()
poll_ring  (lock-free SPSC)
      ▲
Processing Thread  ──► Opus encode ──► opus_packet_cb (optional)
      │  pop()
capture_ring  (lock-free SPSC)
      ▲
OS Capture Callback  (real-time — ❌ no allocs, ❌ no locks)
      │
Platform Backend
  ├── Windows  WASAPI loopback        (wasapi_capture.cpp)
  ├── macOS    CoreAudio HAL tap      (coreaudio_capture.cpp)
  └── Linux    PipeWire monitor sink  (pipewire_capture.cpp)
```

---

## Platform support

| Platform | Backend          | System audio | Per-process       |
|----------|------------------|:------------:|:-----------------:|
| Windows  | WASAPI loopback  | ✅            | Phase 2 (AASAPI)  |
| macOS    | CoreAudio HAL    | ⚠ needs vAD* | ❌ private SPI    |
| Linux    | PipeWire monitor | ✅            | Phase 2 (registry)|

\* macOS system audio requires a virtual audio driver (e.g. BlackHole).

---

## System dependencies

### Linux
```bash
# Ubuntu / Debian
sudo apt install libpipewire-0.3-dev libspa-0.2-dev libopus-dev

# Arch
sudo pacman -S pipewire opus
```

### macOS
```bash
brew install opus
```

### Windows
Install [Opus](https://opus-codec.org/) then set environment variables
before running `npm install`:

```bat
set OPUS_ROOT=C:\path\to\opus
npm install
```

Or use vcpkg:
```bat
vcpkg install opus:x64-windows
```
If Opus is unavailable, define `STREAM_AUDIO_NO_OPUS=1` in the build to
compile without encoding support (PCM polling will still work).

---

## Build

```bash
cd electron-client/native-audio-capture
npm install          # installs node-addon-api and runs node-gyp rebuild
npm run build:debug  # debug symbols
npm run clean        # remove build artefacts
```

Or via the helper script:
```bash
node scripts/build.js
```

---

## API

```js
const { AudioCapture } = require('./native-audio-capture');

const ac = new AudioCapture();

// List processes currently outputting audio
const apps = await ac.getAudioApplications();
// → [{ pid: 1234, name: 'Spotify' }, …]

// Start capturing (pid=0 → system loopback, pid>0 → per-process)
await ac.startCapture(0);

// Poll PCM data (call every 10 ms, matches main.ts polling interval)
const samples = await ac.getAllAudioData();
// → number[]  (interleaved float32, stereo, 48 kHz)

// Stop
await ac.stopCapture();
```

---

## Packaging with electron-builder

Add the native module directory to the `files` array in `package.json`:

```json
"files": [
  "dist/**/*",
  "dist-electron/**/*",
  "native-audio-capture/build/Release/stream_audio.node",
  "native-audio-capture/index.js",
  "native-audio-capture/package.json"
]
```

For cross-platform builds consider using `electron-rebuild` to recompile
the `.node` binary for the target Electron ABI.

---

## Opus configuration

| Parameter          | Value                   |
|--------------------|-------------------------|
| Application        | OPUS_APPLICATION_AUDIO  |
| Frame size         | 20 ms (960 samples)     |
| Bitrate            | 96 kbps VBR (default)   |
| Inband FEC         | enabled                 |
| Packet loss %      | 10 %                    |
| Signal type        | OPUS_SIGNAL_MUSIC       |
| Complexity         | 5 (balanced)            |

---

## Roadmap

- **Phase 1 (current)** — System audio loopback on all platforms, Opus encoding, PCM polling
- **Phase 2** — Per-process capture (WASAPI AASAPI on Windows, PipeWire registry on Linux)
- **Phase 3** — Noise suppression / AGC, dynamic bitrate, RTP/SRTP output
