/**
 * The one place the app's version is written down.
 *
 * It is a plain constant instead of an import from package.json on purpose:
 * reading JSON from TypeScript needs `resolveJsonModule` and Node types, and
 * `npm run typecheck` has neither. Bump this together with package.json.
 */
export const APP_VERSION = '0.8.8'
export const APP_VERSION_LABEL = `v${APP_VERSION}`
