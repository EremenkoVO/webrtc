import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

async function createIcon(size, outputPath) {
  const svgPath = join(__dirname, '..', 'public', 'pwa-icon.svg')
  const svgBuffer = readFileSync(svgPath)
  
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(outputPath)
  
  console.log(`Created ${outputPath}`)
}

const publicDir = join(__dirname, '..', 'public')
await createIcon(192, join(publicDir, 'pwa-192x192.png'))
await createIcon(512, join(publicDir, 'pwa-512x512.png'))
