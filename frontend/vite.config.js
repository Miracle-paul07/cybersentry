import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// In development the API runs separately on :8000 (uvicorn backend.main:app).
// In production FastAPI serves the built files from frontend/dist.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // three.js and ECharts are big but load only on the pages that use them, from localhost
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
})
