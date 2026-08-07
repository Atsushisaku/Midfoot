/**
 * デッドリフト版の SVG 描画。仕様 docs/deadlift-proto-spec.md §8
 *
 * `../render` を DL 用に作り直したもの。座標変換の方針（モデル座標から画面座標への
 * 変換をすべて JS 側で済ませ、SVG には transform を掛けない。group transform は
 * y 反転でテキストが裏返るため）と、管状セグメント・関節の白抜き円・靴のシルエット
 * といった描画の作法はスクワット版と同じにしてある。
 *
 * 削ったもの: IPF ライン・担ぎバー（肩の円）・立位ゴースト・バーの軌跡・つま先浮き警告。
 * 足したもの: プレート円盤・腕（肩→バー）・肩関節の白抜き円。
 */

import { DEG, type Vec } from '../geometry'
import type { Pelvis } from '../pelvis'
import type { DlPose } from './geometry'
// このファイルは上体角ラジアンを局所変数で使うので、文言は別名で受ける
import { t as tr } from './strings'

const NS = 'http://www.w3.org/2000/svg'

export const VIEW_W = 1000
export const VIEW_H = 620

/** 床の画面 y */
const FLOOR_Y = 556

/**
 * レイアウトごとのスケールと中足部の画面 x（基準線は常に同じ位置）。
 * スクワット版と同じ値。ロックアウトの頭頂は総長比で約 1.27（肩ピンは体格に
 * よらずほぼ 1.04 に収束する）なので、立位ゴーストを収める前提で決めた
 * スクワット版のスケールがそのまま使える。
 */
const CAMERAS = {
  single: [{ s: 410, midX: 500 }],
  side: [
    { s: 345, midX: 245 },
    { s: 345, midX: 755 },
  ],
} as const

export type DlLayout = keyof typeof CAMERAS

// --- 描画寸法（モデル単位） ---------------------------------------------------

/** 頭と首。スクワット版と同じ実測比（肩峰から頭頂まで 0.234、頭の半径 0.083 相当） */
const HEAD_R = 0.078
const HEAD_OFFSET = 0.15

/** 関節の白抜き円。セグメントは円を貫通せず、円の縁から縁まで管として引く */
const JOINT_R = 0.025
const ANKLE_R = 0.019

/** バー軸（シャフトの断面）の点。腕はこの縁で止める */
const BAR_AXIS_R = 0.014

/** 鼻。頭の円周上の弦を底辺とし、頂点だけが外へ出る小さな白抜き三角形 */
const NOSE_LEN = 0.03
const NOSE_SPREAD_DEG = 14
/**
 * 鼻の向きを上体の傾きにどれだけ追従させるか。
 * 1.0（剛体）だと深い前傾で鼻が真下を向いて壊れて見える。
 * 実際の選手も上体ほどは頭を倒さない（前方の一点を見る）ので、減衰させる。
 */
const NOSE_FOLLOW = 0.45

/**
 * 靴のシルエット。デッドリフトではヒールの高さを扱わない（フラット固定）ので、
 * かかと上端の高さは SHOE_COLLAR そのもの。足部も回転しないため床に平行に描く。
 */
const SHOE_COLLAR = 0.03
const SHOE_TOE_T = 0.015

/** 管の輪郭線の太さ（片側・px）と中身の色 */
const LIMB_WALL = 2.6
const LIMB_FILL = '#fff'

/**
 * 首と腕は胴・脚より細く描く（本体の太さに対する比）。
 * Rev.2-3: 初版の 0.62 / 0.5 は実機で見ると針金のように細かったので太くした。
 */
const NECK_RATIO = 0.75
const ARM_RATIO = 0.72

/**
 * 上から見た足（プランビュー、Rev.7）。床線の下に置き、つま先の向き＝スタンスの
 * 開き角 β を示す。矢状面の図には前額面の開きを描けないので、これが唯一の手掛かりになる。
 * 単位は px（体格やレイアウトで大きさを変えない）。
 * β=0 で真上（＝画面の奥）を向き、β が増えるほどつま先が右（外）へ回る。
 */
const FOOT_PLAN_HALF_LEN = 11
const FOOT_PLAN_HEEL_HALF_W = 4
/** つま先側はかかとより少し広い（足の形として自然に見せるため） */
const FOOT_PLAN_TOE_HALF_W = 4.8
/**
 * 床線から足型の中心までの距離。中足部の垂線の下端（FLOOR_Y+16）のすぐ先に
 * つま先が来る位置に置くと、線が足型を貫かず「線の延長上に足がある」ように見える。
 */
