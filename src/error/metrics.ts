/**
 * エラー提示アプリの「帰結」指標。
 * 要件: docs/error-app-requirements.md §4
 *
 * `../deadlift/geometry` と同じ規約: 純関数のみ・DOM に一切触れない。
 *
 * ここで出すのは**バーの重量が各関節にかける梃子の長さ（モーメントアーム）**であって、
 * 関節の総負荷ではない。総負荷には体節自身の重さの寄与が入り、それを出すには
 * 「バー重量 ÷ 体重」の仮定が要る。第1弾では仮定を一切置かない方針なので、
 * 純粋な幾何量だけを返す。この但し書きは UI にも出すこと。
 */

import type { Vec } from '../geometry'
import { CM_PER_UNIT, COM_RATIO, SEGMENT_MASS, type DlPose } from '../deadlift/geometry'

/**
 * L5/S1 の位置（股関節から肩へ向かう体幹上の比、要件 §3.4）。
 *
 * **暫定値。出典を当ててから確定する（要件 §9-1）。**
 * 体幹（股関節中心→肩峰）の下端側 10〜15% あたりという見当で 0.12 を置いている。
 * 実際の L5/S1 は股関節中心よりやや後方にあるが、矢状面 2D では体幹の線上に載せる近似。
 */
export const L5S1_RATIO = 0.12

export interface DlMetrics {
  /** L5/S1 の座標（描画用） */
  readonly l5s1: Vec
  /** バー → 股関節 の水平距離（cm）。股関節伸展のモーメントアーム */
  readonly hipArmCm: number
  /** バー → L5/S1 の水平距離（cm）。**バーの重量**が腰にかける梃子 */
  readonly l5s1ArmCm: number
  /** バー → 膝 の水平距離（cm）。膝伸展のモーメントアーム */
  readonly kneeArmCm: number
  /**
   * 上体重心 → L5/S1 の水平距離（cm）。**上体自身の重さ**が腰にかける梃子。
   *
   * バーの梃子とは別に必要。ぶっこ抜きを実測すると、腰が上がって上体が水平に近づくぶん
   * L5/S1 がバーに近づくので、**バーの梃子はむしろ縮む**。それでもぶっこ抜きが腰に
   * こたえるのは、上体が寝たぶん**上体自身の重さの梃子**が伸びるから。
   * この 2 本は質量比の仮定なしにどちらも幾何だけで出せるので、分けて出す。
   */
  readonly upperArmCm: number
  /**
   * バー高における「バー中心 → 脛の中心線」の水平距離（cm）。
   * 正なら脛はバーの後ろ（正常）、**負ならバーが脛に食い込んでいる**。
   * 腰を落としすぎて膝が前に出たときの帰結を数値にするために出す。
   */
  readonly barToShinCm: number
}

/**
 * 上体（体幹＋腕）の重心 x。Winter の質量比をそのまま使う。
 * L5/S1 は本来は体幹の内側にあるので体幹の一部は L5 より下だが、
 * プロトタイプでは体幹まるごとを「上体」として扱う近似にしてある。
 */
function upperComX(pose: DlPose): number {
  const mTorso = SEGMENT_MASS.torso
  const mArm = SEGMENT_MASS.arm
  const torsoComX = pose.hip.x + COM_RATIO.torso * (pose.shoulder.x - pose.hip.x)
  const armComX = pose.shoulder.x + COM_RATIO.arm * (pose.bar.x - pose.shoulder.x)
  return (mTorso * torsoComX + mArm * armComX) / (mTorso + mArm)
}

