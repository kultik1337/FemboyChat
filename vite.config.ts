import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves the site from https://<user>.github.io/FemboyChat/
// so the base path must match the repository name. When running locally
// (dev / preview) we keep it at '/'.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/FemboyChat/' : '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
}))
