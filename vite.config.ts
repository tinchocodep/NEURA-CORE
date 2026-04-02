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
        rewrite: (path) => path.replace(/^\/api\/n8n-comprobantes/, '/webhook/CargaDeComprobantes'),
      },

      // Proxy email sending to n8n
      '/api/n8n-send-email': {
        target: 'https://n8n.neuracall.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/n8n-send-email/, '/webhook/enviar_por_mail'),
      },
      // Proxy Chatbot to n8n (Test)
      '/api/webhook-chatbot': {
        target: 'https://n8n.neuracall.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/webhook-chatbot/, '/webhook/neuracore-chat'),
      },
      // Proxy Ordenes de Pago a n8n
      '/api/n8n-ordenes-pago': {
        target: 'https://n8n.neuracall.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/n8n-ordenes-pago/, '/webhook/ordenes%20de%20pago'),
      },
      // Proxy AFIP SDK to avoid CORS
      '/api/afipsdk': {
        target: 'https://app.afipsdk.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/afipsdk/, '/api/v1/automations'),
      }
    },
  },
})
