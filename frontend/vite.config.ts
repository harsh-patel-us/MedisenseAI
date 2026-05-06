import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Single /api prefix — avoids collision with SPA routes like
      // /doctor, /patient, /consultation, /integrations, etc.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        ws: true,
        // Increase timeouts for long-running LLM requests and stable WebSockets
        proxyTimeout: 120000,
        timeout: 120000,
        // Suppress common proxy errors that can clutter the log in dev
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            if (err.message.includes('ECONNRESET') || err.message.includes('ECONNABORTED')) {
              // Ignore these in logs as they usually just mean the browser/backend closed the socket
              return;
            }
            console.error('proxy error', err);
          });
        },
      },
      '/health': 'http://127.0.0.1:8000',
    },
  },
})
