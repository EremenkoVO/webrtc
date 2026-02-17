# Настройка Native Audio Capture Module

## Требования

### Общие
- Rust 1.70+ ([установка](https://www.rust-lang.org/tools/install))
- Node.js 18+
- npm или yarn

### Платформо-специфичные

#### Windows
- Visual Studio Build Tools или Visual Studio с C++ компонентами
- Windows SDK

#### macOS
- Xcode Command Line Tools: `xcode-select --install`
- Для macOS 13+: ScreenCaptureKit доступен из коробки
- Для старых версий: установить BlackHole или Loopback драйвер

#### Linux
- PulseAudio или PipeWire
- Разработческие библиотеки:
  ```bash
  # Ubuntu/Debian
  sudo apt-get install libpulse-dev
  
  # Fedora
  sudo dnf install pulseaudio-libs-devel
  ```

## Установка

1. **Установить Rust**:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

2. **Установить зависимости проекта**:
   ```bash
   cd native-audio-capture
   npm install
   ```

3. **Собрать модуль**:
   ```bash
   npm run build
   ```

   Это создаст файл `target/release/native_audio_capture.node` (или `.dll` на Windows, `.so` на Linux)

## Интеграция с Electron

1. **Добавить в main.ts**:
   ```typescript
   import { AudioCapture } from '../native-audio-capture';
   ```

2. **Настроить IPC handlers** (см. `electron-integration.ts`)

3. **Добавить в electron-builder конфигурацию**:
   ```json
   {
     "build": {
       "extraResources": [
         {
           "from": "native-audio-capture/target/release/",
           "to": "native-modules/",
           "filter": ["*.node", "*.dll", "*.so", "*.dylib"]
         }
       ]
     }
   }
   ```

## Тестирование

```bash
# Запустить тесты Rust
cargo test

# Запустить Electron приложение
cd ..
npm run electron:dev
```

## Отладка

### Проверка сборки модуля

```bash
cd native-audio-capture
node -e "const mod = require('./target/release/native_audio_capture.node'); console.log(mod);"
```

### Логи

Модуль выводит логи в консоль Electron. Для отладки используйте:
- `console.log` в Rust коде
- DevTools в Electron для просмотра IPC сообщений

## Альтернативные подходы

Если нативный модуль не подходит, можно использовать:

1. **Windows**: `node-record` (использует SoX)
2. **macOS**: Виртуальный драйвер + `getUserMedia`
3. **Linux**: `pulseaudio-ctl` через child_process

Но эти подходы менее эффективны и имеют больше ограничений.
