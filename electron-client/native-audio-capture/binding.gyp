{
  "includes": [ "config.gypi" ],

  "targets": [{
    "target_name": "stream_audio",

    "sources": [
      "src/stream_audio.cpp",
      "src/audio_capture_napi.cpp"
    ],

    "include_dirs": [
      "<!@(node -p \"require('node-addon-api').include\")",
      "src"
    ],

    "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS=1" ],

    "cflags!":    [ "-fno-exceptions" ],
    "cflags_cc!": [ "-fno-exceptions" ],
    "cflags_cc":  [ "-std=c++17" ],

    "conditions": [

      ["opus_found=='1'", {
        "include_dirs+": [ "<(opus_include)" ],
        "library_dirs+": [ "<(opus_lib)" ],
        "libraries+":    [ "-lopus" ]
      }, {
        "defines+": [ "STREAM_AUDIO_NO_OPUS=1" ]
      }],

      ["OS=='win'", {
        "sources": [ "src/windows/wasapi_capture.cpp" ],
        "defines+": [
          "PLATFORM_WINDOWS",
          "_WIN32_WINNT=0x0A00",
          "WINVER=0x0A00",
          "UNICODE",
          "_UNICODE"
        ],
        "libraries+": [
          "-lole32",
          "-loleaut32",
          "-lksuser",
          "-lpsapi"
        ],
        "msvs_settings": {
          "VCCLCompilerTool": {
            "ExceptionHandling": 1,
            "AdditionalOptions": [ "/std:c++17", "/EHsc" ]
          }
        }
      }],

      ["OS=='mac'", {
        "sources": [ "src/macos/coreaudio_capture.cpp" ],
        "defines+": [ "PLATFORM_MACOS" ],
        "link_settings": {
          "libraries": [
            "-framework CoreAudio",
            "-framework AudioUnit",
            "-framework CoreFoundation",
            "-framework AudioToolbox"
          ]
        },
        "xcode_settings": {
          "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
          "CLANG_CXX_LIBRARY":           "libc++",
          "GCC_ENABLE_CPP_EXCEPTIONS":   "YES"
        }
      }],

      ["OS=='linux'", {
        "sources": [ "src/linux/pipewire_capture.cpp" ],
        "defines+": [ "PLATFORM_LINUX" ],
        "libraries+": [
          "<!@(pkg-config --libs libpipewire-0.3 2>/dev/null || echo '-lpipewire-0.3')"
        ],
        "cflags+": [
          "<!@(pkg-config --cflags libpipewire-0.3 2>/dev/null || echo '')"
        ]
      }]

    ]
  }]
}
