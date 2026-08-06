import { expect, test } from 'vitest'
import { solveDlPose, type DlPose } from './geometry'
import { FOOT } from './presets'
import { ROM_STANCE_COEF, SPINE_SEGMENTS, lumbarSpineOf, type SpineOptions } from './spine'

/** 標準体格・ナロー・腰高 0.5・構え（t=0）。κ の回帰値を固定する基準姿勢 */
const P = (over: { stanceDeg?: number; mArm?: number; t?: number } = {}): DlPose =>
  solveDlPose({
    body: { mShank: 1, mFemur: 1, mTorso: 1, mArm: over.mArm ?? 1, foot: FOOT },
    bar: 'standard',
    stanceDeg: over.stanceDeg ?? 0,
    hipHeight: 0.5,
    t: over.t ?? 0,
  })

/** 可動域とスタンスだけを指定する短縮形（誇張なし ＝ 本編デッドリフト版と同じ条件） */
const S = (pose: DlPose, romDeg: number, stanceDeg: number, over: Partial<SpineOptions> = {}) =>
  lumbarSpineOf(pose, { romDeg, stanceDeg, ...over })

test('標準体格・ナロー・構えは ROM 120 で κ ≈ 7°', () => {
  const r = S(P(), 120, 0)
  expect(Math.abs(r.kappaDeg - 7.0)).toBeLessThan(0.3)
  // 内訳。φ_apparent ≈ 127° の超過分がそのまま κ になり、股関節は ROM で頭打ちになる
  expect(Math.abs(r.phiApparentDeg - 127.0)).toBeLessThan(0.3)
  expect(r.hipFlexDeg).toBeCloseTo(120, 6)
  expect(r.romEffDeg).toBe(120)
})

test('ROM 130・ナローなら可動域に収まり κ = 0（＝腰は丸まらない）', () => {
  const r = S(P(), 130, 0)
  expect(r.kappaDeg).toBe(0)
  expect(r.hipFlexDeg).toBeCloseTo(r.phiApparentDeg, 9)
})

test('曲げても両端は厳密に股関節と肩に一致する', () => {
  const pose = P()
  const r = S(pose, 110, 0)
  expect(r.kappaDeg).toBeGreaterThan(0)
  expect(r.spine).toHaveLength(SPINE_SEGMENTS + 1)
  const a = r.spine[0]!
  const b = r.spine[SPINE_SEGMENTS]!
  expect(Math.hypot(a.x - pose.hip.x, a.y - pose.hip.y)).toBeLessThan(1e-9)
  expect(Math.hypot(b.x - pose.shoulder.x, b.y - pose.shoulder.y)).toBeLessThan(1e-9)
})

// 胸椎の後弯は常時入れる（正常な形であってエラーではない）ので、κ=0 でも直線にはならない
test('κ = 0 でも胸椎の丸みで折れ線は直線にならない', () => {
  const pose = P()
  const r = S(pose, 130, 0)
  expect(r.kappaDeg).toBe(0)
  // 弦から最も離れた点の距離。直線なら 0 になる
  const dx = pose.shoulder.x - pose.hip.x
  const dy = pose.shoulder.y - pose.hip.y
  const len = Math.hypot(dx, dy)
  let maxOff = 0
  for (const p of r.spine) {
    const off = Math.abs((p.x - pose.hip.x) * dy - (p.y - pose.hip.y) * dx) / len
    maxOff = Math.max(maxOff, off)
  }
  expect(maxOff).toBeGreaterThan(0.005)
})

test('スタンスを開くと ROM_STANCE_COEF のぶんだけ κ が減る', () => {
  // 姿勢そのものは動かさず、可動域の補正だけを見るため同じ pose に別の stanceDeg を渡す。
  // κ は 0 で下げ止まるので、差がそのまま出るよう補正ぶんより深い ROM 100 で比べる
  const pose = P()
  const narrow = S(pose, 100, 0)
  const sumo = S(pose, 100, 35)
  expect(sumo.kappaDeg).toBeGreaterThan(0)
  expect(narrow.kappaDeg - sumo.kappaDeg).toBeCloseTo(ROM_STANCE_COEF * 35, 9)
})

