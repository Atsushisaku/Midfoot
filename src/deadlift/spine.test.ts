import { expect, test } from 'vitest'
import { solveDlPose, type DlPose } from './geometry'
import { FOOT } from './presets'
import { ROM_STANCE_COEF, SPINE_SEGMENTS, lumbarSpineOf } from './spine'

/** 標準体格・ナロー・腰高 0.5・構え（t=0）。κ の回帰値を固定する基準姿勢 */
const P = (over: { stanceDeg?: number; mArm?: number; t?: number } = {}): DlPose =>
  solveDlPose({
    body: { mShank: 1, mFemur: 1, mTorso: 1, mArm: over.mArm ?? 1, foot: FOOT },
    bar: 'standard',
    stanceDeg: over.stanceDeg ?? 0,
    hipHeight: 0.5,
    t: over.t ?? 0,
  })

test('標準体格・ナロー・構えは ROM 120 で κ ≈ 7°', () => {
  const r = lumbarSpineOf(P(), 120, 0)
  expect(Math.abs(r.kappaDeg - 7.0)).toBeLessThan(0.3)
})

test('ROM 130・ナローなら可動域に収まり κ = 0（＝腰は丸まらない）', () => {
  expect(lumbarSpineOf(P(), 130, 0).kappaDeg).toBe(0)
})

test('曲げても両端は厳密に股関節と肩に一致する', () => {
  const pose = P()
  const r = lumbarSpineOf(pose, 110, 0)
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
  const r = lumbarSpineOf(pose, 130, 0)
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
  const narrow = lumbarSpineOf(pose, 100, 0)
  const sumo = lumbarSpineOf(pose, 100, 35)
  expect(sumo.kappaDeg).toBeGreaterThan(0)
  expect(narrow.kappaDeg - sumo.kappaDeg).toBeCloseTo(ROM_STANCE_COEF * 35, 9)
})

test('腕が短いほど深く前屈するので κ は大きい', () => {
  const shortArm = lumbarSpineOf(P({ mArm: 0.9 }), 120, 0).kappaDeg
  const longArm = lumbarSpineOf(P({ mArm: 1.1 }), 120, 0).kappaDeg
  expect(shortArm).toBeGreaterThan(longArm)
})

test('折れ線の総弧長は体幹長とほぼ同じ（曲げのスケール補正は 2% 未満）', () => {
  const pose = P()
  const r = lumbarSpineOf(pose, 110, 0)
  let arc = 0
  for (let i = 1; i < r.spine.length; i++) {
    const a = r.spine[i - 1]!
    const b = r.spine[i]!
    arc += Math.hypot(b.x - a.x, b.y - a.y)
  }
  expect(Math.abs(arc - pose.seg.torso) / pose.seg.torso).toBeLessThan(0.02)
})
