import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Workout — Progresso na Academia',
        short_name: 'Workout',
        description: 'Guia de treino com timer de descanso e estatisticas de progresso',
        theme_color: '#0b0f17',
        background_color: '#0b0f17',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api/],
        // Sem isso, um SW novo so assume depois que TODAS as abas da versao
        // antiga fecharem — no PWA instalado, a tela que abriu primeiro fica
        // presa na versao antiga (o menu inferior "some" nela) ate algo forcar
        // a atualizacao. clientsClaim + skipWaiting fazem o SW novo assumir na
        // hora, mesmo com a aba ja aberta.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
})
