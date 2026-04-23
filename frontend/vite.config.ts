import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/doctor': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
      '/patient': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/consultation': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        ws: true,
      },
      '/health': 'http://localhost:8000',
    },
  },
})
