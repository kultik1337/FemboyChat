/*
  Значок для своего установщика (см. scripts/installer-nsi.mjs).

  Сначала здесь рисовался большой фон на всё окно установщика. Идея
  провалилась по двум причинам. Первая: NSIS показывает BMP как есть, без
  масштабирования, и картинка обрезалась по-живому. Вторая: в Windows созданный
  раньше контрол лежит ВЫШЕ остальных, так что картинка на всё окно просто
  закрыла собой весь текст и кнопки.

  Поэтому фон теперь просто заливка цветом самого диалога, а картинкой
  остаётся один значок 64x64. Фон в нём впечатан тем же цветом, что и диалог:
  BMP не умеет прозрачности, зато так шов не виден.

  Кодировщик BMP свой: sharp умеет всё, кроме BMP, а формат настолько
  простой, что тащить ради него ещё одну библиотеку глупо.
*/

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const logoPath = resolve(root, 'icon.png')
const outDir = resolve(root, 'src-tauri', 'installer')

// Цвет должен совпадать с C_DARK в scripts/installer-nsi.mjs.
const BG = { r: 0x0f, g: 0x10, b: 0x17 }
const SIZE = 64

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

const { data } = await sharp({
  create: { width: SIZE, height: SIZE, channels: 3, background: BG },
})
  .composite([
    {
      input: await sharp(logoPath)
        .resize(SIZE, SIZE, { fit: 'contain', background: { ...BG, alpha: 1 } })
        .png()
        .toBuffer(),
      top: 0,
      left: 0,
    },
  ])
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

mkdirSync(outDir, { recursive: true })
writeFileSync(resolve(outDir, 'logo.bmp'), encodeBmp24(data, SIZE, SIZE))

console.log(`\u2713 значок установщика: logo.bmp ${SIZE}x${SIZE}`)
