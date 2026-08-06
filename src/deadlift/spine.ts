/**
 * 骨盤・腰椎の丸まりの描画モデル。
 *
 * `./geometry` と同じ規約: 純関数のみ・DOM に一切触れない。**ソルバは触らない**
 * （丸まりは描画層の話で、姿勢そのものは体幹を剛体として解いたままにする）。
 *
 * 核心のモデルは「前屈は股関節で曲がる量 ＋ 腰椎で曲がる量の合計」。ソルバ
 * （`solveDlPose`）は体幹を剛体として解くので、そこから出る股関節屈曲角
 * φ_apparent は**見かけの**値でしかない。実際の股関節屈曲は可動域 ROM で頭打ちになり、
 * 超過分 κ_A = max(0, φ_apparent − ROM) は腰椎の屈曲に回る。
 *
 * つまり骨盤は可動域の端で止まり（＝起きたまま）、腰椎だけが κ 曲がって上体が前へ届く。
 * これが「骨盤が立ちすぎて腰部が丸まる」の絵になる。
 *
 * κ_A はエラーではなく**体格の関数**として出る。効くのは主に**腕の短さ**（t=0 実測で
 * ROM120 のとき 腕短 16.3° / 標準 7.0° / 腕長 0°）、次いで体幹の長さ（long-torso 8.3°）。
 * 大腿長プリセットはむしろ標準より小さい（5.4°）——プリセットが体幹を 0.92 倍に
 * 縮めるぶん股関節位置が高くなり、要求される前屈が浅くなるため。
 * 「大腿が長い人は丸まりやすい」という通説はハム張力の経路（§11.4）の話で、
 * 可動域の経路であるこの κ_A とは別。
 * 「丸まりやすさは体格で変わる」という Midfoot の主題そのものなので、本編の
 * 身体的特徴として持たせる。
 *
 * エラー由来の丸まり（経路B）は**エラー例ページ専用**なので `../error/kappa` に置き、
 * ここへは `SpineOptions.kappaExtraDeg` として合流させる（本編が error 配下へ依存する
 * 向きは作らない）。
 */

import { DEG, clamp, type Vec } from '../geometry'
import { pelvisOf, type Pelvis } from '../pelvis'
import { CM_PER_UNIT, type DlPose } from './geometry'

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/**
 * 股関節屈曲の可動域の 3 択（度）。硬め／標準／柔らかめ。
 * 膝屈曲位（ハムストリングスの張力が抜けた状態）での股関節屈曲 ROM の**集団代表値**で、
 * 個人の実測値ではない。膝伸展位ならこれより 20〜30° 小さくなるが、
 * デッドリフトの構えは膝が曲がっているのでこちらを採る。
 */
export const ROM_LEVELS: readonly number[] = [110, 120, 130]

/**
 * スタンス開き 1° あたりの ROM 増加（度）。**見なし値**（文献の実測係数ではない）。
 * 股関節を外旋・外転させると大腿骨頸部が寛骨臼の縁を避けるので、屈曲の余地が増える
 * （スモウで骨盤が起こしやすいことの説明）。効果の向きだけを入れた粗い係数。
 */
export const ROM_STANCE_COEF = 0.3

/**
 * 体幹（股→肩）上の腰椎域の下端。
 *
 * **弦の下端は股関節中心**であって仙骨ではない。股関節中心から L5/S1 までには
 * 仙骨〜骨盤の高さが挟まるので、腰椎（L5 → T12）は弦の比で見るともう少し上に来る。
 */
export const LUMBAR_START = 0.18

/** 腰椎域の上端 ≈ T12。同じ理由（骨盤の高さぶん上へ）で 0.45。ここから上は胸椎 */
export const LUMBAR_END = 0.45

/**
 * 胸椎の常時の丸み（度）。**見なし値**。正常な胸椎後弯であってエラーではない。
 * これを入れないと背中が定規のようにまっすぐで、腰椎の丸まりとの差が読めない。
 * 逆に言えば、**図に丸みがあること自体は「悪い」を意味しない**。
 */
export const THORACIC_KAPPA_DEG = 12

/** 脊柱を折れ線で描くときの分割数。点数は SPINE_SEGMENTS+1 */
export const SPINE_SEGMENTS = 16

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

