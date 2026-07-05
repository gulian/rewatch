import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Custom SW (src/sw.ts): Workbox precache + Web Push handlers.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // SW enabled in dev too (push testing on localhost/HTTPS).
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'Rewatch',
        short_name: 'Rewatch',
        description: 'Track your shows and movies',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      // Dev: Vite proxies the local Fastify API.
      '/api': 'http://127.0.0.1:3010',
    },
  },
})