const FOOT_PLAN_GAP = 26
const FOOT_PLAN_FILL = 0.12

/**
 * 腕を脚の内側（奥）に描くかどうかの境目（度、Rev.7）。
 * ナロー（コンベンショナル）では手は脚の外側を握るので腕が手前に来る。
 * これより開いていれば（スモウ）手は脚の間なので、腕は脚に隠れる。
 */
const ARM_INSIDE_STANCE_DEG = 6

/**
 * 肩→バーの直線上での肘の位置（Rev.7-c）。
 * 上腕 0.186H : 前腕+手 0.196H（Winter）から、肩側から 48% の点を肘とみなす。
 * 内側に入るのは肘から先だけで、上腕は常に体側（最前面）に描く。
 */
const ARM_ELBOW_FRAC = 0.48

/** プレート円盤の塗りの濃さ。中の身体が透けて見える程度に留める */
const PLATE_FILL = 0.12

// --- 色（スクワット版と同じ。良し悪しを示唆しない中間色） ---------------------

export const COLORS = {
  bodyA: '#3b9de8',
  bodyB: '#ff8a66',
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

function makeCam(layout: DlLayout, index: number, pose: DlPose): Cam {
  const cams = CAMERAS[layout]
  const c = cams[Math.min(index, cams.length - 1)]!
  // 中足部が常に同じ画面 x に来るよう原点をずらす。体格を変えても基準線は動かない。
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

function text(c: Vec, s: string, attrs: Record<string, string | number> = {}): SVGElement {
  const node = el('text', { x: c.x, y: c.y, ...attrs })
  node.textContent = s
  return node
}

// ---------------------------------------------------------------------------

export interface SceneBody {
  readonly pose: DlPose
  readonly color: string
  /**
   * スタンスの開き角（度）。幾何には `pose` を通じて既に入っているが、描画では
   * 「つま先の向き」と「腕が脚の手前か奥か」という**矢状面には現れない情報**に
   * 使うので、補間後の生値を別途受け取る（Rev.7）。
   */
  readonly stanceDeg: number
  /**
   * 体幹（股→肩）を折れ線で描くための脊柱の点列（`./spine` の `lumbarSpineOf`）。
   * **省略可**。無ければ従来どおり直線の体幹を描く。
   */
  readonly spine?: readonly Vec[]
  /**
   * 骨盤の三角（`../pelvis` の `pelvisOf`）。**省略可**。
   * 無ければ従来どおり股関節の白抜き円だけを描く。
   */
  readonly pelvis?: Pelvis
}

export interface Scene {
  readonly layout: DlLayout
  readonly bodies: readonly SceneBody[]
}

// ---------------------------------------------------------------------------

/**
 * プレート円盤（仕様 §8）。バー中心に半径 plateR の円を描く。
 * 半径はセッティングで固定なので、t=0 では床に接地し、挙上すると円盤ごと浮く。
 * 身体より先に描いて背面に置く。
 */
function drawPlate(out: SVGElement[], cam: Cam, pose: DlPose, color: string): void {
  const bar = toScreen(cam, pose.bar)
  out.push(
    el('circle', {
      cx: bar.x,
      cy: bar.y,
      r: pose.plateR * cam.s,
      fill: color,
      'fill-opacity': PLATE_FILL,
      stroke: color,
      'stroke-width': 2,
    }),
  )
  out.push(dot(bar, BAR_AXIS_R * cam.s, color))
}

/**
 * 上から見た足（Rev.7）。中足部の真下に、開き角 β だけ回した足型を描く。
 * かかと側とつま先側を半円で閉じた角丸の細長い形。
 *
 * 円弧なので回転しても `A r r 0 0 1` の指定はそのまま使える（真円の弧は
 * 回転で形が変わらず、端点だけが動く）。
 */
function drawFootPlan(
  out: SVGElement[],
  cam: Cam,
  pose: DlPose,
  stanceDeg: number,
  color: string,
): void {
  const beta = stanceDeg * DEG
  // u = かかと→つま先。β=0 で画面の上（＝奥）を向き、β とともに右（外）へ倒れる
  const u: Vec = { x: Math.sin(beta), y: -Math.cos(beta) }
  // v = u を画面上で +90°（時計回り）回した向き。足の右側
  const v: Vec = { x: -u.y, y: u.x }

  const cx = cam.ox + pose.midX * cam.s
  const cy = FLOOR_Y + FOOT_PLAN_GAP
  const at = (a: number, b: number): Vec => ({ x: cx + u.x * a + v.x * b, y: cy + u.y * a + v.y * b })

  const wh = FOOT_PLAN_HEEL_HALF_W
  const wt = FOOT_PLAN_TOE_HALF_W
  const heel = FOOT_PLAN_HALF_LEN - wh
  const toe = FOOT_PLAN_HALF_LEN - wt

  const p1 = at(-heel, wh) // かかと右
  const p2 = at(-heel, -wh) // かかと左（半円で回り込む）
  const p3 = at(toe, -wt) // つま先左
  const p4 = at(toe, wt) // つま先右（半円で回り込む）
  const f = (n: number) => n.toFixed(2)
  out.push(
    el('path', {
      d:
        `M${f(p1.x)} ${f(p1.y)} A${wh} ${wh} 0 0 1 ${f(p2.x)} ${f(p2.y)} ` +
        `L${f(p3.x)} ${f(p3.y)} A${wt} ${wt} 0 0 1 ${f(p4.x)} ${f(p4.y)} Z`,
      fill: color,
      'fill-opacity': FOOT_PLAN_FILL,
      stroke: color,
      'stroke-width': 1,
      'stroke-linejoin': 'round',
    }),
  )
}

function drawFigure(
  out: SVGElement[],
  cam: Cam,
  pose: DlPose,
  color: string,
  width: number,
  stanceDeg: number,
  spine: readonly Vec[] | undefined,
  pelvis: Pelvis | undefined,
): void {
  const P = (v: Vec) => toScreen(cam, v)
  const g = { stroke: color }
  const cap = { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }

  const lean = pose.torsoDeg * DEG
  const up: Vec = { x: Math.sin(lean), y: Math.cos(lean) }
  const headModel: Vec = {
    x: pose.shoulder.x + up.x * HEAD_OFFSET,
    y: pose.shoulder.y + up.y * HEAD_OFFSET,
  }

  /**
   * 腕（肩→バー、直線1本）を区間で描く。輪郭 → 白い中身の2度描きで管にする。
   * 前後関係で描く位置が変わるので関数にしてある（Rev.7）。
   */
  const [armTop, armEnd] = trimSeg(pose.shoulder, pose.bar, JOINT_R, BAR_AXIS_R)
  const armAt = (f: number): Vec => ({
    x: armTop.x + (armEnd.x - armTop.x) * f,
    y: armTop.y + (armEnd.y - armTop.y) * f,
  })
  const drawArm = (from: Vec, to: Vec) => {
    const w = width * ARM_RATIO
    out.push(path([P(from), P(to)], { ...g, ...cap, 'stroke-width': w }))
    out.push(
      path([P(from), P(to)], {
        stroke: LIMB_FILL,
        ...cap,
        'stroke-width': Math.max(1, w - 2 * LIMB_WALL),
      }),
    )
  }

  /**
   * 奥にある区間の「隠れ線」（Rev.7-b）。製図と同じ流儀で、脚に隠れた腕を細い破線で示す。
   *
   * スモウでは腕と脚がほぼ同じ線上に来るので、単に奥へ回すと腕が脚の白い中身に
   * 完全に呑まれて「腕のない図」になってしまう。奥にあることは保ったまま経路を
   * 読めるようにするため、すべてを描いたあとに薄い破線を重ねる。
   */
  const drawArmHidden = (from: Vec, to: Vec) => {
    out.push(
      path([P(from), P(to)], {
        ...g,
        ...cap,
        'stroke-width': 2,
        'stroke-dasharray': '5 4',
        opacity: 0.55,
      }),
    )
  }

  // ナローでは手は脚の外側＝腕全体が手前。スモウでは手だけが脚の間に入る（Rev.7-c）。
  //
  // 肩は体幹の外側にあるので、**上腕は開き方によらず常に体側＝最前面**。
  // 内側に入るのは肘から先だけなので、腕を肘で分けて前後を別々に扱う。
  // 肘の位置は上腕:前腕+手 ≈ 0.186:0.196（Winter）から腕長の 48% とする。
  const armInFront = stanceDeg < ARM_INSIDE_STANCE_DEG
  const elbow = armAt(ARM_ELBOW_FRAC)
  // 奥に回る前腕は身体より先に描き、脚の管・関節円・靴に隠させる
  if (!armInFront) drawArm(elbow, armEnd)

  // --- 靴（足の線は描かず、靴のシルエットそのもの）---
  // デッドリフトでは足部が回転しないので、かかとを原点に床と平行な座標で描ける。
  // ただしスタンスを開くと足は視聴者側へ回るので、**中足部を中心に cos β 倍へ縮める**
  // （Rev.7 の描画上の見なし。モデル座標の heel/toe/mid は動かさない）
  const L = pose.seg.foot
  const shrink = Math.cos(stanceDeg * DEG)
  const midXLocal = pose.mid.x - pose.heel.x
  const pt = (a: number, b: number): Vec => ({
    x: pose.heel.x + midXLocal + (a - midXLocal) * shrink,
    y: pose.heel.y + b,
  })
  const silhouette = [
    pt(0, 0),
    pt(L, 0),
    pt(L * 0.97, SHOE_TOE_T),
    pt(L * 0.3, SHOE_COLLAR * 0.92),
    pt(0, SHOE_COLLAR),
    pt(0, 0),
  ]
  out.push(
    path(silhouette.map(P), {
      fill: LIMB_FILL,
      ...g,
      'stroke-width': LIMB_WALL,
      'stroke-linejoin': 'round',
    }),
  )
  // 中足部の印（小さく、靴底の上）
  out.push(dot(P(pose.mid), 3.5, color))

  // --- 身体のセグメント：関節円の縁から縁まで。輪郭 → 白い中身の2度描きで管にする ---
  const tube = (a: Vec, b: Vec, ra: number, rb: number, w: number): [readonly Vec[], number] => [
    trimSeg(a, b, ra, rb),
    w,
  ]
  /**
   * 股関節側の詰め量。
   *
   * 既定は関節円の半径ぶん詰める（円の縁で管を止める作法）。しかし骨盤三角を出すときは
   * 股関節の白抜き円を描かないので、詰めたままだと**大腿の管の端（丸い蓋の輪郭）が
   * 三角の中に露出して、脚と上体の切れ目に見えてしまう**。三角は管より後に描くので、
   * 端を股関節の中心まで伸ばして三角の白い塗りの下へ潜り込ませる。
   */
  const hipTrim = pelvis ? 0 : JOINT_R
  /**
   * 体幹だけは、腰椎の丸みを描くときに直線ではなく折れ線にする。
   * **端のトリムはしない**。曲線の両端を関節円の半径だけ詰めるには弧長で辿る必要があり、
   * そこまでする意味がない。あとから描く関節の白抜き円（と骨盤三角）が端を覆うので
   * 見た目は同じになる。
   */
  const torso: [readonly Vec[], number] = spine
    ? [spine, width]
    : tube(pose.hip, pose.shoulder, hipTrim, JOINT_R, width)
  const segs: [readonly Vec[], number][] = [
    tube(pose.ankle, pose.knee, ANKLE_R, JOINT_R, width),
    tube(pose.knee, pose.hip, JOINT_R, hipTrim, width),
    // 上体は肩で止める（DL では肩がバーとの接続点なので明示する）。頭へは首でつなぐ
    torso,
    tube(pose.shoulder, headModel, JOINT_R, HEAD_R, width * NECK_RATIO),
  ]
  for (const [pts, w] of segs) {
    out.push(path(pts.map(P), { ...g, ...cap, 'stroke-width': w }))
  }
  for (const [pts, w] of segs) {
    out.push(
      path(pts.map(P), {
        stroke: LIMB_FILL,
        ...cap,
        'stroke-width': Math.max(1, w - 2 * LIMB_WALL),
      }),
    )
  }

  // --- 骨盤三角 ---
  // 体幹チューブの後・関節円の前に置く。塗りは**他の部位と同じ白抜き**なので、
  // 管より後に描けば白い塗りが管の輪郭（丸い蓋）を隠して三角が前面に出る。
  if (pelvis) {
    out.push(
      path([P(pelvis.psis), P(pelvis.asis), P(pelvis.ischium), P(pelvis.psis)], {
        fill: LIMB_FILL,
        ...g,
        'stroke-width': LIMB_WALL,
        'stroke-linejoin': 'round',
      }),
    )
  }

  // --- 関節の白抜き円（解剖を知らない人に股関節・肩の位置を示すため必須）---
  // 骨盤三角を出すときは股関節の円を**描かない**。三角が股関節の位置を兼ね、
  // 円を重ねるとかえってうるさいため（2026-08-07 確定）。
  const joints: readonly (readonly [Vec, number])[] = pelvis
    ? [
        [pose.ankle, ANKLE_R],
        [pose.knee, JOINT_R],
        [pose.shoulder, JOINT_R],
      ]
    : [
        [pose.ankle, ANKLE_R],
        [pose.knee, JOINT_R],
        [pose.hip, JOINT_R],
        [pose.shoulder, JOINT_R],
      ]
  for (const [c, r] of joints) {
    const p = P(c)
    out.push(
      el('circle', { cx: p.x, cy: p.y, r: r * cam.s, fill: LIMB_FILL, ...g, 'stroke-width': LIMB_WALL }),
    )
  }

  // --- 頭と鼻 ---
  const head = P(headModel)
  out.push(
    el('circle', {
      cx: head.x,
      cy: head.y,
      r: HEAD_R * cam.s,
      fill: LIMB_FILL,
      ...g,
      'stroke-width': LIMB_WALL,
    }),
  )
  // 頭の円周上の弦を底辺に、頂点だけが外へ出る白抜きの三角。
  // 頭の後に描くので、白い塗りが弦の内側の輪郭線を消し、頭と一体に見える
  const nt = lean * NOSE_FOLLOW
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
        ...g,
        'stroke-width': LIMB_WALL,
        'stroke-linejoin': 'round',
      },
    ),
  )

  // 手前の腕は最後に描く。膝の白抜き円や靴と重なる所では腕が勝つ（実際に手前にある）。
  // 奥に回すときも上腕だけは常にここで描くので、肩から肘までは必ず体の手前に出る
  if (armInFront) drawArm(armTop, armEnd)
  else {
    drawArm(armTop, elbow)
    drawArmHidden(elbow, armEnd)
  }
}

