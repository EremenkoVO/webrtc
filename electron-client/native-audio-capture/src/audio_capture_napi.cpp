/*
 * audio_capture_napi.cpp — N-API (node-addon-api) binding for stream_audio.
 *
 * Exports a single class:  AudioCapture
 *
 *   new AudioCapture()
 *   audioCapture.getAudioApplications()  → Promise<{pid,name}[]>
 *   audioCapture.startCapture(pid)        → Promise<void>
 *   audioCapture.stopCapture()            → Promise<void>
 *   audioCapture.getAllAudioData()         → Promise<number[]>
 *
 * All methods return Promises so that main.ts can use them with await.
 *
 * Blocking operations (OS API calls, ring buffer drain) are offloaded to
 * libuv thread-pool workers via Napi::AsyncWorker to keep the Node.js
 * event loop responsive.
 */

#include <napi.h>
#include "stream_audio.h"
#include <cstring>
#include <vector>

/* ── AsyncWorker: list_apps ───────────────────────────────────────────────── */

class ListAppsWorker : public Napi::AsyncWorker {
    Napi::Promise::Deferred deferred_;
    stream_audio_app_info*  apps_  = nullptr;
    uint32_t                count_ = 0;
    bool                    ok_    = false;

public:
    explicit ListAppsWorker(Napi::Env env)
        : Napi::AsyncWorker(env)
        , deferred_(Napi::Promise::Deferred::New(env)) {}

    Napi::Promise GetPromise() { return deferred_.Promise(); }

    /* Runs on libuv thread-pool — no Node.js / V8 access. */
    void Execute() override {
        ok_ = (stream_audio_list_apps(&apps_, &count_) == 0);
    }

    /* Runs on main Node.js thread — V8 access allowed. */
    void OnOK() override {
        Napi::Env env = Env();
        auto arr = Napi::Array::New(env, count_);
        for (uint32_t i = 0; i < count_; ++i) {
            auto obj = Napi::Object::New(env);
            obj.Set("pid",  Napi::Number::New(env, apps_[i].pid));
            obj.Set("name", Napi::String::New(env, apps_[i].name));
            arr.Set(i, obj);
        }
        if (apps_) {
            stream_audio_free_apps(apps_);
            apps_ = nullptr;
        }
        deferred_.Resolve(arr);
    }

    void OnError(const Napi::Error& e) override {
        if (apps_) { stream_audio_free_apps(apps_); apps_ = nullptr; }
        deferred_.Reject(e.Value());
    }
};

/* ── AsyncWorker: drain PCM ring buffer ───────────────────────────────────── */

class GetAudioDataWorker : public Napi::AsyncWorker {
    Napi::Promise::Deferred deferred_;
    void*              ctx_;
    std::vector<float> samples_;

public:
    GetAudioDataWorker(Napi::Env env, void* ctx)
        : Napi::AsyncWorker(env)
        , deferred_(Napi::Promise::Deferred::New(env))
        , ctx_(ctx) {}

    Napi::Promise GetPromise() { return deferred_.Promise(); }

    void Execute() override {
        /*
         * Drain up to ~340 ms worth of stereo 48 kHz audio per call.
         * The JS polling interval is 10 ms so this buffer is intentionally
         * much larger than a single polling window to handle burst catch-up.
         */
        constexpr std::size_t MAX_FLOATS = 65536;
        samples_.resize(MAX_FLOATS, 0.f);
        const std::size_t got = stream_audio_poll_pcm(ctx_,
                                                       samples_.data(),
                                                       MAX_FLOATS);
        samples_.resize(got);
    }

    void OnOK() override {
        Napi::Env env = Env();
        if (samples_.empty()) {
            /* Return empty array — main.ts checks audioData.length > 0 */
            deferred_.Resolve(Napi::Array::New(env, 0));
            return;
        }
        /*
         * Return a plain JS Array of numbers.
         * main.ts sends it via IPC as-is; preload reconstructs Float32Array:
         *   new Float32Array(data)
         * A plain Array is used rather than a typed array to match the
         * existing IPC contract without changes to preload.ts.
         */
        auto arr = Napi::Array::New(env, samples_.size());
        for (std::size_t i = 0; i < samples_.size(); ++i) {
            arr.Set(static_cast<uint32_t>(i),
                    Napi::Number::New(env, samples_[i]));
        }
        deferred_.Resolve(arr);
    }

