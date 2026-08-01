/*
  Фон для своего установщика (см. scripts/installer-nsi.mjs).

  Раньше здесь рисовались две картинки для шаблона MUI — боковая и шапка.
  Шаблона больше нет, окно рисуем целиком сами, поэтому нужен один большой
  фон на всю клиентскую область. NSIS не умеет тянуть картинку под размер
  контрола, поэтому рисуем с запасом и компонуем всё важное в левом верхнем
  углу: правый край и низ спокойно обрезаются.

  Логотип впечатан в сам фон: BMP не умеет прозрачности, и отдельной
  картинкой он бы выглядел тёмным прямоугольником поверх градиента.
  Координаты логотипа здесь и координаты текста в .nsi живут в одной сетке:
  логотип 72x72 в точке (36, 30), заголовок начинается с x = 126.

  Кодировщик BMP свой: sharp умеет всё, кроме BMP, а формат настолько
  простой, что тащить ради него ещё одну библиотеку глупо.
*/

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const logoPath = resolve(root, 'icon.png')
const outDir = resolve(root, 'src-tauri', 'installer')

const BG = '#0f1017'
const ACCENT = '#7c9cff'
const ACCENT_2 = '#9d8bff'

// Окно установщика около 500x330, берём с запасом на крупный масштаб.
const W = 900
const H = 620

let sharp
try {
  sharp = (await import('sharp')).default
} catch {
  console.error('\u2716 нужен sharp. Запусти: npm install (или npm install --include=optional sharp)')
  process.exit(1)
}

if (!existsSync(logoPath)) {
  console.error('\u2716 не нашёл icon.png в корне проекта')
  process.exit(1)
}

/** 24-битный BMP без сжатия: строки снизу вверх, байты BGR, ряд кратен 4. */
function encodeBmp24(rgb, width, height) {
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const pixelBytes = rowSize * height
  const buf = Buffer.alloc(54 + pixelBytes)

  buf.write('BM', 0, 'ascii')
  buf.writeUInt32LE(54 + pixelBytes, 2)
  buf.writeUInt32LE(54, 10)
  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22)
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(0, 30)
  buf.writeUInt32LE(pixelBytes, 34)
  buf.writeInt32LE(2835, 38)
  buf.writeInt32LE(2835, 42)

  for (let y = 0; y < height; y += 1) {
    const src = y * width * 3
    const dst = 54 + (height - 1 - y) * rowSize
    for (let x = 0; x < width; x += 1) {
      buf[dst + x * 3] = rgb[src + x * 3 + 2]
      buf[dst + x * 3 + 1] = rgb[src + x * 3 + 1]
      buf[dst + x * 3 + 2] = rgb[src + x * 3]
    }
  }

  return buf
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#181a26"/>
      <stop offset="0.55" stop-color="#111320"/>
      <stop offset="1" stop-color="${BG}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.06" cy="0.02" r="0.62">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.42"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.72" cy="0.72" r="0.55">
      <stop offset="0" stop-color="${ACCENT_2}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${ACCENT_2}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="hair" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${ACCENT_2}" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="100%" height="100%" fill="${BG}"/>
  <rect width="100%" height="100%" fill="url(#base)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <rect width="100%" height="100%" fill="url(#glow2)"/>

  <!-- тонкая акцентная линия под шапкой -->
  <rect x="36" y="126" width="420" height="1" fill="url(#hair)"/>

  <!-- силуэты сообщений в свободном углу справа -->
  <rect x="372" y="218" width="96" height="16" rx="8" fill="#ffffff" opacity="0.06"/>
  <rect x="398" y="242" width="70" height="16" rx="8" fill="${ACCENT}" opacity="0.20"/>
  <rect x="372" y="266" width="54" height="16" rx="8" fill="#ffffff" opacity="0.05"/>
</svg>`

const logo = await sharp(logoPath)
  .resize(72, 72, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()

const { data } = await sharp(Buffer.from(svg))
  .composite([{ input: logo, top: 30, left: 36 }])
  .flatten({ background: BG })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

mkdirSync(outDir, { recursive: true })
writeFileSync(resolve(outDir, 'bg.bmp'), encodeBmp24(data, W, H))

console.log(`\u2713 фон установщика: bg.bmp ${W}x${H}`)
