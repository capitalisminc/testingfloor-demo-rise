import { defineConfig } from 'vite'
import { cp } from 'node:fs/promises'

export default defineConfig({
  base: './',
  publicDir: false,
  resolve: { alias: { phaser: 'phaser/dist/phaser.js' } },
  plugins: [{
    name: 'rise-assets',
    async closeBundle () {
      await cp('assets', 'dist/assets', { recursive: true })
      await cp('LICENSE', 'dist/LICENSE')
      await cp('node_modules/phaser/license.txt', 'dist/PHASER-LICENSE.txt')
    }
  }],
  build: { chunkSizeWarningLimit: 1500 }
})
