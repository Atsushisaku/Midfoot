import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * デッドリフト版（`deadlift.html`）を単一 HTML として追加出力するための設定。
 *
 * なぜ設定を分けるのか:
 * `vite-plugin-singlefile` は `output.inlineDynamicImports = true` を強制するが、
 * Rollup はこれを複数エントリ（`rollupOptions.input` に 2 つ）と併用できない。
 * そのため「1 エントリずつ 2 回ビルドして、2 回目は dist を消さない」形にしている。
 * `npm run build` が本体（index.html）→ こちら（deadlift.html）の順に走る。
 */
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    // 1 回目のビルド成果物（dist/index.html とアイコン）を消さずに追記する
    emptyOutDir: false,
    rollupOptions: { input: 'deadlift.html' },
    // 以下は vite.config.ts と同じ（単一 HTML に inline するため）
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    target: 'es2022',
  },
})
