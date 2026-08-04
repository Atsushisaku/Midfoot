import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * デッドリフトの頻出エラー（`deadlift-errors.html`）を単一 HTML として追加出力する設定。
 *
 * 事情は `vite.deadlift.config.ts` と同じ。`vite-plugin-singlefile` が
 * `output.inlineDynamicImports = true` を強制し、Rollup がこれを複数エントリと
 * 併用できないので、1 エントリずつビルドして dist へ積み増していく。
 * `npm run build` は index.html → deadlift.html → こちら の順に 3 回走る。
 */
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    // 前のビルド成果物を消さずに追記する
    emptyOutDir: false,
    rollupOptions: { input: 'deadlift-errors.html' },
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    target: 'es2022',
  },
})
