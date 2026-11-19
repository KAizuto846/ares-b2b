import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/spa/',
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:8081', '/avatar': 'http://127.0.0.1:8081' } },
  build: { outDir: '../backend/public/spa', emptyOutDir: true },
})
