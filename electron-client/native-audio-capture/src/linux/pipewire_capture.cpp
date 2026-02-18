#ifdef PLATFORM_LINUX
/*
 * pipewire_capture.cpp — PipeWire loopback capture implementation.
 *
 * System audio:
 *   Connects to the monitor of the default sink (@DEFAULT_SINK@.monitor).
 *   This is equivalent to WASAPI loopback — it captures the mixed audio
 *   that is being sent to the speakers, with no virtual driver required.
 *
 * Per-process audio (Phase 2 roadmap):
 *   Enumerate PipeWire nodes via pw_registry.
 *   Match by node.props["application.process.id"] == target_pid.
 *   Connect stream to that specific node ID instead of PW_ID_ANY.
 *
 * Real-time rules enforced in on_process():
 *   ❌ No malloc / free
 *   ❌ No mutex acquire
 *   ✅ Ring buffer push only
 */

#include "pipewire_capture.h"
#include <spa/param/audio/format-utils.h>
#include <spa/utils/result.h>
#include <cstdio>
#include <cstring>

/* ── Static stream event vtable ───────────────────────────────────────────── */

const pw_stream_events PipeWireCapture::kStreamEvents = {
    .version       = PW_VERSION_STREAM_EVENTS,
    .process       = PipeWireCapture::on_process,
    .state_changed = PipeWireCapture::on_state_changed,
};

/* ── Constructor / Destructor ─────────────────────────────────────────────── */

PipeWireCapture::PipeWireCapture()
{
    pw_init(nullptr, nullptr);
}

PipeWireCapture::~PipeWireCapture()
{
    stop();
}

/* ── start() ──────────────────────────────────────────────────────────────── */

int PipeWireCapture::start(
    SPSCRingBuffer<float, kCaptureBufSize>* ring,
    uint32_t target_pid,
    uint8_t  channels)
{
    ring_          = ring;
    want_channels_ = channels ? channels : 2;
    target_pid_    = target_pid;

    loop_ = pw_main_loop_new(nullptr);
    if (!loop_) return -1;

    ctx_ = pw_context_new(pw_main_loop_get_loop(loop_), nullptr, 0);
    if (!ctx_) return -1;

    core_ = pw_context_connect(ctx_, nullptr, 0);
    if (!core_) return -1;

    /* Properties: identify ourselves and request screen-capture media role. */
    pw_properties* props = pw_properties_new(
        PW_KEY_MEDIA_TYPE,     "Audio",
        PW_KEY_MEDIA_CATEGORY, "Capture",
        PW_KEY_MEDIA_ROLE,     "Screen",
        PW_KEY_APP_NAME,       "electron-audio-capture",
        nullptr);

    stream_ = pw_stream_new(core_, "electron-audio-capture", props);
    if (!stream_) return -1;

    /* Negotiate format: float32 interleaved at 48 kHz. */
    uint8_t           param_buf[1024];
    spa_pod_builder  b = SPA_POD_BUILDER_INIT(param_buf, sizeof(param_buf));

    spa_audio_info_raw audio_info {};
    audio_info.format   = SPA_AUDIO_FORMAT_F32;
    audio_info.rate     = 48000;
    audio_info.channels = want_channels_;

    const spa_pod* params[1];
    params[0] = spa_format_audio_raw_build(&b, SPA_PARAM_EnumFormat, &audio_info);

    pw_stream_add_listener(stream_, nullptr, &kStreamEvents, this);

    /*
     * target_id:
     *   PW_ID_ANY   → let PipeWire auto-connect to @DEFAULT_SINK@.monitor
     *   specific ID → per-process (Phase 2: resolve PID → node ID via registry)
     */
    const uint32_t target_id = PW_ID_ANY;

    const int rc = pw_stream_connect(
        stream_,
        PW_DIRECTION_INPUT,
        target_id,
        static_cast<pw_stream_flags>(
            PW_STREAM_FLAG_AUTOCONNECT |
            PW_STREAM_FLAG_MAP_BUFFERS |
            PW_STREAM_FLAG_RT_PROCESS),
        params, 1);

    if (rc < 0) return -1;

    running_.store(true, std::memory_order_release);

    /* Run the PipeWire event loop in a dedicated thread. */
    loop_thread_ = std::thread([this] {
        pw_main_loop_run(loop_);
    });

    return 0;
}

/* ── stop() ───────────────────────────────────────────────────────────────── */

void PipeWireCapture::stop()
{
    if (!running_.exchange(false)) return;

    if (loop_) pw_main_loop_quit(loop_);
    if (loop_thread_.joinable()) loop_thread_.join();

    if (stream_) { pw_stream_destroy(stream_); stream_ = nullptr; }
    if (core_)   { pw_core_disconnect(core_);  core_   = nullptr; }
    if (ctx_)    { pw_context_destroy(ctx_);   ctx_    = nullptr; }
    if (loop_)   { pw_main_loop_destroy(loop_); loop_  = nullptr; }
}

/* ── PipeWire process callback (RT thread) ────────────────────────────────── */

void PipeWireCapture::on_process(void* userdata)
{
    auto* self = static_cast<PipeWireCapture*>(userdata);

    pw_buffer* pwbuf = pw_stream_dequeue_buffer(self->stream_);
    if (!pwbuf) return;

    spa_buffer* spabuf = pwbuf->buffer;
    if (!spabuf->datas[0].data) {
        pw_stream_queue_buffer(self->stream_, pwbuf);
        return;
    }

    const float*   data   = static_cast<const float*>(spabuf->datas[0].data);
    const uint32_t size   = spabuf->datas[0].chunk->size;
    const uint32_t floats = size / sizeof(float);

    /* ❌ No allocs, ❌ no locks — ring buffer push only. */
    self->ring_->push(data, floats);

    pw_stream_queue_buffer(self->stream_, pwbuf);
}

/* ── State change callback ────────────────────────────────────────────────── */

void PipeWireCapture::on_state_changed(
    void*           /*data*/,
    pw_stream_state /*old*/,
    pw_stream_state state,
    const char*     error)
{
    if (state == PW_STREAM_STATE_ERROR && error)
        fprintf(stderr, "[PipeWire] stream error: %s\n", error);
}

/* ── Application listing ──────────────────────────────────────────────────── */

std::vector<AudioAppEntry> PipeWireCapture::list_apps()
{
    /*
     * Phase 2: enumerate PipeWire nodes via pw_registry_add_listener,
     * filter by media.class == "Stream/Output/Audio",
     * extract application.process.id and application.name properties.
     *
     * For now, return empty list.  System loopback via on_process() captures
     * all application audio without per-process selection.
     */
    return {};
}

#endif /* PLATFORM_LINUX */
