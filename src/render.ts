/**
 * SVG 描画。仕様 §6 / §7
 *
 * モデル座標（床 y=0、前方 +x、総長 1.0）から画面座標への変換は
 * すべて JS 側で済ませ、SVG には transform を掛けない。
 * group transform を使うと y 反転でテキストが裏返るため。
 */

import { DEG, K_PIVOT, type Pose, type Vec } from './geometry'
import type { Pelvis } from './pelvis'
// このファイルは上体角ラジアンを t という局所変数で使うので、別名で受ける
import { t as tr } from './i18n'

const NS = 'http://www.w3.org/2000/svg'

export const VIEW_W = 1000
export const VIEW_H = 620

/** 床の画面 y */
const FLOOR_Y = 556

/**
 * レイアウトごとのスケールと中足部の画面 x（§6：基準線は常に同じ位置）。
 * スケールは立位ゴーストの頭頂が画面上端に収まるように決めてある。
 */
const CAMERAS = {
  single: [{ s: 410, midX: 500 }],
  overlay: [{ s: 410, midX: 500 }],
  // 2体の間隔は広めに（midX 272/728 だと中央で近すぎた。指導者の指摘、Rev.10）
  side: [
    { s: 345, midX: 245 },
    { s: 345, midX: 755 },
  ],
} as const

export type Layout = keyof typeof CAMERAS

// --- 描画寸法（モデル単位） ---------------------------------------------------

/**
 * 頭と首。実測の人体比では肩峰から頭頂まで総長比 0.234、頭の半径は 0.083 ある。
 *
 * 初版はこれを 0.148 / 0.062 で描いていたため **首が存在せず頭が肩に直接乗り**、
 * 肩の高さにあるハイバーが「頭のすぐ下＝高すぎる位置」に見えていた。
 * バーの `r` は解剖学的に正しい値（肩峰 = 1.00）なので、直すべきは頭の側だった。
 */
const HEAD_R = 0.078
const HEAD_OFFSET = 0.15
const BAR_R = 0.032

/**
 * 関節の白抜き円（デッサン人形式、Rev.7）。
 * セグメントは円を貫通せず、**円の縁から縁まで**を管として引く。
 */
const JOINT_R = 0.025
const ANKLE_R = 0.019

/**
 * 鼻（Rev.8 で作り直し）。
 * 頭の円周上の弦を底辺とし、頂点だけが外へ出る小さな白抜き三角形。
 * 以前は色ベタ塗りの三角が輪郭の内側から生えていて、くちばしに見えた。
 */
const NOSE_LEN = 0.03
const NOSE_SPREAD_DEG = 14
/**
 * 鼻の向きを上体の傾きにどれだけ追従させるか。
 * 1.0（剛体）だと深いボトムで鼻が真下を向いて壊れて見える。
 * 実際の選手も上体ほどは頭を倒さない（前方の一点を見る）ので、減衰させる。
 */
const NOSE_FOLLOW = 0.45

/**
 * 靴のシルエット（Rev.7：足の線を描くのをやめ、靴の形そのものにした）。
 * かかと上端の高さは SHOE_COLLAR + h。h はヒール実寸（§4.4）なので誇張しない。
 * くさび（h の直角三角形）は靴の中に色付きで描き、その斜辺の傾きは φ に一致する。
 */
const SHOE_COLLAR = 0.03
const SHOE_TOE_T = 0.015
const SHOE_WEDGE_FILL = 0.35

/** 管の輪郭線の太さ（片側・px）と中身の色 */
const LIMB_WALL = 2.6
const LIMB_FILL = '#fff'

// --- 色（§6：良し悪しを示唆しない中間色） -----------------------------------

/**
 * スカイブルー × コーラル（Rev.8 で採用）。
 * 青×橙は色覚多様性で最も区別しやすい組。警告はコーラルとの混同を避けてバイオレット。
 */
