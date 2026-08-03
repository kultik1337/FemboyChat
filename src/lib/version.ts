/**
 * The one place the app's version is written down.
 *
 * It is a plain constant instead of an import from package.json on purpose:
 * reading JSON from TypeScript needs `resolveJsonModule` and Node types, and
 * `npm run typecheck` has neither. Bump this together with package.json,
 * src-tauri/tauri.conf.json and src-tauri/Cargo.toml.
 *
 * С появлением проверки обновлений (src/lib/update.ts) у этой строки
 * появилась вторая роль: именно с ней сравнивается номер последнего релиза
 * на GitHub. Если забыть поднять её перед тегом, собранное приложение будет
 * вечно предлагать обновиться само до себя же.
 */
export const APP_RELEASE = '1.0.3'

/**
 * Replaced by Vite at build time (see `define` in vite.config.ts). It does not
 * exist at runtime, hence the ambient declaration and the guard below: `tsc`
 * alone never sees the replacement, and neither does anything that imports this
 * module outside of a Vite build.
 */
declare const __BUILD_STAMP__: string | undefined

/**
 * When this exact bundle was built, e.g. `02.08, 15:40`.
 *
 * The release number alone cannot answer "is this the build with my fix in it?"
 * because it only changes when someone bumps it by hand — which is precisely how
 * a rebuilt desktop app ended up indistinguishable from the old one.
 */
export const BUILD_STAMP = typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : 'dev'

/**
 * What the interface shows. It deliberately carries the build stamp as well, so
 * the line in Settings identifies the actual bundle rather than just the
 * release it belongs to.
 */
export const APP_VERSION = `${APP_RELEASE} · сборка ${BUILD_STAMP}`
export const APP_VERSION_LABEL = `v${APP_RELEASE} · ${BUILD_STAMP}`
