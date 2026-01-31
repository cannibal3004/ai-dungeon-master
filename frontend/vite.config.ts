import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.VITE_BACKEND_URL || 'http://localhost:4000'
  const wsBackend = backend.startsWith('https')
    ? backend.replace('https', 'wss')
    : backend.replace('http', 'ws')

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      proxy: {
        '/api': {
          target: backend,
          changeOrigin: true,
        },
        '/audio': {
          target: backend,
          changeOrigin: true,
        },
        '/socket.io': {
          target: wsBackend,
          ws: true,
          rewriteWsOrigin: true,
        },
      },
    },
  }
})