export const COLORS = {
  bodyA: '#3b9de8',
  bodyB: '#ff8a66',
  ghost: '#d3dae1',
  floor: '#9aa5ae',
  midline: '#9aa5ae',
  warn: '#7c3aed',
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

/** 線分 a→b の両端を、それぞれ ra / rb だけ内側に詰める（関節円の縁で止めるため） */
function trimSeg(a: Vec, b: Vec, ra: number, rb: number): [Vec, Vec] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len <= ra + rb + 1e-6) return [a, b]
  const ux = dx / len
  const uy = dy / len
  return [
    { x: a.x + ux * ra, y: a.y + uy * ra },
    { x: b.x - ux * rb, y: b.y - uy * rb },
  ]
}

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
  /** 固定した体は薄く描く（§8.5） */
  readonly faded: boolean
  /**
   * 骨盤の三角（`./pelvis` の `pelvisOf`）。**省略可**。
   * 無ければ従来どおり股関節の白抜き円だけを描く。立位ゴーストには渡さない。
   */
  readonly pelvis?: Pelvis
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
  opts: {
    width: number
    opacity: number
    joints: boolean
    foot: boolean
    tube: boolean
    /** 骨盤の三角。undefined なら従来どおり股関節の白抜き円を描く */
    pelvis: Pelvis | undefined
  },
): void {
  const P = (v: Vec) => toScreen(cam, v)
  const g = { stroke: color, opacity: opts.opacity }
  const cap = { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }

  const t = pose.torsoDeg * DEG
  const up: Vec = { x: Math.sin(t), y: Math.cos(t) }
  const headModel: Vec = {
    x: pose.shoulder.x + up.x * HEAD_OFFSET,
    y: pose.shoulder.y + up.y * HEAD_OFFSET,
  }
  const head = P(headModel)

  const drawNose = () => {
    // 頭の円周上の弦を底辺に、頂点だけが外へ出る白抜きの三角。
    // 頭の後に描くので、白い塗りが弦の内側の輪郭線を消し、頭と一体に見える
    const nt = t * NOSE_FOLLOW
    const at = (angleDeg: number, r: number) => {
      const a = nt + angleDeg * DEG
      return P({ x: headModel.x + Math.cos(a) * r, y: headModel.y - Math.sin(a) * r })
    }
    out.push(
      path(
        [
          at(NOSE_SPREAD_DEG, HEAD_R),
          at(0, HEAD_R + NOSE_LEN),
          at(-NOSE_SPREAD_DEG, HEAD_R),
          at(NOSE_SPREAD_DEG, HEAD_R),
        ],
        {
          fill: LIMB_FILL,
          'fill-opacity': opts.opacity,
          stroke: color,
          'stroke-opacity': opts.opacity,
          'stroke-width': LIMB_WALL,
          'stroke-linejoin': 'round',
        },
      ),
    )
  }

  const drawBar = () => {
    // §7：背中側にあることが分かる位置に円で
    const bar = P(pose.bar)
    out.push(
      el('circle', {
        cx: bar.x,
        cy: bar.y,
        r: BAR_R * cam.s,
        fill: '#fff',
        stroke: color,
        opacity: opts.opacity,
        'stroke-width': opts.tube ? LIMB_WALL * 2 : opts.width * 1.2,
      }),
    )
  }

  if (!opts.tube) {
    // 立位ゴースト：簡素な線画のまま
    out.push(
      path([P(pose.ankle), P(pose.knee), P(pose.hip), P(pose.shoulder)], {
        ...g,
        ...cap,
        'stroke-width': opts.width,
      }),
    )
    out.push(
      path(
        [P(pose.shoulder), P({ x: headModel.x - up.x * HEAD_R, y: headModel.y - up.y * HEAD_R })],
        { ...g, ...cap, 'stroke-width': opts.width * 0.8 },
      ),
    )
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
    drawNose()
    drawBar()
    return
  }

  // --- デッサン人形式（Rev.7）：関節は独立した白抜き円、セグメントは縁から縁まで ---

  // 靴（足の線は描かず、靴のシルエットそのもの）
  if (opts.foot) {
    // 足部の座標系。つま先浮きで回転していても、heel→toe 方向を基底にすれば同じ式で描ける
    const fdx = pose.toe.x - pose.heel.x
    const fdy = pose.toe.y - pose.heel.y
    const flen = Math.hypot(fdx, fdy)
    const u: Vec = { x: fdx / flen, y: fdy / flen }
    const v: Vec = { x: -u.y, y: u.x }
    const L = pose.seg.foot
    const pt = (a: number, b: number): Vec => ({
      x: pose.heel.x + u.x * a + v.x * b,
      y: pose.heel.y + u.y * a + v.y * b,
    })

    // ヒール実寸。sin φ = h / (K_PIVOT·L_foot) なのでこれがちょうど h になる
    const h = Math.sin(pose.heelTiltDeg * DEG) * K_PIVOT * L
    const collar = SHOE_COLLAR + h

    // シルエット：かかと(床) → つま先(床) → つま先上面 → 甲（足関節の下） → かかと上端
    const silhouette = [
      pt(0, 0),
      pt(L, 0),
      pt(L * 0.97, SHOE_TOE_T),
      pt(L * 0.3, collar * 0.92),
      pt(0, collar),
      pt(0, 0),
    ]
    out.push(
      path(silhouette.map(P), {
        fill: LIMB_FILL,
        'fill-opacity': opts.opacity,
        ...g,
        'stroke-width': LIMB_WALL,
        'stroke-linejoin': 'round',
      }),
    )

    // ヒールのくさび（h の直角三角形）。フラット（h=0）では消える。
    // 斜辺の傾きは atan(h / (K_PIVOT·L)) = φ で、モデルと厳密に一致する
    if (h > 1e-9) {
      out.push(
        path([pt(0, 0), pt(K_PIVOT * L, 0), pt(0, h), pt(0, 0)].map(P), {
          fill: color,
          'fill-opacity': opts.opacity * SHOE_WEDGE_FILL,
          stroke: 'none',
        }),
      )
    }

    // 中足部の印（小さく、靴底の上）
    out.push(dot(P(pose.mid), 3.5, color))
  }

  /**
   * 股関節側の詰め量。
   *
   * 既定は関節円の半径ぶん詰める（円の縁で管を止める作法）。しかし骨盤三角を出すときは
   * 股関節の白抜き円を描かないので、詰めたままだと**大腿と上体の管の端（丸い蓋の輪郭）が
   * 三角の中に露出して、脚と上体の切れ目に見えてしまう**。三角は管より後に描くので、
   * 端を股関節の中心まで伸ばして三角の白い塗りの下へ潜り込ませる。
   */
  const hipTrim = opts.pelvis ? 0 : JOINT_R

  // セグメント：関節円の縁から縁まで。輪郭 → 白い中身の2度描きで管にする
  const segs: [Vec, Vec, number, number][] = [
    [pose.ankle, pose.knee, ANKLE_R, JOINT_R],
    [pose.knee, pose.hip, JOINT_R, hipTrim],
    // 上体は肩で止めず頭まで1本。肩の位置はバーの円が示す
    [pose.hip, headModel, hipTrim, HEAD_R],
  ]
  const trimmed = segs.map(([a, b, ra, rb]) => trimSeg(a, b, ra, rb))
  for (const [a, b] of trimmed) {
    out.push(path([P(a), P(b)], { ...g, ...cap, 'stroke-width': opts.width }))
  }
  for (const [a, b] of trimmed) {
    out.push(
      path([P(a), P(b)], {
        stroke: LIMB_FILL,
        opacity: opts.opacity,
        ...cap,
        'stroke-width': Math.max(1, opts.width - 2 * LIMB_WALL),
      }),
    )
  }

  // 骨盤三角（デッドリフト版・エラー例ページと同じ見た目）。
  // 体幹チューブの後・関節円の前に置く。塗りは他の部位と同じ白抜きなので、
  // 管より後に描けば白い塗りが管の輪郭（丸い蓋）を隠して三角が前面に出る。
  if (opts.pelvis) {
    const { psis, asis, ischium } = opts.pelvis
    out.push(
      path([P(psis), P(asis), P(ischium), P(psis)], {
        fill: LIMB_FILL,
        'fill-opacity': opts.opacity,
        ...g,
        'stroke-width': LIMB_WALL,
        'stroke-linejoin': 'round',
      }),
    )
  }

  // 関節の白抜き円（§7：解剖を知らない人に股関節の位置を示すため必須）。
  // 骨盤三角を出すときは股関節の円を**描かない**（三角が股関節の位置を兼ねる）
  if (opts.joints) {
    const joints: readonly (readonly [Vec, number])[] = opts.pelvis
      ? [
          [pose.ankle, ANKLE_R],
          [pose.knee, JOINT_R],
        ]
      : [
          [pose.ankle, ANKLE_R],
          [pose.knee, JOINT_R],
          [pose.hip, JOINT_R],
        ]
    for (const [c, r] of joints) {
      const p = P(c)
      out.push(
        el('circle', {
          cx: p.x,
          cy: p.y,
          r: r * cam.s,
          fill: LIMB_FILL,
          'fill-opacity': opts.opacity,
          ...g,
          'stroke-width': LIMB_WALL,
        }),
      )
    }
  }

  // 頭と鼻
  out.push(
    el('circle', {
      cx: head.x,
      cy: head.y,
      r: HEAD_R * cam.s,
      fill: LIMB_FILL,
      'fill-opacity': opts.opacity,
      ...g,
      'stroke-width': LIMB_WALL,
    }),
  )
  drawNose()
  drawBar()
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
  if (pose.lift === 'toe') label(P(pose.toe), tr().toeLift, 16, 20)

  if (pose.torsoWarn) {
    // 上体の中点に置くと、θ_t が 90° に近いとき上体が水平になってラベルが図と重なる。
    // 頭より上は常に空いているので、そこに逃がす。
    const t = pose.torsoDeg * DEG
    const head = P({
      x: pose.shoulder.x + Math.sin(t) * HEAD_OFFSET,
      y: pose.shoulder.y + Math.cos(t) * HEAD_OFFSET,
    })
    label({ x: head.x, y: head.y - HEAD_R * cam.s }, tr().torsoWarn, 14, -14)
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
        // `class` は左下のボタンと重なっていないかを測るための目印（`cornerfit.ts`）
        { stroke: COLORS.floor, 'stroke-width': 2, class: 'floor' },
      ),
    )
  }

  // --- 中足部の垂直基準線（§6：常に同じ位置） ---
  const midXs =
    scene.layout === 'side'
      ? CAMERAS.side.map((c) => c.midX)
      : [CAMERAS.single[0].midX]
  for (const mx of midXs) {
    // ラベルは付けない。足部の印と線が重なっていることで意味は伝わる
    out.push(
      line(
        { x: mx, y: 34 },
        { x: mx, y: FLOOR_Y + 16 },
        { stroke: COLORS.midline, 'stroke-width': 1.6 },
      ),
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
      // 足は動かないのでゴースト側では描かない（実線の足部と完全に重なるだけ）
      drawFigure(out, cam, body.ghost, COLORS.ghost, {
        width: 3,
        opacity: faded ? 0.4 : 0.85,
        joints: false,
        foot: false,
        tube: false,
        // ゴーストは簡素な線画のまま。骨盤まで描くと図がうるさくなる
        pelvis: undefined,
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
    }

    drawFigure(out, cam, body.pose, body.color, {
      width: faded ? 10.5 : 12.5,
      opacity,
      joints: true,
      foot: true,
      tube: true,
      pelvis: body.pelvis,
    })

    if (!faded) drawWarnings(out, cam, body.pose)

    // 上体角度（§6：数値表示はこれだけ）。各パネルの右下に、その体の色で描く
    const vx = ((i + 1) * VIEW_W) / panels - 40
    const vy = FLOOR_Y - 12
    out.push(
      text({ x: vx, y: vy - 44 }, tr().torsoAngle, {
        fill: '#6b7480',
        'font-size': 13,
        'text-anchor': 'end',
      }),
    )
    const val = el('text', {
      x: vx,
      y: vy,
      fill: body.color,
      'font-size': 46,
      'font-weight': 300,
      'text-anchor': 'end',
    })
    val.textContent = String(Math.round(body.pose.torsoDeg))
    const deg = document.createElementNS(NS, 'tspan')
    deg.textContent = '°'
    deg.setAttribute('font-size', '24')
    val.append(deg)
    out.push(val)
  })

  svg.replaceChildren(...out)
}
