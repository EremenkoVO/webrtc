# Руководство по реализации Native Audio Capture

## Обзор

Этот модуль предоставляет возможность захватывать аудио из конкретных приложений для передачи через WebRTC.

## Платформо-специфичная реализация

### Windows (WASAPI)

**API**: Windows Audio Session API (WASAPI)

**Основные компоненты**:
- `IMMDeviceEnumerator` - перечисление аудио устройств
- `IAudioSessionManager2` - управление аудио сессиями
- `IAudioSessionControl2` - получение PID процесса
- `IAudioCaptureClient` - захват аудио данных

**Шаги реализации**:
1. Инициализировать COM
2. Получить default audio endpoint (render device)
3. Получить `IAudioSessionManager2`
4. Перечислить все сессии через `GetSessionEnumerator()`
5. Найти сессию по PID через `GetProcessId()`
6. Создать capture client для этой сессии
7. Читать PCM данные через `GetBuffer()`

**Формат данных**: PCM Float32, 48kHz, stereo

### macOS (ScreenCaptureKit)

**API**: ScreenCaptureKit (macOS 13.0+)

**Основные компоненты**:
- `SCShareableContent` - получение списка приложений
- `SCStream` - поток захвата аудио
- `SCStreamOutput` - обработка аудио данных

**Шаги реализации**:
1. Получить список приложений через `SCShareableContent.excludingDesktopWindows(false)`
2. Найти приложение по PID
3. Создать `SCStream` с аудио конфигурацией
4. Подписаться на аудио данные через `SCStreamOutput`
5. Конвертировать в PCM Float32

**Альтернатива для старых версий macOS**:
- Использовать виртуальный аудио драйвер (BlackHole, Loopback)
- Пользователь должен установить драйвер
- Захватывать через `getUserMedia({ deviceId: virtualDeviceId })`

### Linux (PulseAudio/PipeWire)

**API**: PulseAudio или PipeWire

**Основные компоненты**:
- `pa_context` - подключение к PulseAudio
- `pa_context_get_sink_input_info_list` - список sink-input (приложения)
- `pa_stream` - поток для захвата

**Шаги реализации**:
1. Подключиться к PulseAudio через `pa_context_new()`
2. Получить список sink-input через `pa_context_get_sink_input_info_list()`
3. Найти sink-input по `proplist` (application.process.id)
4. Создать monitor source для этого sink-input
5. Захватывать аудио через `pa_stream_readable()`

**PipeWire**:
- Современная альтернатива PulseAudio
- Использует похожий API через libpipewire
- Поддерживает более низкую задержку

## Интеграция с Electron

### Main Process

```typescript
import { AudioCapture } from './native-audio-capture';

const capture = new AudioCapture();

// IPC handler для получения списка приложений
ipcMain.handle('get-audio-applications', async () => {
  return await capture.getAudioApplications();
});

// IPC handler для начала захвата
ipcMain.handle('start-audio-capture', async (_, pid: number) => {
  await capture.startCapture(pid);
  
  // Отправлять аудио данные через IPC в renderer
  capture.on('data', (audioData) => {
    mainWindow.webContents.send('audio-data', audioData);
  });
});
```

### Renderer Process

```typescript
// Получить список приложений
const apps = await window.electronAPI.getAudioApplications();

// Начать захват
await window.electronAPI.startAudioCapture(apps[0].pid);

// Получать аудио данные
ipcRenderer.on('audio-data', (_, audioData: Float32Array) => {
  // Конвертировать в MediaStreamTrack
  const audioContext = new AudioContext({ sampleRate: 48000 });
  const source = audioContext.createBufferSource();
  const buffer = audioContext.createBuffer(2, audioData.length / 2, 48000);
  buffer.copyToChannel(audioData.slice(0, audioData.length / 2), 0);
  buffer.copyToChannel(audioData.slice(audioData.length / 2), 1);
  source.buffer = buffer;
  
  // Создать MediaStreamTrack для WebRTC
  const destination = audioContext.createMediaStreamDestination();
  source.connect(destination);
  source.start();
  
  // Добавить в RTCPeerConnection
  const audioTrack = destination.stream.getAudioTracks()[0];
  peerConnection.addTrack(audioTrack, stream);
});
```

## Сборка и распространение

### Локальная разработка

```bash
cd native-audio-capture
npm install
npm run build
```

### Electron Builder

Добавить в `package.json`:

```json
{
  "build": {
    "extraMetadata": {
      "main": "dist-electron/main.js"
    },
    "extraResources": [
      {
        "from": "native-audio-capture/target/release/",
        "to": "native-modules/",
        "filter": ["*.node"]
      }
    ]
  }
}
```

### Кросс-компиляция

Для Rust используйте `cross`:

```bash
cargo install cross
cross build --target x86_64-pc-windows-msvc  # Windows
cross build --target x86_64-apple-darwin      # macOS
cross build --target x86_64-unknown-linux-gnu # Linux
```

## Тестирование

```bash
cd native-audio-capture
cargo test
npm test
```

## Производительность

- **Задержка**: < 50ms для реального времени
- **CPU**: < 5% для одного потока
- **Память**: ~10MB для буферов
- **Формат**: PCM Float32, 48kHz, stereo (3072 samples/chunk)

## Ограничения

1. **macOS**: Требует macOS 13+ для ScreenCaptureKit или установленный виртуальный драйвер
2. **Windows**: Требует права администратора для некоторых операций
3. **Linux**: Требует PulseAudio или PipeWire
4. **Безопасность**: Нативный код требует доверия пользователя
