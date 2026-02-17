# Native Audio Capture Module

Нативный модуль для захвата аудио из конкретных приложений в Electron.

## Архитектура

Модуль реализован на Rust с использованием `napi-rs` для интеграции с Node.js/Electron.

### Платформы

- **Windows**: WASAPI (IAudioSessionManager2) - захват по PID процесса
- **macOS**: ScreenCaptureKit (macOS 13+) или виртуальный драйвер (BlackHole/Loopback)
- **Linux**: PulseAudio/PipeWire - захват через sink-input

## Структура проекта

```
native-audio-capture/
├── Cargo.toml          # Rust зависимости
├── src/
│   ├── lib.rs          # Основной модуль
│   ├── windows.rs      # Windows WASAPI реализация
│   ├── macos.rs        # macOS ScreenCaptureKit реализация
│   └── linux.rs        # Linux PulseAudio реализация
├── build.rs            # Build скрипт
└── binding.gyp         # Node.js binding конфигурация
```

## API

```typescript
interface AudioCaptureModule {
  // Получить список запущенных приложений с аудио
  getAudioApplications(): Promise<AudioApplication[]>;
  
  // Начать захват аудио из приложения
  startCapture(pid: number): Promise<void>;
  
  // Остановить захват
  stopCapture(): Promise<void>;
  
  // Получить аудио данные (PCM Float32, 48kHz)
  getAudioData(): Float32Array;
  
  // События через EventEmitter
  on(event: 'data', callback: (data: Float32Array) => void): void;
  on(event: 'error', callback: (error: Error) => void): void;
}

interface AudioApplication {
  pid: number;
  name: string;
  icon?: string;
}
```

## Использование

```typescript
import { AudioCapture } from './native-audio-capture';

const capture = new AudioCapture();

// Получить список приложений
const apps = await capture.getAudioApplications();

// Начать захват
await capture.startCapture(apps[0].pid);

// Подписаться на данные
capture.on('data', (audioData: Float32Array) => {
  // Конвертировать в MediaStreamTrack и отправить через WebRTC
});
```

## Сборка

```bash
cd native-audio-capture
npm install
npm run build
```

После сборки модуль будет находиться в `build/Release/native_audio_capture.node`

**Примечание**: На macOS модуль компилируется как `.dylib`, но автоматически копируется в `.node` файл для использования в Node.js/Electron.

## Зависимости

- Rust 1.70+
- node-addon-api или napi-rs
- Платформо-специфичные библиотеки (см. Cargo.toml)
