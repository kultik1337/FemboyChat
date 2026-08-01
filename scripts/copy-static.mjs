// Копирует файлы, которые не проходят через сборщик, но должны лежать
// в корне сайта по точному адресу: браузер ищет sw.js и манифест
// только там — с хешем в имени они перестают работать.
//
// Раньше тут был `cp` в строке сборки. На Linux у Cloudflare это работало,
// а в PowerShell — нет, и десктопная сборка падала сразу после vite.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dist = join(root, 'dist')

const FILES = ['icon.png', 'manifest.webmanifest', 'sw.js']

if (!existsSync(dist)) mkdirSync(dist, { recursive: true })

for (const name of FILES) {
  const from = join(root, name)
  if (!existsSync(from)) {
    console.error(`\u2716 нет файла ${name} в корне проекта`)
    process.exit(1)
  }
  copyFileSync(from, join(dist, name))
}

console.log(`\u2713 в dist скопировано: ${FILES.join(', ')}`)
