/**
 * Midfoot のデモを Playwright で「本物の動画」として録画する。
 *
 * GIF 録画ツールと違い、操作ごとのコマ撮りではなくブラウザの描画をそのまま
 * 録るので、アプリ自身のアニメーション（再生ボタンの連続しゃがみ、
 * ボタン切替の 300ms 補間）がそのまま滑らかに入る。
 */
import { chromium } from 'playwright'

const URL = 'https://atsushisaku.github.io/Midfoot/?b=high&s=flat&d=0&m=100.100.100.20.3000'
const OUT = process.argv[2] ?? './out'

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
})
const page = await ctx.newPage()

const wait = (ms) => page.waitForTimeout(ms)
/** 深さスライダーを確実に指定値にする（再生停止位置のブレを消す） */
const setDepth = (v) =>
  page.$eval(
    '#depthRow input[type=range]',
    (el, val) => {
      el.value = String(val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    },
    v,
  )

const play = page.locator('#depthRow .playbtn')
const paneB = page.locator('.panes .pane').nth(1)

await page.goto(URL, { waitUntil: 'networkidle' })
await wait(800)

// --- 1. 標準体型で1往復しゃがむ（アプリの自動再生をそのまま使う） ---
await play.click()
await wait(3000) // 下降1.2 + 静止0.3 + 上昇1.2 + 静止0.3 = 1周
await wait(1500) // 2周目の下降途中まで
await play.click() // 停止
await setDepth(1) // ボトムで揃える
await wait(700)

// --- 2. 比較モードへ。右だけ体格を変える ---
await page.locator('#compareBtn').click()
await wait(900)
await paneB.locator('.seg.presets button[data-v="long-femur"]').click()
await wait(1600) // 34° vs 51° を見せる

// --- 3. 2体で同時にしゃがむ ---
await play.click()
await wait(3000)
await play.click()
await setDepth(1)
await wait(600)

// --- 4. 右だけローバーに。最後に静止して締める ---
await paneB.locator('.tool-section button[data-v="low"]').click()
await wait(2400)

await ctx.close()
await browser.close()
console.log('done')
