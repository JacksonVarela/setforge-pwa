// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png','icons/icon-512.png','icons/maskable-192.png','icons/maskable-512.png'],
      manifest: {
        name: 'SetForge — Lift Tracker',
        short_name: 'SetForge',
        description: 'Split-based lift tracker. Offline-first. Your data stays on device.',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        // modest bump to avoid future surprises
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // prefer modern assets; webp included
        globPatterns: ['**/*.{js,css,html,ico,svg,webp,png,woff2}'],
      }
    })
  ],
  build: {
    chunkSizeWarningLimit: 1500
  }
})
