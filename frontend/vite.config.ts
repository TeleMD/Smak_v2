import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174, // Different port from v1 to avoid conflicts
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
}) 