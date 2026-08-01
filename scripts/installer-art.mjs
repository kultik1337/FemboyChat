/*
  Картинки для установщика Windows.

  NSIS умеет показывать только BMP без сжатия и строго заданного размера:
  164x314 сбоку на первой и последней странице и 150x57 в шапке остальных.
  Если картинки не подсунуть, показывается синяя заготовка из девяностых.

  Держать готовые BMP в репозитории не хочется: это двоичные файлы, которые
  невозможно прочитать в диффе и которые разъедутся с палитрой при первой
  же смене акцента. Поэтому они рисуются здесь из SVG и логотипа перед сборкой.

  Кодировщик BMP свой ручной: sharp умеет что угодно, кроме BMP, а формат
  настолько простой, что тащить ради него ещё одну библиотеку глупо.
*/

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const logoPath = resolve(root, 'icon.png')
const outDir = resolve(root, 'src-tauri', 'installer')

// Те же цвета, что у мессенджера в тёмной теме.
const BG = '#0f1017'
const ACCENT = '#7c9cff'
const ACCENT_2 = '#9d8bff'

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

/** Логотип, вписанный в квадрат с прозрачными полями. */
async function logo(size) {
  return sharp(logoPath)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
}

async function render(svg, width, height, overlays) {
  const { data } = await sharp(Buffer.from(svg))
    .composite(overlays)
    .flatten({ background: BG })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return encodeBmp24(data, width, height)
}

// Боковая картинка приветствия: тёмный фон, акцентное свечение и пара
// силуэтов сообщений — сразу понятно, что ставишь мессенджер.
const SIDEBAR_W = 164
const SIDEBAR_H = 314
const sidebarSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIDEBAR_W}" height="${SIDEBAR_H}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#15162099"/>
      <stop offset="1" stop-color="${BG}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.12" cy="0.05" r="0.9">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="0.95" cy="1" r="0.85">
      <stop offset="0" stop-color="${ACCENT_2}" stop-opacity="0.45"/>
      <stop offset="1" stop-color="${ACCENT_2}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="bubble" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT_2}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="${BG}"/>
  <rect width="100%" height="100%" fill="url(#base)"/>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  <rect width="100%" height="100%" fill="url(#glow2)"/>
  <rect x="22" y="186" width="104" height="26" rx="13" fill="url(#bubble)" opacity="0.92"/>
  <rect x="46" y="220" width="96" height="24" rx="12" fill="#ffffff" opacity="0.10"/>
  <rect x="22" y="252" width="74" height="22" rx="11" fill="#ffffff" opacity="0.07"/>
  <rect x="0" y="${SIDEBAR_H - 3}" width="100%" height="3" fill="url(#bubble)"/>
</svg>`

// Шапка остальных страниц. Места мало, поэтому только значок и полоса.
const HEADER_W = 150
const HEADER_H = 57
const headerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${HEADER_W}" height="${HEADER_H}">
  <defs>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${ACCENT}"/>
      <stop offset="1" stop-color="${ACCENT_2}"/>
    </linearGradient>
    <radialGradient id="hglow" cx="0.2" cy="0.1" r="0.9">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.4"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="${BG}"/>
  <rect width="100%" height="100%" fill="url(#hglow)"/>
  <rect x="58" y="20" width="74" height="7" rx="3.5" fill="#ffffff" opacity="0.16"/>
  <rect x="58" y="32" width="48" height="7" rx="3.5" fill="#ffffff" opacity="0.09"/>
  <rect x="0" y="${HEADER_H - 2}" width="100%" height="2" fill="url(#line)"/>
</svg>`

mkdirSync(outDir, { recursive: true })

const sidebar = await render(sidebarSvg, SIDEBAR_W, SIDEBAR_H, [
  { input: await logo(96), top: 52, left: Math.round((SIDEBAR_W - 96) / 2) },
])
writeFileSync(resolve(outDir, 'sidebar.bmp'), sidebar)

const header = await render(headerSvg, HEADER_W, HEADER_H, [
  { input: await logo(38), top: 10, left: 12 },
])
writeFileSync(resolve(outDir, 'header.bmp'), header)

console.log(`\u2713 графика установщика: sidebar.bmp ${SIDEBAR_W}x${SIDEBAR_H}, header.bmp ${HEADER_W}x${HEADER_H}`)
