/*
  Копия сценария установщика в корень проекта.

  В tauri.conf.json указано bundle.windows.nsis.template = "installer/installer.nsi".
  Относительные пути в этом поле решаются не от папки с конфигом, а от
  текущей папки, из которой запущен tauri build, то есть от корня проекта.
  Именно поэтому сборка падала с "Не удается найти указанный файл (os error 2)"
  сразу после "Running makensis": сценарий лежал только в src-tauri/installer.

  Поведение отличается между версиями CLI, поэтому просто кладём файл в оба
  места и не угадываем. Обе папки в .gitignore.
*/

import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, 'src-tauri', 'installer', 'installer.nsi')
const dest = resolve(root, 'installer', 'installer.nsi')

if (!existsSync(src)) {
  console.error('\u2716 сначала запусти: npm run desktop:installer-nsi')
  process.exit(1)
}

mkdirSync(dirname(dest), { recursive: true })
copyFileSync(src, dest)

console.log('\u2713 копия сценария: installer/installer.nsi')
