import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  server: {
    host: true,
  },
  plugins: [react(), tailwindcss()],
  define: {
    // Polyfill for ethers.js v5 (uses process.env)
    'process.env': {},
    global: 'globalThis',
  },
  resolve: {
    alias: {
      // Polyfill stream for ethers.js v5
      stream: 'stream-browserify',
    },
  },
})