export interface SpineOptions {
  /** 股関節屈曲の可動域（度）。ROM_LEVELS のいずれか */
  readonly romDeg: number
  /**
   * スタンスの開き（度）。`ROM_STANCE_COEF` を掛けて ROM に足す。
   * スモウで骨盤を起こしやすいのは開くこと自体の効果なので、切り替えられる軸にはしない。
   */
  readonly stanceDeg: number
  /**
   * 曲げの誇張倍率（描画のみ。省略時 1）。κ を実測のまま描くと、両端を留めて
   * 曲げを配る作りのため弓なりが浅く、最悪ケース（κ≈22°）でも控えめにしか見えない。
   * エラー例ページだけ ×1.5 にしてある（実寸は浅すぎ、×2 は大げさ、の中間）。
   */
  readonly exaggerate?: number
  /**
   * 可動域とは別に足す腰椎屈曲（度、省略時 0）。**経路B**（エラー由来の丸まり）の入口。
   *
   * κ_A（= max(0, 見かけの股屈曲 − ROM)）は「可動域が尽きて丸まる」だけを表すので、
   * どのエラーを選んでも増えない（エラーはむしろ股屈曲を減らす）。実際に丸まる主因は
   * 力の問題で幾何からは出せないため、`../error/kappa` が出した**置きの値**を
   * ここから合流させる。
   */
  readonly kappaExtraDeg?: number
}

export interface SpineResult {
  /** 見かけの股関節屈曲 = 180 − hipAngleDeg(pose)。体幹を剛体と見なしたときの値 */
  readonly phiApparentDeg: number
  /** スタンス補正まで入れた実効の可動域（度） */
  readonly romEffDeg: number
  /** 腰椎屈曲の合計 = kappaRomDeg + kappaExtraDeg */
  readonly kappaDeg: number
  /** 可動域由来（経路A）の腰椎屈曲 = max(0, phiApparent − romEff)。内訳を出すために分けて持つ */
  readonly kappaRomDeg: number
  /** 実際の股関節屈曲 = min(phiApparent, romEff) */
  readonly hipFlexDeg: number
  /** 股関節→肩の折れ線。SPINE_SEGMENTS+1 点（モデル座標） */
  readonly spine: readonly Vec[]
  /** 骨盤の三角。脊柱の下端の接線を「上」として置く */
  readonly pelvis: Pelvis
  /** 実効体幹長の短縮（cm）。曲げたぶん肩が手前に来る量 */
  readonly shortenCm: number
}

// ---------------------------------------------------------------------------

/** 3 点 a-b-c のなす角（度）。b が頂点 */
function angleAt(a: Vec, b: Vec, c: Vec): number {
  const ux = a.x - b.x
  const uy = a.y - b.y
  const vx = c.x - b.x
  const vy = c.y - b.y
  const d = Math.hypot(ux, uy) * Math.hypot(vx, vy)
  if (d === 0) return 0
  return Math.acos(clamp((ux * vx + uy * vy) / d, -1, 1)) / DEG
}

/**
 * 股関節角（度）。180° が完全伸展。
 *
 * `../error/metrics` に同名の関数があるが、**本編が error 配下へ依存する向きは作らない**
 * （エラー例ページは本編を参照する側）ので、3 点角だけここに写してある。
 */
const hipAngleDeg = (p: DlPose): number => angleAt(p.knee, p.hip, p.shoulder)

/** u が [a,b] の間で 0→1 へ立ち上がるランプ。曲がりを腰椎域・胸椎域に配るのに使う */
const ramp = (u: number, a: number, b: number): number => clamp((u - a) / (b - a), 0, 1)

interface Curve {
  /** 世界系の折れ線（股関節→肩） */
  readonly pts: readonly Vec[]
  /** 曲げたことによる弦長の縮み（モデル単位、ローカル系で不変） */
  readonly shorten: number
}

/**
 * 股関節から肩まで、腰椎で κ・胸椎で κT だけ曲がった折れ線を組む。
 *
 * まずローカル系（股関節が原点・鉛直上向き）で接線角を積分して形を作り、そのあと
 * **終端が肩に一致するように回転＋一様スケール**を掛ける。こうすると曲げても両端が
 * 厳密に一致し、関節の位置が図の中でずれない。スケール s は κ=20° で 弧/弦 の比が
 * 1% 程度、κ 20°＋胸椎 12° でも 2% 弱にとどまるので、体節長の誤差としては見えない。
 */
