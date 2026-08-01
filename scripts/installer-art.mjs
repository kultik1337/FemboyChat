/**
 * Рисует графику установщика (макет "Aurora").
 *
 * ПОЧЕМУ ВСЁ ОДНОЙ КАРТИНКОЙ.
 * NSIS не умеет ни скруглений, ни градиентов, ни теней, ни прозрачного текста:
 * любая подпись поверх картинки закрашивает прямоугольник своим фоном. Поэтому
 * весь экран (фон, свечения, логотип, поля, кнопки И ВЕСЬ СТАТИЧНЫЙ ТЕКСТ)
 * рисуется здесь в один bmp, а в самом установщике сверху лежат только
 * невидимые области нажатия. Единственная живая подпись - путь установки,
 * поэтому подложка поля залита ПЛОСКИМ цветом FIELD_FILL: ровно его же ставит
 * себе фоном подпись, и стыка не видно.
 *
 * Координаты отсюда обязаны совпадать с installer-nsi.mjs (см. LAYOUT).
 * Выходные файлы: bg.bmp (весь экран), chk-on.bmp / chk-off.bmp (галочка).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'src-tauri', 'installer')
const iconPath = resolve(root, 'icon.png')

const W = 680
const H = 460

/** Плоский цвет подложки поля пути. Тот же самый ставится подписи в NSIS. */
const FIELD_FILL = '#161A26'

const LAYOUT = {
	logo: { x: 66, y: 136, s: 118, r: 28 },
	field: { x: 296, y: 256, w: 344, h: 50, r: 13 },
	browse: { x: 540, y: 264, w: 92, h: 34, r: 9 },
	check: { x: 296, y: 336, s: 20, r: 7 },
	install: { x: 296, y: 388, w: 212, h: 52, r: 14 },
	cancel: { x: 520, y: 388, w: 120, h: 52, r: 14 },
	close: { x: 632, y: 16, s: 32 },
}

let sharp
try {
	sharp = (await import('sharp')).default
} catch {
	console.error('\u2716 Для графики установщика нужен sharp: npm install sharp')
	process.exit(1)
}

if (!existsSync(iconPath)) {
	console.error('\u2716 Не найден icon.png в корне проекта')
	process.exit(1)
}

const version = JSON.parse(
	readFileSync(resolve(root, 'package.json'), 'utf8'),
).version

const FONT = "Segoe UI, Noto Sans, DejaVu Sans, sans-serif"