    void OnError(const Napi::Error& e) override {
        deferred_.Reject(e.Value());
    }
};

/* ── AudioCapture class ───────────────────────────────────────────────────── */

class AudioCaptureWrapper : public Napi::ObjectWrap<AudioCaptureWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function ctor = DefineClass(env, "AudioCapture", {
            InstanceMethod<&AudioCaptureWrapper::GetAudioApplications>(
                "getAudioApplications"),
            InstanceMethod<&AudioCaptureWrapper::StartCapture>(
                "startCapture"),
            InstanceMethod<&AudioCaptureWrapper::StopCapture>(
                "stopCapture"),
            InstanceMethod<&AudioCaptureWrapper::GetAllAudioData>(
                "getAllAudioData"),
        });
        exports.Set("AudioCapture", ctor);
        return exports;
    }

    explicit AudioCaptureWrapper(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<AudioCaptureWrapper>(info)
        , ctx_(nullptr) {}

    ~AudioCaptureWrapper() override {
        cleanup();
    }

private:
    void* ctx_ = nullptr;

    void cleanup() {
        if (ctx_) {
            stream_audio_destroy(ctx_);
            ctx_ = nullptr;
        }
    }

    /* ── getAudioApplications() ─────────────────────────────────────────── */

    Napi::Value GetAudioApplications(const Napi::CallbackInfo& info) {
        auto* w = new ListAppsWorker(info.Env());
        w->Queue();
        return w->GetPromise();
    }

    /* ── startCapture(pid) ──────────────────────────────────────────────── */

    Napi::Value StartCapture(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        auto deferred = Napi::Promise::Deferred::New(env);

        if (info.Length() < 1 || !info[0].IsNumber()) {
            deferred.Reject(
                Napi::TypeError::New(env, "startCapture(pid): pid must be a number")
                    .Value());
            return deferred.Promise();
        }

        const uint32_t pid = info[0].As<Napi::Number>().Uint32Value();

        /* Stop any previous capture session before starting a new one. */
        cleanup();

        stream_audio_config cfg {};
        cfg.sample_rate = 48000;
        cfg.channels    = 2;
        cfg.bitrate     = 96000;
        cfg.target_pid  = pid;

        ctx_ = stream_audio_create(&cfg, nullptr, nullptr, nullptr);
        if (!ctx_) {
            deferred.Reject(
                Napi::Error::New(env, "stream_audio_create() failed — "
                    "check that the audio backend is supported on this platform")
                    .Value());
            return deferred.Promise();
        }

        const int rc = stream_audio_start(ctx_);
        if (rc != 0) {
            cleanup();
            deferred.Reject(
                Napi::Error::New(env,
                    "stream_audio_start() failed — "
                    "check OS audio permissions and backend availability")
                    .Value());
            return deferred.Promise();
        }

        deferred.Resolve(env.Undefined());
        return deferred.Promise();
    }

    /* ── stopCapture() ──────────────────────────────────────────────────── */

    Napi::Value StopCapture(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        auto deferred = Napi::Promise::Deferred::New(env);
        cleanup();
        deferred.Resolve(env.Undefined());
        return deferred.Promise();
    }

    /* ── getAllAudioData() ───────────────────────────────────────────────── */

    Napi::Value GetAllAudioData(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (!ctx_) {
            auto deferred = Napi::Promise::Deferred::New(env);
            deferred.Resolve(Napi::Array::New(env, 0));
            return deferred.Promise();
        }

        auto* w = new GetAudioDataWorker(env, ctx_);
        w->Queue();
        return w->GetPromise();
    }
};

/* ── Module registration ──────────────────────────────────────────────────── */

Napi::Object RegisterModule(Napi::Env env, Napi::Object exports)
{
    return AudioCaptureWrapper::Init(env, exports);
}

NODE_API_MODULE(stream_audio, RegisterModule)
