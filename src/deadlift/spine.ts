/**
 * 腰椎の丸まりの描画モデル。
 *
 * `./geometry` と同じ規約: 純関数のみ・DOM に一切触れない。**ソルバは触らない**
 * （丸まりは描画層の話で、姿勢そのものは体幹を剛体として解いたままにする）。
 *
 * 核心のモデルは「前屈は股関節で曲がる量 ＋ 腰椎で曲がる量の合計」。ソルバ
 * （`solveDlPose`）は体幹を剛体として解くので、そこから出る股関節屈曲角
 * φ_apparent は**見かけの**値でしかない。実際の股関節屈曲は可動域 ROM で頭打ちになり、
 * 超過分 κ = max(0, φ_apparent − ROM) は腰椎の屈曲に回る。
 *
 * つまり骨盤は可動域の端で止まり（＝起きたまま）、腰椎だけが κ 曲がって上体が前へ届く。
 * これが「骨盤が立ちすぎて腰部が丸まる」の絵になる。
 *
 * κ はエラーではなく**体格の関数**として出る。効くのは主に**腕の短さ**（t=0 実測で
 * ROM120 のとき 腕短 16.3° / 標準 7.0° / 腕長 0°）、次いで体幹の長さ（long-torso 8.3°）。
 * 大腿長プリセットはむしろ標準より小さい（5.4°）——プリセットが体幹を 0.92 倍に
 * 縮めるぶん股関節位置が高くなり、要求される前屈が浅くなるため。
 * 「大腿が長い人は丸まりやすい」という通説はハム張力の経路（§11.4）の話で、
 * 可動域の経路であるこの κ とは別。
 * 「丸まりやすさは体格で変わる」という Midfoot の主題そのものなので、本編の
 * 身体的特徴として持たせる。
 */

import { DEG, clamp, type Vec } from '../geometry'
import type { DlPose } from './geometry'

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

/**
 * 股関節から肩まで、腰椎で κ・胸椎で THORACIC_KAPPA_DEG だけ曲がった折れ線を組む。
 *
 * まずローカル系（股関節が原点・鉛直上向き）で接線角を積分して形を作り、そのあと
 * **終端が肩に一致するように回転＋一様スケール**を掛ける。こうすると曲げても両端が
 * 厳密に一致し、関節の位置が図の中でずれない。スケール s は κ=20° で 弧/弦 の比が
 * 1% 程度、κ 20°＋胸椎 12° でも 2% 弱にとどまるので、体節長の誤差としては見えない。
 */
function curveOf(hip: Vec, shoulder: Vec, torsoLen: number, kappaDeg: number): readonly Vec[] {
  const n = SPINE_SEGMENTS
  const step = torsoLen / n

  // --- ローカル系（股関節=原点、上が +y）で接線角を積分する ---
  const local: Vec[] = [{ x: 0, y: 0 }]
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n
    const th =
      (kappaDeg * ramp(u, LUMBAR_START, LUMBAR_END) +
        THORACIC_KAPPA_DEG * ramp(u, LUMBAR_END, 1)) *
      DEG
    const p = local[i]!
    local.push({ x: p.x + step * Math.sin(th), y: p.y + step * Math.cos(th) })
  }
  const end = local[n]!
  const eLen = Math.hypot(end.x, end.y)

  // --- 世界系へ：終端 E の向きを（肩 − 股関節）へ回し、s 倍して股関節へ平行移動する ---
  const dx = shoulder.x - hip.x
  const dy = shoulder.y - hip.y
  const dLen = Math.hypot(dx, dy)
  if (eLen <= 0 || dLen <= 0) return local.map(() => hip)
  const ex = end.x / eLen
  const ey = end.y / eLen
  const ux = dx / dLen
  const uy = dy / dLen
  // 単位ベクトル同士なので内積＝cos、外積 z 成分＝sin がそのまま回転角になる
  const c = ex * ux + ey * uy
  const sn = ex * uy - ey * ux
  const s = dLen / eLen
  return local.map((p) => ({
    x: hip.x + s * (c * p.x - sn * p.y),
    y: hip.y + s * (sn * p.x + c * p.y),
  }))
}

export interface LumbarSpine {
  /** 腰椎屈曲 = max(0, 見かけの股屈曲 − 実効 ROM)。0 なら可動域に収まっている */
  readonly kappaDeg: number
  /** 股関節→肩の折れ線。SPINE_SEGMENTS+1 点（モデル座標） */
  readonly spine: readonly Vec[]
}

/**
 * 姿勢と可動域から腰椎の丸まりを出す。
 *
 * スタンスの補正（`ROM_STANCE_COEF`）は本編では常時入れる。スモウで骨盤を起こしやすい
 * のは開くこと自体の効果なので、切り替えられる別の軸にはしない。
 */
export function lumbarSpineOf(pose: DlPose, romDeg: number, stanceDeg: number): LumbarSpine {
  // 見かけの股関節屈曲。hipAngleDeg は 180° が完全伸展なので、その補角が屈曲量になる
  const phiApparentDeg = 180 - hipAngleDeg(pose)
  const romEffDeg = romDeg + ROM_STANCE_COEF * stanceDeg
  const kappaDeg = Math.max(0, phiApparentDeg - romEffDeg)
  return { kappaDeg, spine: curveOf(pose.hip, pose.shoulder, pose.seg.torso, kappaDeg) }
}
