/*
 * stream_audio.cpp — Core capture context: Opus encoder + processing thread.
 *
 * Threading model:
 *
 *   OS Capture Callback  (real-time)
 *         │
 *         │  push()  — no allocs, no locks
 *         ▼
 *   capture_ring  (SPSC, lock-free)
 *         │
 *         │  pop()
 *         ▼
 *   Processing Thread  ─── Opus encode ──► opus_packet_cb
 *         │
 *         │  push()
 *         ▼
 *   poll_ring  (SPSC, lock-free)
 *         │
 *         │  stream_audio_poll_pcm()  (JS polling, any thread)
 *         ▼
 *   getAllAudioData() → Float32Array → IPC → renderer
 */

#include "stream_audio.h"
#include "audio_backend.h"
#include "ring_buffer.h"

#ifndef STREAM_AUDIO_NO_OPUS
#  include <opus/opus.h>
#endif

#include <atomic>
#include <chrono>
#include <cstdlib>
#include <cstring>
#include <memory>
#include <thread>
#include <vector>

#if defined(PLATFORM_WINDOWS)
#  include "windows/wasapi_capture.h"
#elif defined(PLATFORM_MACOS)
#  include "macos/coreaudio_capture.h"
#elif defined(PLATFORM_LINUX)
#  include "linux/pipewire_capture.h"
#endif

/* ── Internal context ─────────────────────────────────────────────────────── */

struct StreamAudioCtx {
    stream_audio_config config {};

    /* Capture callback (RT) → processing thread */
    SPSCRingBuffer<float, kCaptureBufSize> capture_ring;

    /* Processing thread → JS polling */
    SPSCRingBuffer<float, kCaptureBufSize> poll_ring;

#ifndef STREAM_AUDIO_NO_OPUS
    OpusEncoder* opus_enc = nullptr;
    int          opus_err = 0;
#endif

    opus_packet_cb opus_cb = nullptr;
    pcm_frame_cb   pcm_cb  = nullptr;
    void*          user    = nullptr;

    std::unique_ptr<IAudioBackend> backend;

    std::thread       proc_thread;
    std::atomic<bool> running { false };
};

/* ── Processing thread ────────────────────────────────────────────────────── */

static void processing_thread_fn(StreamAudioCtx* ctx)
{
    constexpr int FRAME_SAMPLES = STREAM_AUDIO_FRAME_SAMPLES;  /* 960 */
    const int     channels      = ctx->config.channels;
    const int     frame_floats  = FRAME_SAMPLES * channels;

    /* Pre-allocate all buffers here — none inside the loop. */
    std::vector<float>   pcm_frame(static_cast<std::size_t>(frame_floats), 0.f);
#ifndef STREAM_AUDIO_NO_OPUS
    std::vector<uint8_t> opus_buf(4000);   /* worst-case max Opus packet */
#endif

    std::size_t pending = 0;

    using Clock = std::chrono::steady_clock;
    const auto start_tp = Clock::now();

    auto timestamp_ms = [&]() -> uint32_t {
        return static_cast<uint32_t>(
            std::chrono::duration_cast<std::chrono::milliseconds>(
                Clock::now() - start_tp).count());
    };

    while (ctx->running.load(std::memory_order_acquire)) {

        /* Drain as much as possible toward a full 20 ms frame. */
        const std::size_t want = static_cast<std::size_t>(frame_floats) - pending;
        const std::size_t got  = ctx->capture_ring.pop(
                                     pcm_frame.data() + pending, want);
        pending += got;

        if (pending < static_cast<std::size_t>(frame_floats)) {
            /* Not enough data yet — yield briefly to avoid 100 % CPU. */
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
            continue;
        }

        const uint32_t ts = timestamp_ms();

#ifndef STREAM_AUDIO_NO_OPUS
        /* ── Opus encode ──────────────────────────────────────────────────── */
        if (ctx->opus_enc && ctx->opus_cb) {
            const opus_int32 bytes = opus_encode_float(
                ctx->opus_enc,
                pcm_frame.data(),
                FRAME_SAMPLES,
                opus_buf.data(),
                static_cast<opus_int32>(opus_buf.size()));

            if (bytes > 0) {
                ctx->opus_cb(
                    opus_buf.data(),
                    static_cast<std::size_t>(bytes),
                    ts,
                    ctx->user);
            }
        }
#endif

        /* ── PCM frame callback ───────────────────────────────────────────── */
        if (ctx->pcm_cb) {
            ctx->pcm_cb(pcm_frame.data(), FRAME_SAMPLES, ts, ctx->user);
        }

        /* ── Push to poll ring ────────────────────────────────────────────── */
        /* Drop oldest frame if the consumer (JS) is too slow. */
        if (ctx->poll_ring.available_write() < static_cast<std::size_t>(frame_floats)) {
            float discard[STREAM_AUDIO_FRAME_SAMPLES * 2];
            ctx->poll_ring.pop(discard, static_cast<std::size_t>(frame_floats));
        }
        ctx->poll_ring.push(pcm_frame.data(), static_cast<std::size_t>(frame_floats));

        pending = 0;
    }
}

/* ── Public C API ─────────────────────────────────────────────────────────── */

