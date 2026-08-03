/**
 * Рисует графику установщика (макет "Aurora").
 *
 * ПОЧЕМУ ВСЁ ОДНОЙ КАРТИНКОЙ.
 * NSIS не умеет ни скруглений, ни градиентов, ни теней, ни прозрачного текста:
 * любая подпись поверх картинки закрашивает свой прямоугольник фоном. Поэтому
 * весь экран рисуется здесь в один bmp, а в самом установщике живых элемента два:
 * подпись с путём и маленькая картинка галочки.
 *
 * ПОЧЕМУ НЕСКОЛЬКО МАСШТАБОВ.
 * NSIS показывает bmp как есть, без масштабирования. Если у человека масштаб
 * экрана 125% или 150%, то либо окно растянет сама Windows (и всё становится
 * мылом), либо окно остаётся крошечным. Поэтому каждый экран рисуется сразу
 * в четырёх размерах, а установщик выбирает нужный по текущему DPI.
 *
 * ВСЕ ЧИСЛА В LAYOUT КРАТНЫ 4. Масштаб 125% умножает координаты на 1.25, и
 * только кратные 4 числа дают целые пиксели на всех четырёх масштабах.
 * В установщике та же арифметика целыми числами (x * масштаб / 100), иначе
 * области нажатия уедут от рисунка на полпикселя.
 *
 * ЦВЕТА ЖИВУТ В ОДНОМ МЕСТЕ — в блоке ПАЛИТРА ниже. Разбросанные по svg
 * шестнадцатеричные значения — это ровно то, из-за чего установщик и приложение
 * разъехались по цвету.
 *
 * ВНУТРИ SVG НЕЛЬЗЯ ПИСАТЬ ДВА ДЕФИСА ПОДРЯД В КОММЕНТАРИИ. Это запрещено
 * самим xml, разбор падает целиком, и сборка графики умирает с ошибкой про
 * double-hyphen. Имена переменных темы поэтому пишутся здесь без ведущих
 * дефисов.
 *
 * Выходные файлы на каждый масштаб: bg-<масштаб>.bmp и две галочки.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'src-tauri', 'installer')
const iconPath = resolve(root, 'icon.png')

/** Логический размер экрана при 100%. */
const W = 680
const H = 460

/** Масштабы в процентах — тот же список обязан быть в installer-nsi.mjs. */
const SCALES = [100, 125, 150, 200]

/*
 * ПАЛИТРА.
 *
 * Те же цвета, что у темы по умолчанию в src/index.css. Установщик — первое
 * окно продукта, и он не должен выглядеть окном из другого приложения.
 * Раньше здесь жила собственная палитра: сиреневый #C98CFF вместо accent-2
 * и кнопка, уходившая в розовый #FF9ECB, которого в приложении нет нигде.
 * Меняешь цвета в теме — поменяй и здесь.
 */

/** --accent */
const ACCENT = '#7C9CFF'
/** --accent-2 */
const ACCENT_2 = '#9D8BFF'
/** Осветлённый акцент: мелкая подпись чистым акцентом на тёмном не читается. */
const ACCENT_SOFT = '#A9BEFF'

/** --text */
const TEXT = '#FFFFFF'
/** --muted. Тот же цвет обязан стоять в C_MUTED в installer-nsi.mjs. */
const MUTED = '#8C93AD'
/** Заголовок раздела: ещё тише, чем --muted. */
const CAPTION = '#6F7590'
/** Подпись у галочки. */
const CHECK_LABEL = '#C3C9DD'
/** Текст кнопки отмены. */
const CANCEL_TEXT = '#AAB1C8'

/**
 * Краска поверх акцентной заливки.
 *
 * В приложении на акценте лежит белый (--accent-contrast), но там это мелкие
 * элементы и пузыри сообщений. Здесь это главная кнопка окна, и тёмная краска
 * на светлом акценте читается заметно увереннее: контраст около 9:1 против
 * 2.6:1 у белого. Единственное осознанное отступление от темы.
 */
const ON_ACCENT = '#0A0C14'

/** Плоский цвет подложки поля пути. Тот же ставится фоном подписи в NSIS. */
const FIELD_FILL = '#161A26'

