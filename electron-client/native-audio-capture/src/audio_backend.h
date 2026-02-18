#pragma once
/*
 * audio_backend.h — Internal C++ interface for platform audio backends.
 *
 * Each platform (Windows/macOS/Linux) implements IAudioBackend.
 * The backend is responsible for:
 *   1. Capturing audio from the OS.
 *   2. Converting it to float32 interleaved at 48 kHz.
 *   3. Pushing samples into the provided SPSCRingBuffer.
 *
 * Real-time rule: the capture callback MUST NOT allocate memory or
 * acquire locks.  All allocation happens during start().
 */

#include "ring_buffer.h"
#include <cstdint>
#include <string>
#include <vector>

/* Ring buffer large enough for ~1.3 s of stereo 48 kHz audio. */
static constexpr std::size_t kCaptureBufSize = 1u << 17;  /* 131 072 floats */

struct AudioAppEntry {
    uint32_t    pid;
    std::string name;
};

class IAudioBackend {
public:
    virtual ~IAudioBackend() = default;

    /**
     * Initialise the OS capture pipeline and start pushing float32 PCM
     * (interleaved, 'channels' channels, 48 kHz) into *ring.
     *
     * target_pid == 0  →  system-audio loopback
     * target_pid != 0  →  per-process capture (best-effort; platform-dependent)
     *
     * Returns 0 on success, negative on error.
     * Must be called from a non-RT thread.
     */
    virtual int start(
        SPSCRingBuffer<float, kCaptureBufSize>* ring,
        uint32_t target_pid,
        uint8_t  channels
    ) = 0;

    /**
     * Stop capture and release all OS resources.
     * Blocks until the capture thread has exited.
     * Must be called from a non-RT thread.
     */
    virtual void stop() = 0;

    /**
     * Return a list of processes that are currently producing audio output.
     * Called outside of any capture session (no thread constraints).
     * Returns an empty vector if not supported on this platform.
     */
    virtual std::vector<AudioAppEntry> list_apps() = 0;
};
