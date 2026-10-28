import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the React app calls "/api/..." and Vite forwards it to the Django server,
// so no CORS setup is needed locally. In production set VITE_API_BASE_URL to the backend URL.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': { target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000', changeOrigin: true } },
  },
  test: { environment: 'jsdom', globals: true, setupFiles: './src/test/setup.js', css: false },
})
