/**
 * The version the app reports about itself.
 *
 * This is the single value the UI renders — Settings → О приложении reads it
 * instead of hardcoding a number that silently rots. Keep `version` in
 * package.json identical: `npm version` bumps that one, and this constant is
 * the copy the bundle can actually import (importing package.json from src
 * would drag the whole manifest into the client bundle).
 *
 * When a change ships, bump both and use the same number in the Changelog post.
 */
export const APP_VERSION = '0.7.7'

/** Human-readable build label, e.g. "v0.7.7". */
export const APP_VERSION_LABEL = `v${APP_VERSION}`