extern "C" {

int stream_audio_list_apps(
    struct stream_audio_app_info** out_apps,
    uint32_t*                      out_count)
{
    if (!out_apps || !out_count) return -1;

    /* Create a temporary backend instance solely for enumeration. */
    std::unique_ptr<IAudioBackend> tmp;
#if defined(PLATFORM_WINDOWS)
    tmp = std::make_unique<WASAPICapture>();
#elif defined(PLATFORM_MACOS)
    tmp = std::make_unique<CoreAudioCapture>();
#elif defined(PLATFORM_LINUX)
    tmp = std::make_unique<PipeWireCapture>();
#endif

    if (!tmp) {
        *out_apps  = nullptr;
        *out_count = 0;
        return 0;
    }

    const auto entries = tmp->list_apps();

    if (entries.empty()) {
        *out_apps  = nullptr;
        *out_count = 0;
        return 0;
    }

    auto* arr = static_cast<stream_audio_app_info*>(
        std::malloc(entries.size() * sizeof(stream_audio_app_info)));
    if (!arr) return -1;

    for (std::size_t i = 0; i < entries.size(); ++i) {
        arr[i].pid = entries[i].pid;
        std::strncpy(arr[i].name, entries[i].name.c_str(),
                     sizeof(arr[i].name) - 1);
        arr[i].name[sizeof(arr[i].name) - 1] = '\0';
    }

    *out_apps  = arr;
    *out_count = static_cast<uint32_t>(entries.size());
    return 0;
}

void stream_audio_free_apps(struct stream_audio_app_info* apps)
{
    std::free(apps);
}

void* stream_audio_create(
    const struct stream_audio_config* cfg,
    opus_packet_cb                    opus_cb,
    pcm_frame_cb                      pcm_cb,
    void*                             user)
{
    if (!cfg) return nullptr;
    if (cfg->sample_rate != STREAM_AUDIO_SAMPLE_RATE) return nullptr;
    if (cfg->channels != 1 && cfg->channels != 2)     return nullptr;

    auto* ctx = new (std::nothrow) StreamAudioCtx {};
    if (!ctx) return nullptr;

    ctx->config  = *cfg;
    ctx->opus_cb = opus_cb;
    ctx->pcm_cb  = pcm_cb;
    ctx->user    = user;

#ifndef STREAM_AUDIO_NO_OPUS
    /* ── Opus encoder ─────────────────────────────────────────────────────── */
    ctx->opus_enc = opus_encoder_create(
        STREAM_AUDIO_SAMPLE_RATE,
        static_cast<int>(cfg->channels),
        OPUS_APPLICATION_AUDIO,
        &ctx->opus_err);

    if (ctx->opus_err != OPUS_OK || !ctx->opus_enc) {
        delete ctx;
        return nullptr;
    }

    const opus_int32 bitrate = cfg->bitrate
                             ? static_cast<opus_int32>(cfg->bitrate)
                             : 96000;

    opus_encoder_ctl(ctx->opus_enc, OPUS_SET_BITRATE(bitrate));
    opus_encoder_ctl(ctx->opus_enc, OPUS_SET_VBR(1));
    opus_encoder_ctl(ctx->opus_enc, OPUS_SET_INBAND_FEC(1));
    opus_encoder_ctl(ctx->opus_enc, OPUS_SET_PACKET_LOSS_PERC(10));
    opus_encoder_ctl(ctx->opus_enc, OPUS_SET_SIGNAL(OPUS_SIGNAL_MUSIC));
    opus_encoder_ctl(ctx->opus_enc, OPUS_SET_COMPLEXITY(5));
#endif

    /* ── Platform backend ─────────────────────────────────────────────────── */
#if defined(PLATFORM_WINDOWS)
    ctx->backend = std::make_unique<WASAPICapture>();
#elif defined(PLATFORM_MACOS)
    ctx->backend = std::make_unique<CoreAudioCapture>();
#elif defined(PLATFORM_LINUX)
    ctx->backend = std::make_unique<PipeWireCapture>();
#endif

    return ctx;
}

int stream_audio_start(void* handle)
{
    if (!handle) return -1;
    auto* ctx = static_cast<StreamAudioCtx*>(handle);
    if (!ctx->backend) return -1;

    ctx->capture_ring.reset();
    ctx->poll_ring.reset();
    ctx->running.store(true, std::memory_order_release);

    /* Processing thread must be running before backend starts pushing data. */
    ctx->proc_thread = std::thread(processing_thread_fn, ctx);

    const int rc = ctx->backend->start(
        &ctx->capture_ring,
        ctx->config.target_pid,
        ctx->config.channels);

    if (rc != 0) {
        ctx->running.store(false, std::memory_order_release);
        if (ctx->proc_thread.joinable()) ctx->proc_thread.join();
        return rc;
    }

    return 0;
}

int stream_audio_stop(void* handle)
{
    if (!handle) return -1;
    auto* ctx = static_cast<StreamAudioCtx*>(handle);

    if (ctx->backend) ctx->backend->stop();

    ctx->running.store(false, std::memory_order_release);
    if (ctx->proc_thread.joinable()) ctx->proc_thread.join();

    return 0;
}

void stream_audio_destroy(void* handle)
{
    if (!handle) return;
    auto* ctx = static_cast<StreamAudioCtx*>(handle);

    stream_audio_stop(handle);

#ifndef STREAM_AUDIO_NO_OPUS
    if (ctx->opus_enc) {
        opus_encoder_destroy(ctx->opus_enc);
        ctx->opus_enc = nullptr;
    }
#endif

    delete ctx;
}

size_t stream_audio_poll_pcm(void* handle, float* out_buf, size_t max_floats)
{
    if (!handle || !out_buf || max_floats == 0) return 0;
    auto* ctx = static_cast<StreamAudioCtx*>(handle);
    return ctx->poll_ring.pop(out_buf, max_floats);
}

} /* extern "C" */
