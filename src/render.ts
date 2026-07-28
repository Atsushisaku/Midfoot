/**
 * SVG 描画。仕様 §6 / §7
 *
 * モデル座標（床 y=0、前方 +x、総長 1.0）から画面座標への変換は
 * すべて JS 側で済ませ、SVG には transform を掛けない。
 * group transform を使うと y 反転でテキストが裏返るため。
 */

import { DEG, K_PIVOT, type Pose, type Vec } from './geometry'

const NS = 'http://www.w3.org/2000/svg'

export const VIEW_W = 1000
export const VIEW_H = 620

/** 床の画面 y */
const FLOOR_Y = 556

/** レイアウトごとのスケールと中足部の画面 x（§6：基準線は常に同じ位置） */
const CAMERAS = {
  single: [{ s: 430, midX: 500 }],
  overlay: [{ s: 430, midX: 500 }],
  side: [
    { s: 360, midX: 272 },
    { s: 360, midX: 728 },
  ],
} as const

export type Layout = keyof typeof CAMERAS

// --- 描画寸法（モデル単位） ---------------------------------------------------

const HEAD_R = 0.062
const HEAD_OFFSET = 0.086
const BAR_R = 0.032
const DOT_R = 0.012
const MID_MARK_R = 0.013

// --- 色（§6：良し悪しを示唆しない中間色） -----------------------------------

export const COLORS = {
  bodyA: '#1f7a8c',
  bodyB: '#7b5ea7',
  ghost: '#ced4da',
  floor: '#8b939c',
  midline: '#7a828b',
  warn: '#a26b00',
} as const

// ---------------------------------------------------------------------------

interface Cam {
  readonly ox: number
  readonly oy: number
  readonly s: number
}

function makeCam(layout: Layout, index: number, pose: Pose): Cam {
  const cams = CAMERAS[layout]
  const c = cams[Math.min(index, cams.length - 1)]!
  // 中足部が常に同じ画面 x に来るよう原点をずらす。体格を変えても線は動かない。
  return { ox: c.midX - pose.midX * c.s, oy: FLOOR_Y, s: c.s }
}

const toScreen = (cam: Cam, v: Vec): Vec => ({ x: cam.ox + v.x * cam.s, y: cam.oy - v.y * cam.s })

const lerpVec = (a: Vec, b: Vec, k: number): Vec => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
})

function el(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

function line(a: Vec, b: Vec, attrs: Record<string, string | number>): SVGElement {
  return el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, ...attrs })
}

function path(pts: readonly Vec[], attrs: Record<string, string | number>): SVGElement {
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
  return el('path', { d, fill: 'none', ...attrs })
}

function dot(c: Vec, r: number, fill: string): SVGElement {
  return el('circle', { cx: c.x, cy: c.y, r, fill })
}

function text(
  c: Vec,
  s: string,
  attrs: Record<string, string | number> = {},
): SVGElement {
  const node = el('text', { x: c.x, y: c.y, ...attrs })
  node.textContent = s
  return node
}

// ---------------------------------------------------------------------------

export interface SceneBody {
  readonly pose: Pose
  /** 立位ゴースト（§4.9）。null なら描かない */
  readonly ghost: Pose | null
  /** バーの軌跡（§8.2）。モデル座標 */
  readonly trail: readonly Vec[]
  readonly color: string
  readonly label: string
  /** 固定した体は薄く描く（§8.5） */
  readonly faded: boolean
}

export interface Scene {
  readonly layout: Layout
  readonly bodies: readonly SceneBody[]
  /** 注記や警告を表示するか */
  readonly showIpfLine: boolean
}

// ---------------------------------------------------------------------------

function drawFigure(
  out: SVGElement[],
  cam: Cam,
  pose: Pose,
  color: string,
  opts: { width: number; opacity: number; joints: boolean },
): void {
  const P = (v: Vec) => toScreen(cam, v)
  const g = { stroke: color, opacity: opts.opacity }
  const cap = { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }

  // 足部（かかと → 中足骨頭 → つま先）
  out.push(
    path([P(pose.heel), P(pose.ball), P(pose.toe)], {
      ...g,
      ...cap,
      'stroke-width': opts.width,
    }),
  )

  // 足関節から足裏へ下ろす短い線。これがないと足関節が宙に浮いて見える
  // 足部が回転していても、線分上の比率は回転で保たれるので未回転の比で引ける
  const underAnkle = lerpVec(pose.heel, pose.ball, pose.ankle.x / (K_PIVOT * pose.seg.foot))
  out.push(
    path([P(pose.ankle), P(underAnkle)], {
      ...g,
      ...cap,
      'stroke-width': opts.width * 0.72,
    }),
  )

  // 脚と上体
  out.push(
    path([P(pose.ankle), P(pose.knee), P(pose.hip), P(pose.shoulder)], {
      ...g,
      ...cap,
      'stroke-width': opts.width,
    }),
  )

  // 頭
  const t = pose.torsoDeg * DEG
  const head = P({
    x: pose.shoulder.x + Math.sin(t) * HEAD_OFFSET,
    y: pose.shoulder.y + Math.cos(t) * HEAD_OFFSET,
  })
  out.push(
    el('circle', {
      cx: head.x,
      cy: head.y,
      r: HEAD_R * cam.s,
      fill: 'none',
      ...g,
      'stroke-width': opts.width,
    }),
  )

  if (opts.joints) {
    // 関節の丸ポチ（§7：解剖を知らない人に股関節の位置を示すため必須）
    for (const j of [pose.ankle, pose.knee, pose.hip, pose.shoulder]) {
      out.push(dot(P(j), DOT_R * cam.s, color))
    }
    // 中足部の印。足裏の線と同色だと埋もれるので白抜きにする
    const mid = P(pose.mid)
    out.push(
      el('circle', {
        cx: mid.x,
        cy: mid.y,
        r: MID_MARK_R * cam.s,
        fill: '#fff',
        stroke: color,
        opacity: opts.opacity,
        'stroke-width': 2,
      }),
    )
  }

  // バー（§7：背中側にあることが分かる位置に円で）。
  // ハイバーでは肩の丸ポチとほぼ重なるので、白抜き＋太い輪郭で別物と分かるようにする
  const bar = P(pose.bar)
  out.push(
    el('circle', {
      cx: bar.x,
      cy: bar.y,
      r: BAR_R * cam.s,
      fill: '#fff',
      stroke: color,
      opacity: opts.opacity,
      'stroke-width': opts.width * 1.2,
    }),
  )
}

