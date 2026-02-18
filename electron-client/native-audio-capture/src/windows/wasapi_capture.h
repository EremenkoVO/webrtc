#pragma once
#ifdef PLATFORM_WINDOWS
/*
 * wasapi_capture.h — Windows Audio Session API loopback capture backend.
 *
 * Capture mode  : WASAPI shared-mode loopback (AUDCLNT_STREAMFLAGS_LOOPBACK)
 * Audio device  : Default render endpoint (speakers / headphones)
 * App listing   : IAudioSessionManager2 → IAudioSessionControl2::GetProcessId
 *
 * Threading:
 *   start() sets up COM objects on the calling thread, then spawns a
 *   dedicated capture thread that owns the IAudioCaptureClient.
 *   The capture thread is real-time constrained:
 *     ❌ No allocations inside the capture loop
 *     ❌ No locks inside the capture loop
 *     ✅ Event-driven (WaitForSingleObject) — no busy-poll
 */

#include "../audio_backend.h"
#include <atomic>
#include <thread>
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audiopolicy.h>
#include <functiondiscoverykeys_devpkey.h>

class WASAPICapture : public IAudioBackend {
public:
    WASAPICapture();
    ~WASAPICapture() override;

    int  start(SPSCRingBuffer<float, kCaptureBufSize>* ring,
               uint32_t target_pid,
               uint8_t  channels) override;
    void stop() override;

    std::vector<AudioAppEntry> list_apps() override;

private:
    void    capture_loop();
    bool    convert_to_float(const BYTE*          src,
                              UINT32               frames,
                              const WAVEFORMATEX*  fmt,
                              float*               dst,
                              uint8_t              want_ch) noexcept;

    IMMDeviceEnumerator*  enumerator_ = nullptr;
    IMMDevice*            device_     = nullptr;
    IAudioClient*         client_     = nullptr;
    IAudioCaptureClient*  capture_    = nullptr;
    WAVEFORMATEX*         wave_fmt_   = nullptr;
    HANDLE                event_      = nullptr;

    SPSCRingBuffer<float, kCaptureBufSize>* ring_ = nullptr;
    uint8_t want_channels_ = 2;

    std::thread       thread_;
    std::atomic<bool> running_ { false };
};

#endif /* PLATFORM_WINDOWS */
