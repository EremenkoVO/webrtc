#pragma once
#ifdef PLATFORM_MACOS
/*
 * coreaudio_capture.h — macOS CoreAudio / HAL Output AudioUnit backend.
 *
 * macOS system-audio note:
 *   macOS does not expose a loopback device natively.  This backend uses an
 *   HAL Output AudioUnit in input-tap mode to capture whatever is currently
 *   playing through the default output device.
 *
 *   For true system-audio loopback users must install a virtual audio driver
 *   (e.g. BlackHole or Loopback).  When such a driver is set as the default
 *   output, this backend will capture its output correctly.
 *
 * Per-process capture:
 *   macOS does not provide a public API for per-process audio capture without
 *   private entitlements.  list_apps() returns an empty list; the UI should
 *   inform the user to use the system loopback route.
 */

#include "../audio_backend.h"
#include <CoreAudio/CoreAudio.h>
#include <AudioUnit/AudioUnit.h>
#include <atomic>

class CoreAudioCapture : public IAudioBackend {
public:
    CoreAudioCapture();
    ~CoreAudioCapture() override;

    int  start(SPSCRingBuffer<float, kCaptureBufSize>* ring,
               uint32_t target_pid,
               uint8_t  channels) override;
    void stop() override;

    std::vector<AudioAppEntry> list_apps() override;

private:
    static OSStatus input_callback(
        void*                       inRefCon,
        AudioUnitRenderActionFlags* ioActionFlags,
        const AudioTimeStamp*       inTimeStamp,
        UInt32                      inBusNumber,
        UInt32                      inNumberFrames,
        AudioBufferList*            ioData);

    AudioUnit     audio_unit_ = nullptr;
    AudioDeviceID device_id_  = kAudioObjectUnknown;

    SPSCRingBuffer<float, kCaptureBufSize>* ring_ = nullptr;
    uint8_t want_channels_ = 2;

    std::atomic<bool> running_ { false };
};

#endif /* PLATFORM_MACOS */