/** 到達不能（仕様 §3-6）の注意表示。スクワット版 drawWarnings と同じ流儀 */
function drawWarnings(out: SVGElement[], cam: Cam, pose: DlPose): void {
  if (pose.warn !== 'reach') return
  // 上体の中点に置くと前傾が深いときラベルが図と重なる。頭より上は常に空いている。
  const lean = pose.torsoDeg * DEG
  const head = toScreen(cam, {
    x: pose.shoulder.x + Math.sin(lean) * HEAD_OFFSET,
    y: pose.shoulder.y + Math.cos(lean) * HEAD_OFFSET,
  })
  out.push(
    text({ x: head.x + 14, y: head.y - HEAD_R * cam.s - 14 }, tr().reachWarn, {
      fill: COLORS.warn,
      'font-size': 15,
      'font-weight': 600,
      'text-anchor': 'start',
    }),
  )
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

  // --- 中足部の垂直基準線（常に同じ位置）---
  const midXs = scene.layout === 'side' ? CAMERAS.side.map((c) => c.midX) : [CAMERAS.single[0].midX]
  for (const mx of midXs) {
    out.push(
      line({ x: mx, y: 34 }, { x: mx, y: FLOOR_Y + 16 }, { stroke: COLORS.midline, 'stroke-width': 1.6 }),
    )
  }

  // --- 体ごと ---
  scene.bodies.forEach((body, i) => {
    const cam = cams[i]!
    drawPlate(out, cam, body.pose, body.color)
    drawFigure(out, cam, body.pose, body.color, 12.5, body.stanceDeg, body.spine, body.pelvis)
    drawFootPlan(out, cam, body.pose, body.stanceDeg, body.color)
    drawWarnings(out, cam, body.pose)

    // 背角（数値表示はこれだけ）。各パネルの右下に、その体の色で描く
    const vx = ((i + 1) * VIEW_W) / panels - 40
    const vy = FLOOR_Y - 12
    out.push(
      text({ x: vx, y: vy - 44 }, tr().backAngle, {
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
    val.textContent = String(Math.round(body.pose.backHorizDeg))
    const deg = document.createElementNS(NS, 'tspan')
    deg.textContent = '°'
    deg.setAttribute('font-size', '24')
    val.append(deg)
    out.push(val)
  })

  svg.replaceChildren(...out)
}
