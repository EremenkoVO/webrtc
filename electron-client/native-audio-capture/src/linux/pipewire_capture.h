#pragma once
#ifdef PLATFORM_LINUX
/*
 * pipewire_capture.h — Linux PipeWire audio capture backend.
 *
 * Primary mode : @DEFAULT_SINK@.monitor (system audio loopback)
 * Per-process  : Phase 2 — enumerate nodes by application.process.id
 * Fallback     : PulseAudio compatibility layer (if PipeWire-pulse is active)
 *
 * Dependencies : libpipewire-0.3-dev, libspa-0.2-dev
 *
 * Threading:
 *   pw_main_loop runs in a dedicated thread (loop_thread_).
 *   The PipeWire process callback (on_process) fires on that thread in
 *   RT context — no allocs, no locks permitted.
 */

#include "../audio_backend.h"
#include <pipewire/pipewire.h>
#include <atomic>
#include <thread>

class PipeWireCapture : public IAudioBackend {
public:
    PipeWireCapture();
    ~PipeWireCapture() override;

    int  start(SPSCRingBuffer<float, kCaptureBufSize>* ring,
               uint32_t target_pid,
               uint8_t  channels) override;
    void stop() override;

    std::vector<AudioAppEntry> list_apps() override;

private:
    /* Stream event callbacks (static so they can be stored in the C vtable). */
    static void on_process(void* userdata);
    static void on_state_changed(void*           data,
                                 pw_stream_state old,
                                 pw_stream_state state,
                                 const char*     error);

    pw_main_loop* loop_   = nullptr;
    pw_context*   ctx_    = nullptr;
    pw_core*      core_   = nullptr;
    pw_stream*    stream_ = nullptr;

    SPSCRingBuffer<float, kCaptureBufSize>* ring_ = nullptr;
    uint8_t  want_channels_ = 2;
    uint32_t target_pid_    = 0;

    std::thread       loop_thread_;
    std::atomic<bool> running_ { false };

    static const pw_stream_events kStreamEvents;
};

#endif /* PLATFORM_LINUX */
