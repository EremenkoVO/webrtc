#ifdef PLATFORM_MACOS
/*
 * coreaudio_capture.cpp — macOS HAL Output AudioUnit input-tap backend.
 *
 * Architecture:
 *   AudioUnit (kAudioUnitSubType_HALOutput)
 *     Input bus  enabled  → taps the output device
 *     Output bus disabled → we are not playing back
 *   Render callback fires when CoreAudio has a new buffer of captured audio.
 *   Callback runs on a real-time CoreAudio thread; no allocs, no locks.
 *
 * Thread-local scratch buffers (declared as thread_local static inside the
 * callback) avoid heap allocation in the RT path while remaining async-safe.
 */

#include "coreaudio_capture.h"
#include <AudioToolbox/AudioToolbox.h>
#include <libproc.h>
#include <cstring>

/*
 * kAudioHardwarePropertyProcessObjectList and related properties were added in
 * macOS 14.2 (SDK 14.2).  Define fallback FourCC values so the code compiles
 * on older SDKs; AudioObjectHasProperty() guards the runtime use.
 */
#ifndef kAudioHardwarePropertyProcessObjectList
#  define kAudioHardwarePropertyProcessObjectList 'pobj'
#endif
#ifndef kAudioProcessPropertyPID
#  define kAudioProcessPropertyPID 'ppid'
#endif
#ifndef kAudioProcessPropertyIsRunning
#  define kAudioProcessPropertyIsRunning 'prun'
#endif

CoreAudioCapture::CoreAudioCapture()  = default;

CoreAudioCapture::~CoreAudioCapture()
{
    stop();
    if (audio_unit_) {
        AudioUnitUninitialize(audio_unit_);
        AudioComponentInstanceDispose(audio_unit_);
        audio_unit_ = nullptr;
    }
}

/* ── start() ──────────────────────────────────────────────────────────────── */

int CoreAudioCapture::start(
    SPSCRingBuffer<float, kCaptureBufSize>* ring,
    uint32_t /*target_pid*/,
    uint8_t  channels)
{
    ring_          = ring;
    want_channels_ = channels ? channels : 2;

    /* ── Find default output device ───────────────────────────────────────── */
    AudioObjectPropertyAddress pa {
        kAudioHardwarePropertyDefaultOutputDevice,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
    };
    UInt32 size = sizeof(AudioDeviceID);
    OSStatus err = AudioObjectGetPropertyData(
        kAudioObjectSystemObject, &pa, 0, nullptr, &size, &device_id_);
    if (err != noErr) return -1;

    /* ── Create HAL Output AudioUnit ──────────────────────────────────────── */
    AudioComponentDescription desc {};
    desc.componentType         = kAudioUnitType_Output;
    desc.componentSubType      = kAudioUnitSubType_HALOutput;
    desc.componentManufacturer = kAudioUnitManufacturer_Apple;

    AudioComponent comp = AudioComponentFindNext(nullptr, &desc);
    if (!comp) return -1;

    err = AudioComponentInstanceNew(comp, &audio_unit_);
    if (err != noErr) return -1;

    /* Enable input bus (bus 1 = hardware input side). */
    UInt32 enable = 1;
    err = AudioUnitSetProperty(audio_unit_,
        kAudioOutputUnitProperty_EnableIO,
        kAudioUnitScope_Input, 1,
        &enable, sizeof(enable));
    if (err != noErr) return -1;

    /* Disable output bus so we don't produce sound. */
    UInt32 disable = 0;
    AudioUnitSetProperty(audio_unit_,
        kAudioOutputUnitProperty_EnableIO,
        kAudioUnitScope_Output, 0,
        &disable, sizeof(disable));

    /* Attach to the chosen device. */
    err = AudioUnitSetProperty(audio_unit_,
        kAudioOutputUnitProperty_CurrentDevice,
        kAudioUnitScope_Global, 0,
        &device_id_, sizeof(device_id_));
    if (err != noErr) return -1;

    /* Request non-interleaved float32 at 48 kHz. */
    AudioStreamBasicDescription fmt {};
    fmt.mSampleRate       = 48000.0;
    fmt.mFormatID         = kAudioFormatLinearPCM;
    fmt.mFormatFlags      = kAudioFormatFlagIsFloat
                          | kAudioFormatFlagsNativeEndian
                          | kAudioFormatFlagIsPacked
                          | kAudioFormatFlagIsNonInterleaved;
    fmt.mBytesPerPacket   = sizeof(float);
    fmt.mFramesPerPacket  = 1;
    fmt.mBytesPerFrame    = sizeof(float);
    fmt.mChannelsPerFrame = want_channels_;
    fmt.mBitsPerChannel   = 32;

    AudioUnitSetProperty(audio_unit_,
        kAudioUnitProperty_StreamFormat,
        kAudioUnitScope_Output, 1,
        &fmt, sizeof(fmt));

    /* Install the render callback. */
    AURenderCallbackStruct cb {};
    cb.inputProc       = CoreAudioCapture::input_callback;
    cb.inputProcRefCon = this;

    err = AudioUnitSetProperty(audio_unit_,
        kAudioOutputUnitProperty_SetInputCallback,
        kAudioUnitScope_Global, 0,
        &cb, sizeof(cb));
    if (err != noErr) return -1;

    err = AudioUnitInitialize(audio_unit_);
    if (err != noErr) return -1;

    running_.store(true, std::memory_order_release);

    err = AudioOutputUnitStart(audio_unit_);
    if (err != noErr) {
        running_.store(false, std::memory_order_release);
        return -1;
    }

    return 0;
}