function drawWarnings(out: SVGElement[], cam: Cam, pose: Pose): void {
  const P = (v: Vec) => toScreen(cam, v)
  const label = (at: Vec, s: string, dx: number, dy: number) => {
    out.push(
      text({ x: at.x + dx, y: at.y + dy }, s, {
        fill: COLORS.warn,
        'font-size': 15,
        'font-weight': 600,
        'text-anchor': dx < 0 ? 'end' : 'start',
      }),
    )
  }

  // 「背屈が足りない」状態は、脛前傾角を可動域の比率で持つようになったので
  // 独立した警告としては存在しない。可動域が足りなければ股関節が後ろに残り、
  // 「つま先が浮く」として図に出る。
  if (pose.lift === 'toe') label(P(pose.toe), 'つま先が浮く', 16, 20)

  if (pose.torsoWarn) {
    // 上体の中点に置くと、θ_t が 90° に近いとき上体が水平になってラベルが図と重なる。
    // 頭より上は常に空いているので、そこに逃がす。
    const t = pose.torsoDeg * DEG
    const head = P({
      x: pose.shoulder.x + Math.sin(t) * HEAD_OFFSET,
      y: pose.shoulder.y + Math.cos(t) * HEAD_OFFSET,
    })
    label({ x: head.x, y: head.y - HEAD_R * cam.s }, '現実的でない前傾', 14, -14)
  }
}

// ---------------------------------------------------------------------------

export function renderScene(svg: SVGSVGElement, scene: Scene): void {
  const out: SVGElement[] = []
  const cams = scene.bodies.map((b, i) => makeCam(scene.layout, i, b.pose))

  // --- 床 ---
  const panels = scene.layout === 'side' ? 2 : 1
  for (let i = 0; i < panels; i++) {
    const half = VIEW_W / panels
    out.push(
      line(
        { x: i * half + 30, y: FLOOR_Y },
        { x: (i + 1) * half - 30, y: FLOOR_Y },
        { stroke: COLORS.floor, 'stroke-width': 2 },
      ),
    )
  }

  // --- 中足部の垂直基準線（§6：常に同じ位置） ---
  const midXs =
    scene.layout === 'side'
      ? CAMERAS.side.map((c) => c.midX)
      : [CAMERAS.single[0].midX]
  for (const mx of midXs) {
    out.push(
      line(
        { x: mx, y: 34 },
        { x: mx, y: FLOOR_Y + 16 },
        { stroke: COLORS.midline, 'stroke-width': 1.6 },
      ),
    )
    out.push(
      text({ x: mx, y: FLOOR_Y + 34 }, '中足部', {
        fill: COLORS.midline,
        'font-size': 13,
        'text-anchor': 'middle',
      }),
    )
  }

  // --- 体ごと ---
  scene.bodies.forEach((body, i) => {
    const cam = cams[i]!
    const faded = body.faded
    // 重ねたとき、固定した体は「後ろにある」と分かる程度に留める。
    // 薄くしすぎると脚が操作中の体に完全に隠れて比較にならない
    const opacity = faded ? 0.8 : 1

    // 立位ゴースト
    if (body.ghost) {
      drawFigure(out, cam, body.ghost, COLORS.ghost, {
        width: 3,
        opacity: faded ? 0.4 : 0.85,
        joints: false,
      })
    }

    // バーの軌跡（§8.2：常に垂直線上を動くことを見せる）
    for (const v of body.trail) {
      const p = toScreen(cam, v)
      out.push(
        el('circle', {
          cx: p.x,
          cy: p.y,
          r: BAR_R * cam.s,
          fill: 'none',
          stroke: body.color,
          opacity: (faded ? 0.08 : 0.15).toFixed(2),
          'stroke-width': 1.8,
        }),
      )
    }

    // IPF 合格ライン（§4.7）
    if (scene.showIpfLine) {
      const y = FLOOR_Y - body.pose.ipfLineY * cam.s
      const left = toScreen(cam, { x: -0.30, y: 0 }).x
      const right = toScreen(cam, { x: 0.34, y: 0 }).x
      out.push(
        line(
          { x: left, y },
          { x: right, y },
          {
            stroke: body.color,
            'stroke-width': 1.6,
            'stroke-dasharray': i === 1 ? '3 5' : '9 6',
            opacity: 0.75,
          },
        ),
      )
      out.push(
        text({ x: right + 6, y: y + 4 }, 'IPF', {
          fill: body.color,
          'font-size': 12,
          opacity: 0.85,
        }),
      )
    }

    drawFigure(out, cam, body.pose, body.color, {
      width: faded ? 3.5 : 5,
      opacity,
      joints: true,
    })

    if (!faded) drawWarnings(out, cam, body.pose)
  })

  svg.replaceChildren(...out)
}
