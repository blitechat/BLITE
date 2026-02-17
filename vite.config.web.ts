import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import { resolve } from 'path'

export default defineConfig({
  root: 'src/renderer',
  envDir: __dirname,
  base: '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'shared')
    }
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: resolve(__dirname, 'tailwind.config.js') }),
        autoprefixer()
      ]
    }
  },
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
  }
})
