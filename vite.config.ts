import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app is served from the domain root on Cloudflare Pages (and on a custom
// domain), so the base path is '/'. (The previous '/FemboyChat/' base only
// suited GitHub Pages project sites and 404s assets everywhere else.)
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