/** Фон страницы установки и цвет, в который сводится прозрачность. */
const PAGE_DARK = '#0A0B12'

/** Верхний тон фоновой заливки — тот же тёмный, чуть светлее. */
const PAGE_TOP = '#10121C'

const LAYOUT = {
	logo: { x: 64, y: 136, s: 120, r: 28 },
	field: { x: 296, y: 248, w: 344, h: 48, r: 12 },
	browse: { x: 548, y: 256, w: 84, h: 32, r: 8 },
	path: { x: 312, y: 252, w: 228, h: 40 },
	check: { x: 296, y: 324, s: 20, r: 6 },
	checkHit: { x: 296, y: 320, w: 252, h: 28 },
	install: { x: 296, y: 376, w: 212, h: 52, r: 14 },
	cancel: { x: 520, y: 376, w: 120, h: 52, r: 14 },
	close: { x: 632, y: 16, s: 32 },
}

// Гарантия целых пикселей на масштабе 125%.
for (const [name, rect] of Object.entries(LAYOUT)) {
	for (const [key, value] of Object.entries(rect)) {
		// r — только радиус скругления, в расстановке контролов он не участвует.
		if (key === 'r') continue
		if (value % 4 !== 0) {
			console.error(`✖ LAYOUT.${name}.${key} = ${value} не кратно 4`)
			process.exit(1)
		}
	}
}

let sharp
try {
	sharp = (await import('sharp')).default
} catch {
	console.error('✖ Для графики установщика нужен sharp: npm install sharp')
	process.exit(1)
}

if (!existsSync(iconPath)) {
	console.error('✖ Не найден icon.png в корне проекта')
	process.exit(1)
}

const version = JSON.parse(
	readFileSync(resolve(root, 'package.json'), 'utf8'),
).version

const FONT = 'Segoe UI, Noto Sans, DejaVu Sans, sans-serif'

/**
 * Весь экран в svg. Координаты всегда логические (viewBox), а реальный
 * размер задаётся атрибутами width/height — текст от этого остаётся чётким.
 */
