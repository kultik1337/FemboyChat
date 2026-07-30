/**
 * The single source of truth for the app version.
 *
 * `package.json` is deliberately NOT imported here: pulling it into `src` would
 * require `resolveJsonModule` and would drag the whole manifest into the client
 * bundle. Keep this constant and `package.json`'s "version" field in sync — bump
 * both in the same commit as the changelog post.
 */
export const APP_VERSION = '0.8.0'

export const APP_VERSION_LABEL = `v${APP_VERSION}`
