#ifdef PLATFORM_WINDOWS
/*
 * wasapi_capture.cpp — WASAPI loopback capture implementation.
 *
 * System audio (target_pid == 0):
 *   Opens the default render endpoint in loopback mode.
 *   AUDCLNT_STREAMFLAGS_LOOPBACK taps the post-mix audio stream that
 *   is being sent to the speakers — no virtual driver required.
 *
 * Per-process audio (target_pid != 0) — MVP note:
 *   Full per-process WASAPI capture requires Windows 10 RS2+ and the
 *   AudioGraph / virtual device approach.  For the MVP we capture the
 *   system mix (same as target_pid == 0).  The application list from
 *   list_apps() is still accurate so the UX still shows process names.
 *   Phase 2 will route per-process via IAudioClient3 / AASAPI.
 */

#include "wasapi_capture.h"
#include <psapi.h>
#include <cstring>
#include <algorithm>
#include <initguid.h>
#include <mmdeviceapi.h>
#include <ks.h>
#include <ksmedia.h>

#define SAFE_RELEASE(p) do { if (p) { (p)->Release(); (p) = nullptr; } } while(0)
#define HR_CHECK(hr)    do { if (FAILED(hr)) return -1; } while(0)

WASAPICapture::WASAPICapture()  = default;

WASAPICapture::~WASAPICapture()
{
    stop();
    SAFE_RELEASE(capture_);
    SAFE_RELEASE(client_);
    if (wave_fmt_) { CoTaskMemFree(wave_fmt_); wave_fmt_ = nullptr; }
    SAFE_RELEASE(device_);
    SAFE_RELEASE(enumerator_);
    if (event_) { CloseHandle(event_); event_ = nullptr; }
}

/* ── start() ──────────────────────────────────────────────────────────────── */

int WASAPICapture::start(
    SPSCRingBuffer<float, kCaptureBufSize>* ring,
    uint32_t /*target_pid*/,
    uint8_t  channels)
{
    ring_          = ring;
    want_channels_ = channels ? channels : 2;

    /* WASAPI requires STA or MTA; use MTA so we are not bound to a thread. */
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);

    HRESULT hr;

    hr = CoCreateInstance(
        __uuidof(MMDeviceEnumerator), nullptr,
        CLSCTX_ALL, __uuidof(IMMDeviceEnumerator),
        reinterpret_cast<void**>(&enumerator_));
    HR_CHECK(hr);

    hr = enumerator_->GetDefaultAudioEndpoint(eRender, eConsole, &device_);
    HR_CHECK(hr);

    hr = device_->Activate(
        __uuidof(IAudioClient), CLSCTX_ALL, nullptr,
        reinterpret_cast<void**>(&client_));
    HR_CHECK(hr);

    hr = client_->GetMixFormat(&wave_fmt_);
    HR_CHECK(hr);

    /* 20 ms buffer, event-driven, loopback. */
    hr = client_->Initialize(
        AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
        200000,   /* buffer duration: 20 ms in 100-ns units */
        0,
        wave_fmt_,
        nullptr);
    HR_CHECK(hr);

    event_ = CreateEventW(nullptr, FALSE, FALSE, nullptr);
    if (!event_) return -1;

    hr = client_->SetEventHandle(event_);
    HR_CHECK(hr);

    hr = client_->GetService(
        __uuidof(IAudioCaptureClient),
        reinterpret_cast<void**>(&capture_));
    HR_CHECK(hr);

    hr = client_->Start();
    HR_CHECK(hr);

    running_.store(true, std::memory_order_release);
    thread_ = std::thread(&WASAPICapture::capture_loop, this);
    return 0;
}

/* ── stop() ───────────────────────────────────────────────────────────────── */

void WASAPICapture::stop()
{
    running_.store(false, std::memory_order_release);
    if (event_) SetEvent(event_);           /* unblock WaitForSingleObject */
    if (thread_.joinable()) thread_.join();
    if (client_) client_->Stop();
}

/* ── Capture thread ───────────────────────────────────────────────────────── */

void WASAPICapture::capture_loop()
{
    /*
     * Conversion scratch buffer: pre-allocated, never re-allocated inside loop.
     * 4096 frames × 2 channels = 8 192 floats (~32 KB).
     */
    constexpr std::size_t MAX_FRAMES = 4096;
    float conv_buf[MAX_FRAMES * 2];

    while (running_.load(std::memory_order_acquire)) {

        /* Event-driven: block until WASAPI signals new data (max 20 ms). */
        DWORD rc = WaitForSingleObject(event_, 20);
        if (rc != WAIT_OBJECT_0) continue;

        UINT32 packet_size = 0;
        while (SUCCEEDED(capture_->GetNextPacketSize(&packet_size))
               && packet_size > 0)
        {
            BYTE*  data   = nullptr;
            UINT32 frames = 0;
            DWORD  flags  = 0;

            HRESULT hr = capture_->GetBuffer(
                &data, &frames, &flags, nullptr, nullptr);
            if (FAILED(hr)) break;

            /* Clamp to our scratch buffer size. */
            const std::size_t out_frames =
                std::min(static_cast<std::size_t>(frames), MAX_FRAMES);

            if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
                /* OS signalled silence — fill with zeros. */
                std::memset(conv_buf, 0,
                            out_frames * want_channels_ * sizeof(float));
            } else {
                convert_to_float(data,
                                 static_cast<UINT32>(out_frames),
                                 wave_fmt_,
                                 conv_buf,
                                 want_channels_);
            }

            /* ❌ No allocs, ❌ no locks — only ring buffer push. */
            ring_->push(conv_buf, out_frames * want_channels_);

            capture_->ReleaseBuffer(frames);
        }
    }
}