function screen(checked, pxW, pxH) {
	const L = LAYOUT
	const box = checked
		? `<rect x="${L.check.x}" y="${L.check.y}" width="${L.check.s}" height="${L.check.s}" rx="${L.check.r}" fill="url(#chk)"/>
		<path d="M${L.check.x + 5.5} ${L.check.y + 10.2} l3 3 l6 -6.6" fill="none" stroke="${ON_ACCENT}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
		: `<rect x="${L.check.x}" y="${L.check.y}" width="${L.check.s}" height="${L.check.s}" rx="${L.check.r}" fill="${TEXT}" fill-opacity="0.05" stroke="${TEXT}" stroke-opacity="0.18"/>`

	return `<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${pxH}" viewBox="0 0 ${W} ${H}">
	<defs>
		<linearGradient id="base" x1="0" y1="0" x2="0.45" y2="1">
			<stop offset="0" stop-color="${PAGE_TOP}"/>
			<stop offset="1" stop-color="${PAGE_DARK}"/>
		</linearGradient>
		<radialGradient id="glowA" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(82 0) scale(620 420)">
			<stop offset="0" stop-color="${ACCENT_2}" stop-opacity="0.22"/>
			<stop offset="0.62" stop-color="${ACCENT_2}" stop-opacity="0"/>
		</radialGradient>
		<radialGradient id="glowB" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(625 460) scale(620 460)">
			<stop offset="0" stop-color="${ACCENT}" stop-opacity="0.22"/>
			<stop offset="0.62" stop-color="${ACCENT}" stop-opacity="0"/>
		</radialGradient>
		<!-- Та же пара, что у своих сообщений в чате: accent и accent-2. -->
		<linearGradient id="btn" gradientUnits="userSpaceOnUse" x1="${L.install.x}" y1="${L.install.y}" x2="${L.install.x + L.install.w}" y2="${L.install.y + L.install.h}">
			<stop offset="0" stop-color="${ACCENT}"/>
			<stop offset="1" stop-color="${ACCENT_2}"/>
		</linearGradient>
		<linearGradient id="chk" gradientUnits="userSpaceOnUse" x1="${L.check.x}" y1="${L.check.y}" x2="${L.check.x + L.check.s}" y2="${L.check.y + L.check.s}">
			<stop offset="0" stop-color="${ACCENT}"/>
			<stop offset="1" stop-color="${ACCENT_2}"/>
		</linearGradient>
		<!-- Область фильтра с большим запасом: если её не хватит на радиус размытия,
		     свечение обрежется и по краю появится заметная прямая граница. -->
		<filter id="soft" x="-150%" y="-150%" width="400%" height="400%">
			<feGaussianBlur stdDeviation="26"/>
		</filter>
		<filter id="softBtn" x="-150%" y="-150%" width="400%" height="400%">
			<feGaussianBlur stdDeviation="16"/>
		</filter>
	</defs>

	<rect width="${W}" height="${H}" fill="url(#base)"/>
	<rect width="${W}" height="${H}" fill="url(#glowA)"/>
	<rect width="${W}" height="${H}" fill="url(#glowB)"/>

	<!-- ореол повторяет форму логотипа, а не круг -->
	<rect x="${L.logo.x}" y="${L.logo.y}" width="${L.logo.s}" height="${L.logo.s}" rx="${L.logo.r}" fill="${ACCENT_2}" fill-opacity="0.42" filter="url(#soft)"/>

	<g font-family="${FONT}" fill="${TEXT}">
		<text x="${L.logo.x + L.logo.s / 2}" y="302" font-size="19" font-weight="600" text-anchor="middle">FemboyChat</text>
		<text x="${L.logo.x + L.logo.s / 2}" y="325" font-size="12.5" fill="${MUTED}" text-anchor="middle">версия ${version}</text>

		<text x="296" y="116" font-size="29" font-weight="600">Почти готово</text>
		<g font-size="13.5" fill="${MUTED}">
			<text x="296" y="152">Займёт пару секунд и не потребует прав</text>
			<text x="296" y="174">администратора. Мессенджер откроется сразу</text>
			<text x="296" y="196">после установки.</text>
		</g>
		<text x="296" y="232" font-size="11" fill="${CAPTION}" letter-spacing="1.8">КУДА УСТАНОВИТЬ</text>
	</g>

	<rect x="${L.field.x}" y="${L.field.y}" width="${L.field.w}" height="${L.field.h}" rx="${L.field.r}" fill="${FIELD_FILL}" stroke="${TEXT}" stroke-opacity="0.09"/>
	<rect x="${L.browse.x}" y="${L.browse.y}" width="${L.browse.w}" height="${L.browse.h}" rx="${L.browse.r}" fill="${ACCENT}" fill-opacity="0.14"/>
	<text x="${L.browse.x + L.browse.w / 2}" y="${L.browse.y + 21}" font-family="${FONT}" font-size="13" fill="${ACCENT_SOFT}" text-anchor="middle">Изменить</text>

	${box}
	<text x="${L.check.x + 31}" y="${L.check.y + 15}" font-family="${FONT}" font-size="13.5" fill="${CHECK_LABEL}">Создать ярлык на рабочем столе</text>

	<rect x="${L.install.x + 10}" y="${L.install.y + 14}" width="${L.install.w - 20}" height="${L.install.h}" rx="${L.install.r}" fill="${ACCENT_2}" fill-opacity="0.45" filter="url(#softBtn)"/>
	<rect x="${L.install.x}" y="${L.install.y}" width="${L.install.w}" height="${L.install.h}" rx="${L.install.r}" fill="url(#btn)"/>
	<rect x="${L.install.x + 3}" y="${L.install.y + 1}" width="${L.install.w - 6}" height="1" rx="0.5" fill="${TEXT}" fill-opacity="0.35"/>
	<text x="${L.install.x + L.install.w / 2}" y="${L.install.y + 33}" font-family="${FONT}" font-size="15" font-weight="600" fill="${ON_ACCENT}" text-anchor="middle">Установить</text>

	<rect x="${L.cancel.x}" y="${L.cancel.y}" width="${L.cancel.w}" height="${L.cancel.h}" rx="${L.cancel.r}" fill="${TEXT}" fill-opacity="0.05" stroke="${TEXT}" stroke-opacity="0.09"/>
	<text x="${L.cancel.x + L.cancel.w / 2}" y="${L.cancel.y + 33}" font-family="${FONT}" font-size="15" fill="${CANCEL_TEXT}" text-anchor="middle">Отмена</text>

	<path d="M${L.close.x + 10.5} ${L.close.y + 10.5} l11 11 M${L.close.x + 21.5} ${L.close.y + 10.5} l-11 11" stroke="${MUTED}" stroke-width="1.6" stroke-linecap="round"/>
</svg>`
}

/** Собирает экран нужного масштаба вместе с логотипом. */
async function render(scale, checked) {
	const k = scale / 100
	const pxW = Math.round(W * k)
	const pxH = Math.round(H * k)
	const logoS = Math.round(LAYOUT.logo.s * k)
	const logoR = Math.round(LAYOUT.logo.r * k)

	const mask = Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${logoS}" height="${logoS}"><rect width="${logoS}" height="${logoS}" rx="${logoR}" fill="#fff"/></svg>`,
	)
	const logo = await sharp(iconPath)
		.resize(logoS, logoS, { fit: 'cover' })
		.composite([{ input: mask, blend: 'dest-in' }])
		.png()
		.toBuffer()

	const base = await sharp(Buffer.from(screen(checked, pxW, pxH))).png().toBuffer()
	const { data, info } = await sharp(base)
		.composite([
			{
				input: logo,
				left: Math.round(LAYOUT.logo.x * k),
				top: Math.round(LAYOUT.logo.y * k),
			},
		])
		.flatten({ background: PAGE_DARK })
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true })

	return { data, w: info.width, h: info.height }
}