function curveOf(
  hip: Vec,
  shoulder: Vec,
  torsoLen: number,
  kappaDeg: number,
  thoracicDeg: number,
): Curve {
  const n = SPINE_SEGMENTS
  const step = torsoLen / n

  // --- ローカル系（股関節=原点、上が +y）で接線角を積分する ---
  const local: Vec[] = [{ x: 0, y: 0 }]
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n
    const th =
      (kappaDeg * ramp(u, LUMBAR_START, LUMBAR_END) + thoracicDeg * ramp(u, LUMBAR_END, 1)) * DEG
    const p = local[i]!
    local.push({ x: p.x + step * Math.sin(th), y: p.y + step * Math.cos(th) })
  }
  const end = local[n]!
  const eLen = Math.hypot(end.x, end.y)

  // --- 世界系へ：終端 E の向きを（肩 − 股関節）へ回し、s 倍して股関節へ平行移動する ---
  const dx = shoulder.x - hip.x
  const dy = shoulder.y - hip.y
  const dLen = Math.hypot(dx, dy)
  if (eLen <= 0 || dLen <= 0) return { pts: local.map(() => hip), shorten: 0 }
  const ex = end.x / eLen
  const ey = end.y / eLen
  const ux = dx / dLen
  const uy = dy / dLen
  // 単位ベクトル同士なので内積＝cos、外積 z 成分＝sin がそのまま回転角になる
  const c = ex * ux + ey * uy
  const sn = ex * uy - ey * ux
  const s = dLen / eLen
  return {
    pts: local.map((p) => ({
      x: hip.x + s * (c * p.x - sn * p.y),
      y: hip.y + s * (sn * p.x + c * p.y),
    })),
    // 弧長は常に torsoLen（各セグメントが step 固定）なので、縮みは torsoLen − 弦長
    shorten: torsoLen * (1 - eLen / torsoLen),
  }
}

/**
 * 姿勢と可動域から骨盤と腰椎の丸まりを出す。
 *
 * 胸椎の後弯（`THORACIC_KAPPA_DEG`）とスタンス補正（`ROM_STANCE_COEF`）は常時入れる。
 * どちらも正常な形・正常な効果であって、切り替えられる別の軸にはしない。
 */
export function lumbarSpineOf(pose: DlPose, opts: SpineOptions): SpineResult {
  // 見かけの股関節屈曲。hipAngleDeg は 180° が完全伸展なので、その補角が屈曲量になる
  const phiApparentDeg = 180 - hipAngleDeg(pose)
  const romEffDeg = opts.romDeg + ROM_STANCE_COEF * opts.stanceDeg
  const kappaRomDeg = Math.max(0, phiApparentDeg - romEffDeg)
  // 経路A（可動域）と経路B（エラー由来の置き値）は同じ腰椎の屈曲なので、曲線は合計で扱う。
  // 内訳は kappaRomDeg として別に返す
  const kappaDeg = kappaRomDeg + (opts.kappaExtraDeg ?? 0)
  const ex = opts.exaggerate ?? 1
  const curve = curveOf(
    pose.hip,
    pose.shoulder,
    pose.seg.torso,
    kappaDeg * ex,
    THORACIC_KAPPA_DEG * ex,
  )

  // 骨盤は脊柱の下端の接線を「上」として置く。κ が大きいほどこの接線が起きる
  // ＝ 骨盤が立ったまま腰椎だけが曲がる、という絵になる
  const p0 = curve.pts[0]!
  const p1 = curve.pts[1]!

  return {
    phiApparentDeg,
    romEffDeg,
    kappaDeg,
    kappaRomDeg,
    hipFlexDeg: Math.min(phiApparentDeg, romEffDeg),
    spine: curve.pts,
    pelvis: pelvisOf(pose.hip, { x: p1.x - p0.x, y: p1.y - p0.y }),
    shortenCm: curve.shorten * CM_PER_UNIT,
  }
}
