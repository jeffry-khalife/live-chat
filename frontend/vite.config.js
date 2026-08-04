import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      '/api': process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
    },
  },
})
