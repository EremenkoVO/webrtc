const { copyFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');

const platform = process.platform;
const arch = process.arch;

// Определяем расширение файла в зависимости от платформы
let extension = '.so';
if (platform === 'darwin') {
  extension = '.dylib';
} else if (platform === 'win32') {
  extension = '.dll';
}

const sourceFile = join(__dirname, '..', 'target', 'release', `libnative_audio_capture${extension}`);
const outputDir = join(__dirname, '..', 'build', 'Release');
const outputFile = join(outputDir, 'native_audio_capture.node');

if (!existsSync(sourceFile)) {
  console.error(`Source file not found: ${sourceFile}`);
  process.exit(1);
}

// Создаем директорию если её нет
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// Копируем и переименовываем файл
try {
  copyFileSync(sourceFile, outputFile);
  console.log(`✓ Copied ${sourceFile} -> ${outputFile}`);
} catch (error) {
  console.error(`Failed to copy module:`, error);
  process.exit(1);
}