/* ── stop() ───────────────────────────────────────────────────────────────── */

void CoreAudioCapture::stop()
{
    if (!running_.exchange(false)) return;
    if (audio_unit_) AudioOutputUnitStop(audio_unit_);
}

/* ── Input callback (CoreAudio RT thread) ─────────────────────────────────── */

OSStatus CoreAudioCapture::input_callback(
    void*                       inRefCon,
    AudioUnitRenderActionFlags* ioActionFlags,
    const AudioTimeStamp*       inTimeStamp,
    UInt32                      inBusNumber,
    UInt32                      inNumberFrames,
    AudioBufferList*            /*ioData*/)
{
    auto* self = static_cast<CoreAudioCapture*>(inRefCon);
    if (!self->running_.load(std::memory_order_acquire)) return noErr;

    /* Stack-based scratch buffers — no heap allocation in RT path. */
    constexpr UInt32 MAX_FRAMES = 4096;
    if (inNumberFrames > MAX_FRAMES) return noErr;

    /* CoreAudio uses non-interleaved format, so separate L / R buffers. */
    static thread_local float left_ch [MAX_FRAMES];
    static thread_local float right_ch[MAX_FRAMES];
    /* Interleaved output for the ring buffer push. */
    static thread_local float interleaved[MAX_FRAMES * 2];

    AudioBufferList abl {};
    abl.mNumberBuffers = self->want_channels_;

    abl.mBuffers[0].mNumberChannels = 1;
    abl.mBuffers[0].mDataByteSize   = inNumberFrames * sizeof(float);
    abl.mBuffers[0].mData           = left_ch;

    if (self->want_channels_ >= 2) {
        abl.mBuffers[1].mNumberChannels = 1;
        abl.mBuffers[1].mDataByteSize   = inNumberFrames * sizeof(float);
        abl.mBuffers[1].mData           = right_ch;
    }

    OSStatus err = AudioUnitRender(
        self->audio_unit_,
        ioActionFlags,
        inTimeStamp,
        inBusNumber,
        inNumberFrames,
        &abl);
    if (err != noErr) return noErr;

    /* Interleave channels for the downstream float32 pipeline. */
    const float* L = left_ch;
    const float* R = (self->want_channels_ >= 2) ? right_ch : left_ch;

    for (UInt32 i = 0; i < inNumberFrames; ++i) {
        interleaved[i * 2    ] = L[i];
        interleaved[i * 2 + 1] = R[i];
    }

    /* ❌ No allocs, ❌ no locks — ring buffer push only. */
    self->ring_->push(interleaved, inNumberFrames * 2u);
    return noErr;
}

/* ── Application listing ──────────────────────────────────────────────────── */

std::vector<AudioAppEntry> CoreAudioCapture::list_apps()
{
    /*
     * Uses kAudioHardwarePropertyProcessObjectList (macOS 14.2+) to enumerate
     * processes that currently have active CoreAudio streams.
     * Returns empty on older macOS where the API is unavailable.
     */
    std::vector<AudioAppEntry> result;

    AudioObjectPropertyAddress addr {
        kAudioHardwarePropertyProcessObjectList,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
    };

    /* Runtime guard: graceful no-op on pre-14.2 macOS. */
    if (!AudioObjectHasProperty(kAudioObjectSystemObject, &addr))
        return result;

    UInt32 data_size = 0;
    OSStatus err = AudioObjectGetPropertyDataSize(
        kAudioObjectSystemObject, &addr, 0, nullptr, &data_size);
    if (err != noErr || data_size == 0) return result;

    std::vector<AudioObjectID> proc_objects(data_size / sizeof(AudioObjectID));
    err = AudioObjectGetPropertyData(
        kAudioObjectSystemObject, &addr, 0, nullptr, &data_size,
        proc_objects.data());
    if (err != noErr) return result;

    for (AudioObjectID obj : proc_objects) {

        /* Get PID for this process audio object. */
        AudioObjectPropertyAddress pid_addr {
            kAudioProcessPropertyPID,
            kAudioObjectPropertyScopeGlobal,
            kAudioObjectPropertyElementMain
        };
        pid_t pid = 0;
        UInt32 pid_size = sizeof(pid_t);
        if (AudioObjectGetPropertyData(obj, &pid_addr, 0, nullptr,
                                       &pid_size, &pid) != noErr)
            continue;
        if (pid <= 0) continue;

        /* Skip processes that have no active audio output. */
        AudioObjectPropertyAddress run_addr {
            kAudioProcessPropertyIsRunning,
            kAudioObjectPropertyScopeGlobal,
            kAudioObjectPropertyElementMain
        };
        UInt32 is_running = 0;
        UInt32 run_size   = sizeof(UInt32);
        AudioObjectGetPropertyData(obj, &run_addr, 0, nullptr,
                                   &run_size, &is_running);
        if (!is_running) continue;

        /* Resolve the executable path and extract the basename. */
        char path[PROC_PIDPATHINFO_MAXSIZE] = {};
        if (proc_pidpath(pid, path, sizeof(path)) > 0) {
            const char* base = strrchr(path, '/');
            base = base ? base + 1 : path;
            result.push_back({ static_cast<uint32_t>(pid), std::string(base) });
        } else {
            /* Fallback: use proc_name (shorter, but always available). */
            char name[256] = {};
            proc_name(pid, name, sizeof(name));
            if (name[0] != '\0')
                result.push_back({ static_cast<uint32_t>(pid),
                                   std::string(name) });
        }
    }

    return result;
}

#endif /* PLATFORM_MACOS */