/* ── Format conversion ────────────────────────────────────────────────────── */

bool WASAPICapture::convert_to_float(
    const BYTE*         src,
    UINT32              frames,
    const WAVEFORMATEX* fmt,
    float*              dst,
    uint8_t             want_ch) noexcept
{
    const WORD src_ch = fmt->nChannels;
    const WORD bits   = fmt->wBitsPerSample;

    const bool is_ext   = (fmt->wFormatTag == WAVE_FORMAT_EXTENSIBLE);
    const auto* wfext   = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(fmt);

    bool is_float = false, is_pcm = false;
    if (is_ext) {
        is_float = IsEqualGUID(wfext->SubFormat, KSDATAFORMAT_SUBTYPE_IEEE_FLOAT);
        is_pcm   = IsEqualGUID(wfext->SubFormat, KSDATAFORMAT_SUBTYPE_PCM);
    } else {
        is_float = (fmt->wFormatTag == WAVE_FORMAT_IEEE_FLOAT);
        is_pcm   = (fmt->wFormatTag == WAVE_FORMAT_PCM);
    }

    const WORD stride = fmt->nBlockAlign;

    for (UINT32 f = 0; f < frames; ++f) {
        const BYTE* frame_ptr = src + static_cast<std::size_t>(f) * stride;

        for (WORD c = 0; c < want_ch; ++c) {
            /* For mono output, always use channel 0. */
            const WORD src_c = (c < src_ch) ? c : 0;
            const BYTE* s    = frame_ptr + src_c * (bits / 8);

            float val = 0.f;
            if (is_float && bits == 32) {
                std::memcpy(&val, s, 4);
            } else if (is_pcm && bits == 16) {
                int16_t s16;
                std::memcpy(&s16, s, 2);
                val = s16 / 32768.f;
            } else if (is_pcm && bits == 24) {
                int32_t s32 = 0;
                std::memcpy(reinterpret_cast<uint8_t*>(&s32) + 1, s, 3);
                val = (s32 >> 8) / 8388608.f;
            } else if (is_pcm && bits == 32) {
                int32_t s32;
                std::memcpy(&s32, s, 4);
                val = s32 / 2147483648.f;
            }

            dst[f * want_ch + c] = val;
        }
    }
    return true;
}

/* ── Application listing ──────────────────────────────────────────────────── */

std::vector<AudioAppEntry> WASAPICapture::list_apps()
{
    std::vector<AudioAppEntry> result;

    CoInitializeEx(nullptr, COINIT_MULTITHREADED);

    IMMDeviceEnumerator*  enumerator = nullptr;
    IMMDevice*            device     = nullptr;
    IAudioSessionManager2* mgr       = nullptr;
    IAudioSessionEnumerator* senum   = nullptr;

    if (FAILED(CoCreateInstance(
            __uuidof(MMDeviceEnumerator), nullptr,
            CLSCTX_ALL, __uuidof(IMMDeviceEnumerator),
            reinterpret_cast<void**>(&enumerator))))
        goto cleanup;

    if (FAILED(enumerator->GetDefaultAudioEndpoint(
            eRender, eConsole, &device)))
        goto cleanup;

    if (FAILED(device->Activate(
            __uuidof(IAudioSessionManager2), CLSCTX_ALL,
            nullptr, reinterpret_cast<void**>(&mgr))))
        goto cleanup;

    if (FAILED(mgr->GetSessionEnumerator(&senum)))
        goto cleanup;

    {
        int count = 0;
        senum->GetCount(&count);

        for (int i = 0; i < count; ++i) {
            IAudioSessionControl*  ctrl  = nullptr;
            IAudioSessionControl2* ctrl2 = nullptr;

            if (FAILED(senum->GetSession(i, &ctrl))) continue;

            if (SUCCEEDED(ctrl->QueryInterface(
                    __uuidof(IAudioSessionControl2),
                    reinterpret_cast<void**>(&ctrl2))))
            {
                DWORD pid = 0;
                if (SUCCEEDED(ctrl2->GetProcessId(&pid)) && pid > 0) {
                    HANDLE proc = OpenProcess(
                        PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
                    if (proc) {
                        char   path[MAX_PATH] = {};
                        DWORD  size           = MAX_PATH;
                        if (QueryFullProcessImageNameA(proc, 0, path, &size)) {
                            const char* base = strrchr(path, '\\');
                            base = base ? base + 1 : path;

                            std::string name(base);
                            auto dot = name.rfind('.');
                            if (dot != std::string::npos)
                                name = name.substr(0, dot);

                            /* Deduplicate: skip if PID already added. */
                            bool dup = false;
                            for (auto& e : result)
                                if (e.pid == static_cast<uint32_t>(pid))
                                    { dup = true; break; }
                            if (!dup)
                                result.push_back({ static_cast<uint32_t>(pid),
                                                   std::move(name) });
                        }
                        CloseHandle(proc);
                    }
                }
                ctrl2->Release();
            }
            ctrl->Release();
        }
    }

cleanup:
    SAFE_RELEASE(senum);
    SAFE_RELEASE(mgr);
    SAFE_RELEASE(device);
    SAFE_RELEASE(enumerator);
    return result;
}

#endif /* PLATFORM_WINDOWS */