/** Весь экран в svg. checked - в каком состоянии нарисована галочка. */
function screen(checked) {
	const L = LAYOUT
	const box = checked
		? `<rect x="${L.check.x}" y="${L.check.y}" width="${L.check.s}" height="${L.check.s}" rx="${L.check.r}" fill="url(#chk)"/>
		<path d="M${L.check.x + 5.5} ${L.check.y + 10.2} l3 3 l6 -6.6" fill="none" stroke="#0B0D14" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
		: `<rect x="${L.check.x}" y="${L.check.y}" width="${L.check.s}" height="${L.check.s}" rx="${L.check.r}" fill="#FFFFFF" fill-opacity="0.05" stroke="#FFFFFF" stroke-opacity="0.18"/>`

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
	<defs>
		<linearGradient id="base" x1="0" y1="0" x2="0.45" y2="1">
			<stop offset="0" stop-color="#10121C"/>
			<stop offset="1" stop-color="#0A0B12"/>
		</linearGradient>
		<radialGradient id="glowA" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(82 0) scale(620 420)">
			<stop offset="0" stop-color="#C98CFF" stop-opacity="0.22"/>
			<stop offset="0.62" stop-color="#C98CFF" stop-opacity="0"/>
		</radialGradient>
		<radialGradient id="glowB" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(625 460) scale(620 460)">
			<stop offset="0" stop-color="#7C9CFF" stop-opacity="0.22"/>
			<stop offset="0.62" stop-color="#7C9CFF" stop-opacity="0"/>
		</radialGradient>
		<radialGradient id="logoGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(125 195) scale(88 88)">
			<stop offset="0.35" stop-color="#C98CFF" stop-opacity="0.40"/>
			<stop offset="1" stop-color="#C98CFF" stop-opacity="0"/>
		</radialGradient>
		<radialGradient id="btnGlow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(402 434) scale(132 48)">
			<stop offset="0" stop-color="#8C8CFF" stop-opacity="0.34"/>
			<stop offset="1" stop-color="#8C8CFF" stop-opacity="0"/>
		</radialGradient>
		<linearGradient id="btn" gradientUnits="userSpaceOnUse" x1="296" y1="388" x2="508" y2="440">
			<stop offset="0" stop-color="#8FB0FF"/>
			<stop offset="0.52" stop-color="#A78CFF"/>
			<stop offset="1" stop-color="#FF9ECB"/>
		</linearGradient>
		<linearGradient id="chk" gradientUnits="userSpaceOnUse" x1="${L.check.x}" y1="${L.check.y}" x2="${L.check.x + L.check.s}" y2="${L.check.y + L.check.s}">
			<stop offset="0" stop-color="#7C9CFF"/>
			<stop offset="1" stop-color="#C98CFF"/>
		</linearGradient>
	</defs>

	<rect width="${W}" height="${H}" fill="url(#base)"/>
	<rect width="${W}" height="${H}" fill="url(#glowA)"/>
	<rect width="${W}" height="${H}" fill="url(#glowB)"/>
	<rect width="${W}" height="${H}" fill="url(#logoGlow)"/>

	<g font-family="${FONT}" fill="#FFFFFF">
		<text x="125" y="302" font-size="19" font-weight="600" text-anchor="middle">FemboyChat</text>
		<text x="125" y="325" font-size="12.5" fill="#8C93AD" text-anchor="middle">версия ${version}</text>

		<text x="296" y="116" font-size="29" font-weight="600">Почти готово</text>
		<g font-size="13.5" fill="#8C93AD">
			<text x="296" y="152">Займ\u0451т пару секунд и не потребует прав</text>
			<text x="296" y="174">администратора. Мессенджер откроется сразу</text>
			<text x="296" y="196">после установки.</text>
		</g>
		<text x="296" y="240" font-size="11" fill="#6F7590" letter-spacing="1.8">КУДА УСТАНОВИТЬ</text>
	</g>

	<rect x="${L.field.x}" y="${L.field.y}" width="${L.field.w}" height="${L.field.h}" rx="${L.field.r}" fill="${FIELD_FILL}" stroke="#FFFFFF" stroke-opacity="0.09"/>
	<rect x="${L.browse.x}" y="${L.browse.y}" width="${L.browse.w}" height="${L.browse.h}" rx="${L.browse.r}" fill="#7C9CFF" fill-opacity="0.14"/>
	<text x="${L.browse.x + L.browse.w / 2}" y="${L.browse.y + 22}" font-family="${FONT}" font-size="13" fill="#93AEFF" text-anchor="middle">Изменить</text>

	${box}
	<text x="327" y="351" font-family="${FONT}" font-size="13.5" fill="#C3C9DD">Создать ярлык на рабочем столе</text>

	<rect width="${W}" height="${H}" fill="url(#btnGlow)"/>
	<rect x="${L.install.x}" y="${L.install.y}" width="${L.install.w}" height="${L.install.h}" rx="${L.install.r}" fill="url(#btn)"/>
	<rect x="${L.install.x + 3}" y="${L.install.y + 1}" width="${L.install.w - 6}" height="1" rx="0.5" fill="#FFFFFF" fill-opacity="0.35"/>
	<text x="${L.install.x + L.install.w / 2}" y="${L.install.y + 33}" font-family="${FONT}" font-size="15" font-weight="600" fill="#0A0C14" text-anchor="middle">Установить</text>

	<rect x="${L.cancel.x}" y="${L.cancel.y}" width="${L.cancel.w}" height="${L.cancel.h}" rx="${L.cancel.r}" fill="#FFFFFF" fill-opacity="0.05" stroke="#FFFFFF" stroke-opacity="0.09"/>
	<text x="${L.cancel.x + L.cancel.w / 2}" y="${L.cancel.y + 33}" font-family="${FONT}" font-size="15" fill="#AAB1C8" text-anchor="middle">Отмена</text>

	<path d="M642.5 26.5 l11 11 M653.5 26.5 l-11 11" stroke="#8C93AD" stroke-width="1.6" stroke-linecap="round"/>
</svg>`
}

/** svg -> плоский RGB без альфы. */
async function raster(svgText) {
	const { data, info } = await sharp(Buffer.from(svgText))
		.flatten({ background: '#0A0B12' })
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })
	return { data, w: info.width, h: info.height }
}