test('腕が短いほど深く前屈するので κ は大きい', () => {
  const shortArm = S(P({ mArm: 0.9 }), 120, 0).kappaDeg
  const longArm = S(P({ mArm: 1.1 }), 120, 0).kappaDeg
  expect(shortArm).toBeGreaterThan(longArm)
})

// 閾値は腰椎域が 0.18/0.45 なので、曲げが弦の中ほどへ寄って縮みが増える。
// κ 17°＋胸椎 12° で 1.54%（2026-08-06 実測）
test('折れ線の総弧長は体幹長とほぼ同じ（曲げのスケール補正は 2% 未満）', () => {
  const pose = P()
  const r = S(pose, 110, 0)
  let arc = 0
  for (let i = 1; i < r.spine.length; i++) {
    const a = r.spine[i - 1]!
    const b = r.spine[i]!
    arc += Math.hypot(b.x - a.x, b.y - a.y)
  }
  expect(Math.abs(arc - pose.seg.torso) / pose.seg.torso).toBeLessThan(0.02)
  expect(r.shortenCm).toBeGreaterThan(0)
})

test('kappaExtraDeg は κ に上積みされ、内訳は kappaRomDeg に残る', () => {
  const base = S(P(), 120, 0)
  const r = S(P(), 120, 0, { kappaExtraDeg: 5 })
  expect(r.kappaRomDeg).toBeCloseTo(base.kappaDeg, 9)
  expect(r.kappaDeg).toBeCloseTo(base.kappaDeg + 5, 9)
  // 曲線も合計で曲がる（＝経路A だけのときより肩が手前に来る）
  expect(r.shortenCm).toBeGreaterThan(base.shortenCm)
})

// ---------------------------------------------------------------------------
// 骨盤
// ---------------------------------------------------------------------------

test('骨盤の 3 点は有限で、ASIS は PSIS より前にある', () => {
  const { pelvis } = S(P(), 110, 0)
  for (const v of [pelvis.psis, pelvis.asis, pelvis.ischium]) {
    expect(Number.isFinite(v.x)).toBe(true)
    expect(Number.isFinite(v.y)).toBe(true)
  }
  // 骨盤の前後の向きが保たれている
  expect(pelvis.asis.x).toBeGreaterThan(pelvis.psis.x)
})

/**
 * 股関節の白抜き円をやめたので、大腿と体幹の管の端は骨盤三角の塗りで隠すしかない。
 * 股関節が三角のどれかの辺に寄りすぎると管の蓋がはみ出し、「脚と上体の切れ目」が見える
 * （2026-08-07 に実際に起きた。ASIS が高すぎて前下の辺までが 3.1px しかなかった）。
 * 目視では崩れに気づけないので、必要なクリアランスを数値で固定する。
 */
test('股関節は骨盤三角の内側にあり、どの辺からも管の半幅より遠い', () => {
  // 管の半幅 12.5px/2 を、側面レイアウトの縮尺 s=345（＝最も厳しい方）でモデル単位へ
  const MARGIN = 6.25 / 345
  for (const t of [0, 0.3, 0.6, 1]) {
    // 誇張なし（本編）と ×1.5（エラー例ページ）の両方で見る
    for (const exaggerate of [1, 1.5]) {
      const pose = P({ t })
      const { psis, asis, ischium } = S(pose, 110, 0, { exaggerate }).pelvis
      const edges = [
        [psis, asis],
        [asis, ischium],
        [ischium, psis],
      ] as const
      let side = 0
      for (const [a, b] of edges) {
        const dx = b.x - a.x
        const dy = b.y - a.y
        // 股関節から辺への符号つき距離。3 辺すべてで符号が揃えば内側にある
        const cross = (pose.hip.x - a.x) * dy - (pose.hip.y - a.y) * dx
        const dist = cross / Math.hypot(dx, dy)
        if (side === 0) side = Math.sign(dist)
        expect(Math.sign(dist)).toBe(side)
        expect(Math.abs(dist)).toBeGreaterThan(MARGIN)
      }
    }
  }
})
