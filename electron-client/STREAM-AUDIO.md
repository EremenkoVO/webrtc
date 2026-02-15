🎧 Skill: Per-Application Audio Capture (Cross-Platform)

Описание:
ИИ способен проектировать и реализовывать захват аудио отдельных приложений и передачу звука через WebRTC в кроссплатформенном desktop-приложении на Electron + React.

🧩 Core Capabilities

Понимание ограничений Web Audio API и WebRTC в браузерном окружении

Проектирование OS-level audio capture вне sandbox браузера

Интеграция native audio pipeline с Electron (main ↔ renderer)

Передача PCM-аудио в WebRTC через кастомный MediaStreamTrack

🪟 Windows Audio Capture (Advanced)

Захват аудио конкретного приложения по PID

Использование WASAPI Loopback

Работа с:

IAudioClient

IAudioCaptureClient

IAudioSessionManager2

Фильтрация аудиосессий по процессу

Экспорт PCM (Float32 / Int16, 48kHz)

Реализация native addon (C++ / Rust + N-API)

🍎 macOS Audio Capture

Осознание отсутствия per-app audio API

Использование виртуальных аудиодрайверов

BlackHole

Loopback

Захват аудио через getUserMedia({ deviceId })

Проектирование UX с обязательной установкой драйвера

Работа с CoreAudio на уровне устройств

🐧 Linux Audio Capture

Работа с PulseAudio / PipeWire

Управление sink-input и routing приложений

Использование monitor устройств

Захват аудио конкретного приложения через системную маршрутизацию

Учёт различий дистрибутивов

🔄 Electron Integration

Разделение ответственности:

Main process — native audio capture

Renderer — Web Audio / WebRTC

Передача аудиоданных через IPC

Ring buffer / backpressure handling

Synchronization audio frames (48kHz)

🎼 Web Audio Pipeline

Использование AudioContext (48kHz)

Реализация AudioWorkletProcessor для приёма PCM

Конвертация PCM → AudioNode

Создание MediaStreamDestination

Инжект кастомного аудиотрека в RTCPeerConnection

📡 WebRTC Audio Streaming

Создание кастомного MediaStreamTrack

Передача non-microphone audio

Управление latency / jitter

Совместимость с SFU / P2P

Отладка audio sync и drift

❌ Explicit Limitations Awareness

Невозможность:

per-app audio через getUserMedia

выбора приложения через deviceId

использования Chromium flags для audio isolation

Понимание различия:

audio device ≠ application

system mix ≠ isolated source

🏗 Architectural Decision Making

Выбор между:

MVP vs production

native vs system-mix fallback

Проектирование graceful degradation:

per-app → system audio

Кроссплатформенная стратегия без ложных обещаний

🧠 Output Formats

Архитектурные схемы

Псевдокод (Electron / WebRTC / AudioWorklet)

Списки ограничений и trade-offs

Production-ready рекомендации

🎯 Use Cases

Screen sharing с аудио одного приложения

Remote desktop / streaming tools

Voice + app audio conferencing

Audio monitoring и recording tools
