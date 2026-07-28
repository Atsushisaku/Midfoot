import { defineConfig } from 'vitest/config'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    // 単一 HTML に inline するため、分割・アセット出力を抑止する
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    target: 'es2022',
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
})
