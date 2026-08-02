import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * When the bundle was built, in Moscow time.
 *
 * Without this there is no way to tell one build from another: the version is a
 * hand-bumped constant, so a freshly built .exe looks exactly like the one from
 * last week and "did my change actually get in?" becomes unanswerable. The
 * stamp is computed once, when Vite starts, and inlined into the bundle.
 */
const buildStamp = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Moscow',
}).format(new Date())

// The app is served from the domain root on Cloudflare Pages (and on a custom
// domain), so the base path is '/'. (The previous '/FemboyChat/' base only
// suited GitHub Pages project sites and 404s assets everywhere else.)
export default defineConfig({
  base: '/',
  plugins: [react()],
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
