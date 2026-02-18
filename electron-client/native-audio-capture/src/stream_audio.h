#pragma once
/*
 * stream_audio.h — Public C ABI for the native audio capture library.
 *
 * Rules:
 *   - No STL or C++ types in this header (C ABI only).
 *   - Memory ownership is explicit; see comments on each function.
 *   - Thread safety is guaranteed internally; callers need no external locks.
 */

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

/* ── Constants ─────────────────────────────────────────────────────────────── */
#define STREAM_AUDIO_SAMPLE_RATE   48000
#define STREAM_AUDIO_FRAME_SAMPLES 960    /* 20 ms @ 48 kHz */

/* ── Configuration ──────────────────────────────────────────────────────────── */
struct stream_audio_config {
    uint32_t sample_rate;   /* must be 48000                        */
    uint8_t  channels;      /* 1 (mono) or 2 (stereo)               */
    uint32_t bitrate;       /* Opus bitrate in bps, e.g. 96000      */
    uint32_t target_pid;    /* 0 = system-audio loopback            */
};

/* ── Callbacks ──────────────────────────────────────────────────────────────── */

/*
 * Opus-encoded packet callback.
 * Invoked from the processing thread.  Must not block or allocate.
 * Ownership of 'data' stays with the library (do not free it).
 */
typedef void (*opus_packet_cb)(
    const uint8_t* data,
    size_t         size,
    uint32_t       timestamp_ms,
    void*          user
);

/*
 * Raw float32 PCM callback.
 * Invoked from the processing thread.  Must not block or allocate.
 * 'samples' is interleaved (L0 R0 L1 R1 …) for stereo.
 * 'frame_count' is the number of mono frames (total floats = frame_count * channels).
 */
typedef void (*pcm_frame_cb)(
    const float* samples,
    size_t       frame_count,
    uint32_t     timestamp_ms,
    void*        user
);

/* ── Application info ───────────────────────────────────────────────────────── */
struct stream_audio_app_info {
    uint32_t pid;
    char     name[256];
};

/*
 * Enumerate processes that are currently outputting audio.
 * On success sets *out_apps and *out_count; caller must free with
 * stream_audio_free_apps().  Returns 0 on success, -1 on error.
 */
int stream_audio_list_apps(
    struct stream_audio_app_info** out_apps,
    uint32_t*                      out_count
);

/* Free the array returned by stream_audio_list_apps(). */
void stream_audio_free_apps(struct stream_audio_app_info* apps);

/* ── Session lifecycle ──────────────────────────────────────────────────────── */

/*
 * Create a capture context.  Either or both callbacks may be NULL.
 * Returns an opaque handle, or NULL on failure.
 */
void* stream_audio_create(
    const struct stream_audio_config* cfg,
    opus_packet_cb                    opus_cb,  /* may be NULL */
    pcm_frame_cb                      pcm_cb,   /* may be NULL */
    void*                             user
);

/* Start the OS capture backend and the processing thread.  Returns 0 on success. */
int  stream_audio_start(void* ctx);

/* Stop capture and join the processing thread.  Returns 0 on success. */
int  stream_audio_stop(void* ctx);

/* Stop (if running) and free all resources.  ctx is invalid after this call. */
void stream_audio_destroy(void* ctx);

/*
 * Polling API — drain up to max_floats interleaved float32 samples into out_buf.
 * Returns the number of floats actually written.
 * Thread-safe: may be called from any thread while capture is running.
 */
size_t stream_audio_poll_pcm(
    void*  ctx,
    float* out_buf,
    size_t max_floats
);

#ifdef __cplusplus
} /* extern "C" */
#endif