export function metricsOf(pose: DlPose): DlMetrics {
  const l5s1: Vec = {
    x: pose.hip.x + (pose.shoulder.x - pose.hip.x) * L5S1_RATIO,
    y: pose.hip.y + (pose.shoulder.y - pose.hip.y) * L5S1_RATIO,
  }
  const arm = (jointX: number) => Math.abs(pose.bar.x - jointX) * CM_PER_UNIT
  return {
    l5s1,
    hipArmCm: arm(pose.hip.x),
    l5s1ArmCm: arm(l5s1.x),
    kneeArmCm: arm(pose.knee.x),
    upperArmCm: Math.abs(upperComX(pose) - l5s1.x) * CM_PER_UNIT,
    barToShinCm: (pose.bar.x - legXAtBarHeight(pose)) * CM_PER_UNIT,
  }
}

/** 3 点 a-b-c のなす角（度）。b が頂点 */
function angleAt(a: Vec, b: Vec, c: Vec): number {
  const ux = a.x - b.x
  const uy = a.y - b.y
  const vx = c.x - b.x
  const vy = c.y - b.y
  const d = Math.hypot(ux, uy) * Math.hypot(vx, vy)
  if (d === 0) return 0
  return (Math.acos(Math.min(1, Math.max(-1, (ux * vx + uy * vy) / d))) * 180) / Math.PI
}

/** 膝関節角（度）。180° が完全伸展 */
export const kneeAngleDeg = (p: DlPose): number => angleAt(p.ankle, p.knee, p.hip)

/** 股関節角（度）。180° が完全伸展 */
export const hipAngleDeg = (p: DlPose): number => angleAt(p.knee, p.hip, p.shoulder)

/**
 * 脚の伸展をどこまで使ったか。§11.1 の検証で**主指標**に決めた量。
 *
 * 「バーの進み `t`」と並べると、ぶっこ抜き（脚を先食い）と上体の立てすぎ（脚が遅れる）が
 * **1 本の指標で逆向きに**出る。梃子で説明しようとすると、ぶっこ抜きは「楽になる」という
 * 逆の結論になるので使えない。
 *
 * **物差し（`refStart` / `refLock`）は必ず最適フォーム側から取る。** エラー側の可動範囲で
 * 正規化すると、深く構える「上体の立てすぎ」は範囲そのものが広がって差が消えてしまう
 * （実測で中等度と重度がどちらも 6% になり、程度が効かなくなった）。
 * 同じ物差しに載せれば、構えの時点で脚が遅れていることが負の値として出る。
 */
export function legExtensionUsed(refStart: DlPose, refLock: DlPose, now: DlPose): number {
  const a = kneeAngleDeg(refStart)
  const b = kneeAngleDeg(refLock)
  if (Math.abs(b - a) < 1e-9) return 0
  return (kneeAngleDeg(now) - a) / (b - a)
}

/**
 * バー高における脚ラインの x。バーが膝より上なら膝そのもの、足首より下なら足首、
 * 間なら脛の内分点（`geometry.test.ts` の同名ヘルパーと同じ定義）。
 */
function legXAtBarHeight(p: DlPose): number {
  if (p.bar.y >= p.knee.y) return p.knee.x
  if (p.bar.y <= p.ankle.y) return p.ankle.x
  return p.ankle.x + ((p.bar.y - p.ankle.y) / (p.knee.y - p.ankle.y)) * (p.knee.x - p.ankle.x)
}

/** バー中心が描く軌跡の総移動距離（cm）。t を等間隔で刻んだ姿勢列から出す */
export function barPathLengthCm(poses: readonly DlPose[]): number {
  let sum = 0
  for (let i = 1; i < poses.length; i++) {
    const a = poses[i - 1]!.bar
    const b = poses[i]!.bar
    sum += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return sum * CM_PER_UNIT
}

/**
 * 最適比（%）。`ref` を 100 としたときの `val` の増減。
 * ref が 0 近傍（バーが関節の真上）だと比が発散するので、その場合は null を返して
 * UI 側で「—」にする。cm の絶対値のほうは常に出せる。
 */
export function ratioPct(val: number, ref: number): number | null {
  if (!(Math.abs(ref) > 0.5)) return null
  return ((val - ref) / ref) * 100
}