/**
 * Проверяем, что текст действительно нарисовался: если рисовалка не нашла
 * шрифтов, подписи молча пропадают и человек получает пустое окно.
 */
function assertText(img, rect, k, wantBright, name) {
	const x0 = Math.round(rect.x * k)
	const y0 = Math.round(rect.y * k)
	const x1 = Math.round((rect.x + rect.w) * k)
	const y1 = Math.round((rect.y + rect.h) * k)
	let hit = 0
	for (let y = y0; y < y1; y++) {
		for (let x = x0; x < x1; x++) {
			const i = (y * img.w + x) * 3
			const lum = (img.data[i] * 299 + img.data[i + 1] * 587 + img.data[i + 2] * 114) / 1000
			if (wantBright ? lum > 140 : lum < 90) hit++
		}
	}
	if (hit < 120) {
		console.error(`✖ Текст "${name}" не отрисовался (${hit} точек).`)
		console.error('  Похоже, рисовалка svg не нашла системных шрифтов.')
		process.exit(1)
	}
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

/** Вырезает кусок из готового RGB. */
function crop(img, x, y, w, h) {
	const data = Buffer.alloc(w * h * 3)
	for (let row = 0; row < h; row++) {
		img.data.copy(data, row * w * 3, ((y + row) * img.w + x) * 3, ((y + row) * img.w + x + w) * 3)
	}
	return { data, w, h }
}

mkdirSync(outDir, { recursive: true })

let total = 0
for (const scale of SCALES) {
	const k = scale / 100
	const on = await render(scale, true)
	const off = await render(scale, false)

	assertText(on, { x: 296, y: 90, w: 300, h: 28 }, k, true, `Почти готово @${scale}`)
	assertText(on, { x: 330, y: 392, w: 150, h: 22 }, k, false, `Установить @${scale}`)

	const cx = Math.round(LAYOUT.check.x * k)
	const cy = Math.round(LAYOUT.check.y * k)
	const cs = Math.round(LAYOUT.check.s * k)

	const files = [
		[`bg-${scale}.bmp`, on],
		[`chk-on-${scale}.bmp`, crop(on, cx, cy, cs, cs)],
		[`chk-off-${scale}.bmp`, crop(off, cx, cy, cs, cs)],
	]

	for (const [name, img] of files) {
		const bmp = encodeBmp24(img)
		total += bmp.length
		writeFileSync(resolve(outDir, name), bmp)
	}
	console.log(`  ${scale}%  ${on.w}x${on.h}`)
}

console.log(`✓ Графика установщика готова (${(total / 1024 / 1024).toFixed(1)} МБ до сжатия)`)
