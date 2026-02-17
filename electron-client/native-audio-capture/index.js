const { existsSync } = require('fs');
const { join } = require('path');

// Путь к скомпилированному модулю
const modulePath = join(__dirname, 'build', 'Release', 'native_audio_capture.node');

// Fallback на прямую сборку если build/Release не существует
const fallbackPath = (() => {
  const platform = process.platform;
  let extension = '.so';
  if (platform === 'darwin') {
    extension = '.dylib';
  } else if (platform === 'win32') {
    extension = '.dll';
  }
  return join(__dirname, 'target', 'release', `libnative_audio_capture${extension}`);
})();

let nativeModule = null;

console.log('[NativeAudioCapture] Attempting to load module...');
console.log('[NativeAudioCapture] Module path:', modulePath);
console.log('[NativeAudioCapture] Fallback path:', fallbackPath);
console.log('[NativeAudioCapture] Module path exists:', existsSync(modulePath));
console.log('[NativeAudioCapture] Fallback path exists:', existsSync(fallbackPath));

try {
  if (existsSync(modulePath)) {
    console.log('[NativeAudioCapture] Loading from module path:', modulePath);
    nativeModule = require(modulePath);
    console.log('[NativeAudioCapture] ✓ Module loaded successfully from:', modulePath);
  } else if (existsSync(fallbackPath)) {
    // Пробуем загрузить напрямую из target/release (для разработки)
    console.log('[NativeAudioCapture] Loading from fallback path:', fallbackPath);
    nativeModule = require(fallbackPath);
    console.log('[NativeAudioCapture] ✓ Module loaded successfully from:', fallbackPath);
  } else {
    console.warn('[NativeAudioCapture] ✗ Module not found at either path. Run "npm run build" in native-audio-capture directory first.');
    console.warn('[NativeAudioCapture] Expected paths:');
    console.warn('[NativeAudioCapture]   -', modulePath);
    console.warn('[NativeAudioCapture]   -', fallbackPath);
  }
} catch (error) {
  console.error('[NativeAudioCapture] ✗ Failed to load native audio capture module:', error.message);
  console.error('[NativeAudioCapture] Error stack:', error.stack);
  // Модуль будет null, приложение продолжит работу без него
}

// Экспортируем модуль и класс AudioCapture для удобства
if (nativeModule) {
  console.log('[NativeAudioCapture] Module loaded, keys:', Object.keys(nativeModule));
  console.log('[NativeAudioCapture] Module has AudioCapture:', !!nativeModule.AudioCapture);
  console.log('[NativeAudioCapture] Module type:', typeof nativeModule);
  
  // napi-rs экспортирует классы напрямую
  module.exports = nativeModule;
  // Если модуль экспортирует класс AudioCapture, используем его, иначе сам модуль
  if (nativeModule.AudioCapture) {
    console.log('[NativeAudioCapture] Using AudioCapture from module.AudioCapture');
    module.exports.AudioCapture = nativeModule.AudioCapture;
  } else {
    console.log('[NativeAudioCapture] Using module itself as AudioCapture');
    module.exports.AudioCapture = nativeModule;
  }
  
  console.log('[NativeAudioCapture] Final exports:', {
    hasAudioCapture: !!module.exports.AudioCapture,
    audioCaptureType: typeof module.exports.AudioCapture,
    isConstructor: typeof module.exports.AudioCapture === 'function',
  });
} else {
  console.warn('[NativeAudioCapture] ✗ Module is null, exporting null');
  module.exports = null;
}
