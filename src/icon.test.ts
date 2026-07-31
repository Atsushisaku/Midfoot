/**
 * アイコン（SVG）の生成。仕様 §7.4
 *
 * 姿勢は目分量で描かず、**アプリ本体と同じ solvePose の解**をそのまま使う。
 * 標準体型・ハイバー・フラット・最深時（上体 36.2°）。
 * `npm run icon` で public/ に書き出す。
 */
import { it, expect } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { DEG, solvePose, type Pose, type Vec } from './geometry'
import { PRESETS } from './presets'

const SIZE = 1024
/** タイルの角丸半径（サイズ比）。iOS / Android の慣習に近い値 */
const RADIUS = 0.22
/** 図形が占める範囲（残りは余白）。小さすぎると窮屈、大きすぎると角丸に噛む */
const SAFE = 0.78

/**
 * 頭とバーはアプリ（0.078 / 0.032）より**大きく描く**。
 * 実寸比のままだとアイコンサイズでは頭が小さすぎ、四肢の折れ線が
 * 「人」ではなく「Z」に見えてしまう。頭が大きいと一目で人型として読める。
 */
const HEAD_R = 0.10
const HEAD_OFFSET = 0.15
const BAR_R = 0.042

/**
 * 線幅（モデル単位）。アプリは白抜きの管（二重線）だが、アイコンでは
 * 小さくすると二重線が潰れて塊になるので **単線** にする（指導者の「簡素化可」）。
 * 頭の円の内側が白く抜けて見える太さが上限。
 */
const STROKE = 0.044
const HALF = STROKE / 2
/** バーの円は四肢より細く。同じ太さだと半径 0.034 の円が塗り潰れる */
const BAR_STROKE = 0.028
const THIN = 0.017

interface Theme {
  readonly tile: string
  readonly border: string | null
  readonly ink: string
  readonly line: string
  /** バーの円の内側（＝タイルの色で抜く） */
  readonly hollow: string
}

/**
 * 採用（指導者判断 2026-07）：**青いタイルに白の線画、バーの円あり**。
 * 白いタイル案（tile:#fff / ink:#3b9de8 / border:#dde3ea）も作って比較したが、
 * ホーム画面やタブで地の色が付く方が見つけやすく、暗いテーマでも沈まない。
 */
const BLUE: Theme = {
  tile: '#3b9de8',
  border: null,
  ink: '#ffffff',
  line: 'rgba(255,255,255,0.55)',
  hollow: '#3b9de8',
}

function pose(): Pose {
  return solvePose({
    body: PRESETS[0]!.body,
    bar: 'high',
    shoe: 'flat',
    shankUsage: 1,
    p: 1,
  })
}

/** モデル座標（y 上向き）→ 画面座標（y 下向き）。bbox を SAFE に収めて中央へ */
function makeCam(p: Pose) {
  const t = p.torsoDeg * DEG
  const head: Vec = {
    x: p.shoulder.x + Math.sin(t) * HEAD_OFFSET,
    y: p.shoulder.y + Math.cos(t) * HEAD_OFFSET,
  }
  const minX = Math.min(p.hip.x, p.heel.x, head.x - HEAD_R) - HALF
  const maxX = Math.max(p.toe.x, p.knee.x, head.x + HEAD_R) + HALF
  const maxY = head.y + HEAD_R + HALF

  const safe = SAFE * SIZE
  const s = Math.min(safe / (maxX - minX), safe / maxY)
  const ox = (SIZE - (maxX - minX) * s) / 2 - minX * s
  const oy = (SIZE + maxY * s) / 2

  const P = (v: Vec) => ({ x: ox + v.x * s, y: oy - v.y * s })
  return { P, s, head, maxY }
}

const f = (n: number) => n.toFixed(1)

function buildIcon(theme: Theme, withBar: boolean): string {
  const p = pose()
  const { P, s, head, maxY } = makeCam(p)
  const t = p.torsoDeg * DEG

  // 上体は頭の円の縁で止める（円の中に線を突き込ませない）
  const headEdge: Vec = {
    x: head.x - Math.sin(t) * HEAD_R,
    y: head.y - Math.cos(t) * HEAD_R,
  }
  // 足は床に載る単線。ストロークの下端がちょうど y=0 に来る高さに置く
  const footY = HALF
  const heel = P({ x: p.heel.x, y: footY })
  const toe = P({ x: p.toe.x, y: footY })

  const A = P(p.ankle)
  const K = P(p.knee)
  const H = P(p.hip)
  const E = P(headEdge)
  const C = P(head)
  const B = P(p.bar)
  const mid = P({ x: p.midX, y: 0 })

  const w = f(STROKE * s)
  const r = f(RADIUS * SIZE)

  const border = theme.border
    ? `\n  <rect x="1" y="1" width="${SIZE - 2}" height="${SIZE - 2}" rx="${f(RADIUS * SIZE - 1)}" fill="none" stroke="${theme.border}" stroke-width="2"/>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" role="img" aria-label="Squat posture visualizer">
  <rect width="${SIZE}" height="${SIZE}" rx="${r}" fill="${theme.tile}"/>${border}
  <g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <line x1="${f(mid.x)}" y1="${f(P({ x: 0, y: maxY + 0.03 }).y)}" x2="${f(mid.x)}" y2="${f(P({ x: 0, y: 0 }).y)}" stroke="${theme.line}" stroke-width="${f(THIN * s)}"/>
    <path d="M${f(A.x)} ${f(A.y)}L${f(K.x)} ${f(K.y)}L${f(H.x)} ${f(H.y)}L${f(E.x)} ${f(E.y)}" stroke="${theme.ink}" stroke-width="${w}"/>
    <line x1="${f(heel.x)}" y1="${f(heel.y)}" x2="${f(toe.x)}" y2="${f(toe.y)}" stroke="${theme.ink}" stroke-width="${w}"/>
    <circle cx="${f(C.x)}" cy="${f(C.y)}" r="${f(HEAD_R * s)}" stroke="${theme.ink}" stroke-width="${w}"/>
${withBar ? `
    <circle cx="${f(B.x)}" cy="${f(B.y)}" r="${f(BAR_R * s)}" fill="${theme.hollow}" stroke="${theme.ink}" stroke-width="${f(BAR_STROKE * s)}"/>` : ''}
  </g>
</svg>
`
}

/** index.html に埋め込む data URI。base64 にして属性内のエスケープ事故を避ける */
export const iconDataUri = (svg: string): string =>
  `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`

it('アイコンを生成する', () => {
  const p = pose()
  // 図の主張が崩れていないこと：膝が足首より前、股関節は膝とほぼ同じ高さ、上体は前傾
  expect(p.knee.x).toBeGreaterThan(p.ankle.x)
  expect(Math.abs(p.hip.y - p.knee.y)).toBeLessThan(0.03)
  expect(p.torsoDeg).toBeGreaterThan(30)

  const svg = buildIcon(BLUE, true)
  writeFileSync('public/icon.svg', svg, 'utf8')

  // index.html には data URI を焼き込んである（§10：単一 HTML で完結させるため）。
  // アイコンを変えたら index.html の <link rel="icon"> も差し替えること
  expect(readFileSync('index.html', 'utf8')).toContain(iconDataUri(svg))
})
