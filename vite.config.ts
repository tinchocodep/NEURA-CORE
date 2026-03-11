import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Proxy ARCA webhook calls to avoid CORS in development
      '/api/arca': {
        target: 'https://n8n.neuracall.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/arca/, '/webhook/BuscarPersonas'),
      },
      // Proxy comprobantes PDF upload to n8n
      '/api/n8n-comprobantes': {
        target: 'https://n8n.neuracall.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/n8n-comprobantes/, '/webhook-test/CargaDeComprobantes'),
      },
      // Proxy email sending to n8n
      '/api/n8n-send-email': {
        target: 'https://n8n.neuracall.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/n8n-send-email/, '/webhook/enviar_por_mail'),
      },
    },
  },
})
