// Делает из icon.png квадратный icon-square.png 1024×1024.
//
// tauri icon требует строго квадратный источник, а логотип у нас не квадратный.
// Картинка не растягивается и не обрезается — она вписывается целиком в
// прозрачный квадрат, иначе Астольфо будет без головы на панели задач.
//
// sharp лежит в optionalDependencies: он нужен только тому, кто собирает
// десктоп, и если его бинарник не встанет на сервере сборки сайта — сайт
// всё равно соберạтся, потому что этот скрипт в сборке сайта не участвует.

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SIZE = 1024
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = join(root, 'icon.png')
const out = join(root, 'icon-square.png')

if (!existsSync(src)) {
  console.error('\u2716 нет icon.png в корне проекта')
  process.exit(1)
}

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('\u2716 не установлен sharp. Выполни в папке проекта:')
  console.error('   npm install')
  console.error('\u0435сли не помогло:')
  console.error('   npm install --include=optional sharp')
  process.exit(1)
}

const { width = 0, height = 0 } = await sharp(src).metadata()

await sharp(src)
  .resize(SIZE, SIZE, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toFile(out)

console.log(`\u2713 icon-square.png — ${SIZE}\u00d7${SIZE} (было ${width}\u00d7${height})`)
