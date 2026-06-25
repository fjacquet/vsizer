import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  // Base path for GitHub Pages deployment (https://fjacquet.github.io/vsizer/)
  base: '/vsizer/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Prompt mode: a new SW waits and the user opts in to reload via a
      // toast (src/pwa/registerSW.ts). A silent reload would drop the
      // in-memory dataset (ADR-0004).
      registerType: 'prompt',
      // We register manually through the virtual:pwa-register module so the
      // update prompt uses the app's sonner toaster + i18n.
      injectRegister: false,
      // Root public assets we rely on offline that aren't content-hashed.
      includeAssets: ['favicon.png', 'favicon-32x32.png', 'favicon-16x16.png', 'icons.svg', 'theme-init.js'],
      manifest: {
        name: 'vsizer',
        short_name: 'vsizer',
        description: 'RVTools / Live Optics → VMware cluster utilization deck, 100% client-side.',
        lang: 'en',
        display: 'standalone',
        theme_color: '#7e14ff',
        background_color: '#ffffff',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'favicon.png', sizes: '256x256', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Static app-shell only. The anonymized sample workbook is the one
        // .xlsx allowed (ADR-0018) so "Load a sample" works offline. No
        // runtimeCaching: the app makes zero requests carrying user data
        // (ADR-0001 / ADR-0004), so there is nothing dynamic to cache.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}', 'samples/*.xlsx'],
        globIgnores: ['**/*.map'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      // Keep the SW out of `vite dev` — avoids stale-cache vs HMR conflicts.
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@engines': resolve(__dirname, './src/engines'),
      '@components': resolve(__dirname, './src/components'),
      '@store': resolve(__dirname, './src/store'),
      '@types': resolve(__dirname, './src/types'),
      '@utils': resolve(__dirname, './src/utils'),
      '@hooks': resolve(__dirname, './src/hooks'),
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Function form keeps Rollup's discriminated union happy under
        // tsc -b (the static-object form makes TS pick the function overload
        // and reject the object literal). Path-based routing also avoids a
        // brittle list of exact package names.
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-react'
          }
          if (id.includes('node_modules/xlsx')) return 'vendor-xlsx'
          if (id.includes('node_modules/pptxgenjs')) return 'vendor-pptx'
          if (id.includes('node_modules/zustand')) return 'vendor-state'
          if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) {
            return 'vendor-i18n'
          }
          return undefined
        },
      },
    },
  },
})