/**
 * Проверяем, что текст действительно нарисовался: если рисовалка не нашла
 * шрифтов, подписи молча пропадают и пользователь получает пустое окно.
 * Лучше уронить сборку с понятным сообщением.
 */
function assertText(img, rect, wantBright, name) {
	let hit = 0
	for (let y = rect.y; y < rect.y + rect.h; y++) {
		for (let x = rect.x; x < rect.x + rect.w; x++) {
			const i = (y * img.w + x) * 3
			const lum = (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000
			if (wantBright ? lum > 140 : lum < 90) hit++
		}
	}
	if (hit < 120) {
		console.error(`\u2716 Текст "${name}" не отрисовался (${hit} точек).`)
		console.error('  Похоже, рисовалка svg не нашла системных шрифтов.')
		process.exit(1)
	}
	return hit
}

/** 24-битный bmp снизу вверх, строки кратны 4 байтам. */
function encodeBmp24(img) {
	const rowSize = Math.ceil((img.w * 3) / 4) * 4
	const pixels = Buffer.alloc(rowSize * img.h)
	for (let y = 0; y < img.h; y++) {
		const dst = (img.h - 1 - y) * rowSize
		for (let x = 0; x < img.w; x++) {
			const src = (y * img.w + x) * 3
			pixels[dst + x * 3] = img.data[src + 2]
			pixels[dst + x * 3 + 1] = img.data[src + 1]
			pixels[dst + x * 3 + 2] = img.data[src]
		}
	}
	const header = Buffer.alloc(54)
	header.write('BM', 0, 'ascii')
	header.writeUInt32LE(54 + pixels.length, 2)
	header.writeUInt32LE(54, 10)
	header.writeUInt32LE(40, 14)
	header.writeInt32LE(img.w, 18)
	header.writeInt32LE(img.h, 22)
	header.writeUInt16LE(1, 26)
	header.writeUInt16LE(24, 28)
	header.writeUInt32LE(pixels.length, 34)
	header.writeInt32LE(2835, 38)
	header.writeInt32LE(2835, 42)
	return Buffer.concat([header, pixels])
}

/** Вырезает кусок из уже готового RGB. */
function crop(img, x, y, w, h) {
	const data = Buffer.alloc(w * h * 3)
	for (let row = 0; row < h; row++) {
		img.data.copy(data, row * w * 3, ((y + row) * img.w + x) * 3, ((y + row) * img.w + x + w) * 3)
	}
	return { data, w, h }
}

mkdirSync(outDir, { recursive: true })

const L = LAYOUT
const mask = Buffer.from(
	`<svg xmlns="http://www.w3.org/2000/svg" width="${L.logo.s}" height="${L.logo.s}"><rect width="${L.logo.s}" height="${L.logo.s}" rx="${L.logo.r}" fill="#fff"/></svg>`,
)
const logo = await sharp(iconPath)
	.resize(L.logo.s, L.logo.s, { fit: 'cover' })
	.composite([{ input: mask, blend: 'dest-in' }])
	.png()
	.toBuffer()

async function withLogo(svgText) {
	const png = await sharp(Buffer.from(svgText)).png().toBuffer()
	const { data, info } = await sharp(png)
		.composite([{ input: logo, left: L.logo.x, top: L.logo.y }])
		.flatten({ background: '#0A0B12' })
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })
	return { data, w: info.width, h: info.height }
}

const on = await withLogo(screen(true))
const off = await withLogo(screen(false))

assertText(on, { x: 296, y: 90, w: 300, h: 28 }, true, 'Почти готово')
assertText(on, { x: 330, y: 404, w: 150, h: 22 }, false, 'Установить')

const files = [
	['bg.bmp', on],
	['chk-on.bmp', crop(on, L.check.x, L.check.y, L.check.s, L.check.s)],
	['chk-off.bmp', crop(off, L.check.x, L.check.y, L.check.s, L.check.s)],
]

for (const [name, img] of files) {
	const bmp = encodeBmp24(img)
	writeFileSync(resolve(outDir, name), bmp)
	console.log(`  ${name}  ${img.w}x${img.h}  ${(bmp.length / 1024).toFixed(0)} КБ`)
}
console.log('\u2713 Графика установщика готова')
