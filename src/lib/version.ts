/**
 * The single source of truth for the version the UI shows.
 *
 * Deliberately a plain TS constant instead of a build-time `define` fed from
 * package.json: importing JSON needs `resolveJsonModule`, and reading it in
 * vite.config.ts needs `@types/node`, which this project does not install --
 * either route can break `npm run typecheck`. Keep this in step with the
 * `version` field in package.json by hand when releasing.
 */
export const APP_VERSION = '0.8.4'

export const APP_VERSION_LABEL = `v${APP_VERSION}`
