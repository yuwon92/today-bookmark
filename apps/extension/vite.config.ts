import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@bookmark-note/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    crx({ manifest }),
  ],
})
