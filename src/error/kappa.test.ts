import { expect, test } from 'vitest'
import { CM_PER_UNIT, solveDlPose, type DlPose } from '../deadlift/geometry'
import { FOOT } from '../deadlift/presets'
import { CATALOG, NO_DEVIATION, type Deviation, type Level } from './catalog'
import { KAPPA_B_FULL_T, KAPPA_B_SETUP_FRAC, errorKappaOf, fadedKappaAddDeg } from './kappa'

/** `./app.ts` の `poseAt` と同じ組み立て。較正条件（標準体格・腕標準・ナロー・腰高 0.5） */
const poseAt = (t: number, dev: Deviation): DlPose =>
  solveDlPose({
    body: { mShank: 1, mFemur: 1, mTorso: 1, mArm: 1, foot: FOOT },
    bar: 'standard',
    stanceDeg: 0,
    hipHeight: 0.5 + dev.hipDelta,
    t,
    barOffset: dev.barOffsetCm / CM_PER_UNIT,
    hipLead: dev.hipLead,
    kneeAheadExtra: dev.kneeAheadExtraCm / CM_PER_UNIT,
    ...(dev.hipLeadRamp !== undefined ? { hipLeadRamp: dev.hipLeadRamp } : {}),
  })

const kappaBOf = (id: string, level: Level, t: number) => {
  const entry = CATALOG.find((e) => e.id === id)!
  return errorKappaOf(poseAt(t, entry.levels[level]), poseAt(t, NO_DEVIATION), t)
}

test('上体の立てすぎはハム由来が全 t・全 3 段で 0（ハムはむしろ緩むため）', () => {
  for (const level of [0, 1, 2] as const) {
    for (const t of [0, 0.15, 0.3]) {
      expect(kappaBOf('upright', level, t).hamDeg).toBe(0)
    }
  }
})

/**
 * R_BAR=1（等重み）への変更後の固定（2026-08-06）。
 *
 * 旧 R_BAR=2 では「立てすぎ」でもバーの梃子の伸びが上体の梃子の縮みを上回り、
 * 重度が t=0.6 で 10° まで丸まっていた。等重みに直したことで軽度・中等度は全 t で
 * 1° 未満、重度も終盤に 5° 弱残るだけになったので、その範囲を回帰として固定する。
 * 山が時間窓で後ろへ寄るため、旧テスト（t≤0.3）より広く t=0〜0.8 を見る。
 */
test('上体の立てすぎは軽度・中等度がほぼ 0、重度でも 5° 未満', () => {
  const ts = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.8]
  for (const level of [0, 1] as const) {
    for (const t of ts) {
      expect(kappaBOf('upright', level, t).loadDeg).toBeLessThan(1)
    }
  }
  // 重度の最大は t=0.75 の 4.85°
  for (const t of ts) {
    expect(kappaBOf('upright', 2, t).loadDeg).toBeLessThan(5)
  }
  expect(kappaBOf('upright', 2, 0.75).loadDeg).toBeGreaterThan(4)
})

/** 0.05 刻みで κ_B 合計の山（値と位置）を拾う */
const peakOf = (id: string, level: Level) => {
  let deg = -1
  let t = -1
  for (let i = 0; i <= 20; i++) {
    const u = i * 0.05
    const k = kappaBOf(id, level, u)
    if (k.hamDeg + k.loadDeg > deg) {
      deg = k.hamDeg + k.loadDeg
      t = u
    }
  }
  return { deg, t }
}

/**
 * 時間窓（`KAPPA_B_SETUP_FRAC` / `KAPPA_B_FULL_T`）の効きの固定。
 *
 * **山の位置は狙いの t∈[0.3,0.5] に入らなかった**（2026-08-06）。ぶっこ抜き中等度の
 * ハム超過は t=0.175 の 13.7° と t=0.575 の 9.1° の二こぶで、その谷がちょうど [0.3,0.5]
 * （t=0.425 で 7.2°）にある。時間窓は単調増加なので、谷を両側の山より高くはできない
 * （KAPPA_B_FULL_T をどう動かしても 0.2 か 0.55 のどちらかが最大になる）。
 * 既定の 0.45 では 0.2〜0.6 が 7.3〜8.6° のほぼ平らな高原になり、山は t=0.55。
 * 「構えで小さくファーストプル〜セカンドプルで大きい」という狙いは満たしている。
 *
 * 構えの κ_B(0) は R_BAR=1・C_LOAD=1.6 への変更で 4.1 → 4.4°（荷重成分 2.2 → 2.4°）。
 * 目標の 3〜5° に収まったままなので閾値は据え置く（2026-08-06 再実測）。
 */
test('ぶっこ抜き中等度は構えで小さく、ファーストプル〜セカンドプルで山になる', () => {
  const k0 = kappaBOf('hipShoot', 1, 0)
  const total0 = k0.hamDeg + k0.loadDeg
  expect(total0).toBeGreaterThan(3)
  expect(total0).toBeLessThan(5)

  const peak = peakOf('hipShoot', 1)
  expect(peak.deg).toBeGreaterThan(8)
  expect(peak.deg).toBeLessThan(12)
  expect(peak.t).toBeGreaterThanOrEqual(0.2)
  expect(peak.t).toBeLessThanOrEqual(0.6)

  const k1 = kappaBOf('hipShoot', 1, 1)
  expect(k1.hamDeg + k1.loadDeg).toBeLessThan(0.5)
})

// R_BAR=1 で超過が半減したぶんを C_LOAD=1.6 で補償したので、山の高さは旧値（7.8°）
// とほぼ同じ 7.7°（t=0.6）に戻っている（2026-08-06 再実測）
test('バーが遠い中等度は荷重由来だけが効き、山は構えより後ろへ寄る', () => {
  expect(kappaBOf('barFar', 1, 0.15).hamDeg).toBe(0)
  const peak = peakOf('barFar', 1)
  expect(peak.t).toBeGreaterThanOrEqual(0.2)
  expect(peak.deg).toBeGreaterThan(5)
  expect(peak.deg).toBeLessThan(9)
})

test('t=1 は全エラー・全 3 段で κ_B ≈ 0（姿勢がロックアウトで収束するため）', () => {
  for (const e of CATALOG) {
    for (const level of [0, 1, 2] as const) {
      const k = kappaBOf(e.id, level, 1)
      expect(k.hamDeg + k.loadDeg).toBeLessThan(0.5)
    }
  }
})

test('腰椎の屈曲は逸脱ゼロ＝姿勢が模範と厳密に一致し、置き κ だけが乗る', () => {
  const entry = CATALOG.find((e) => e.id === 'roundBack')!
  for (const level of [0, 1, 2] as const) {
    for (const t of [0, 0.3, 0.7]) {
      const err = poseAt(t, entry.levels[level])
      const opt = poseAt(t, NO_DEVIATION)
      for (const key of ['ankle', 'knee', 'hip', 'shoulder', 'bar'] as const) {
        expect(Math.hypot(err[key].x - opt[key].x, err[key].y - opt[key].y)).toBeLessThan(1e-12)
      }
      // 姿勢が同一なので経路B も出ない。丸まりは置き κ だけから来る
      const k = errorKappaOf(err, opt, t)
      expect(k.hamDeg).toBe(0)
      expect(k.loadDeg).toBe(0)
    }
  }
  expect(entry.kappaAddDeg).toEqual([8, 16, 24])
})

test('置き κ は構えで 0.35 倍、t=0.45〜0.6 で満額、t=1 で 0（フィニッシュは模範と一致）', () => {
  expect(fadedKappaAddDeg(16, 0)).toBeCloseTo(16 * KAPPA_B_SETUP_FRAC, 9)
  expect(fadedKappaAddDeg(16, KAPPA_B_FULL_T)).toBeCloseTo(16, 9)
  expect(fadedKappaAddDeg(16, 0.5)).toBeCloseTo(16, 9)
  expect(fadedKappaAddDeg(16, 0.6)).toBeCloseTo(16, 9)
  expect(fadedKappaAddDeg(16, 0.8)).toBeCloseTo(8, 9)
  expect(fadedKappaAddDeg(16, 1)).toBe(0)
  // 立ち上がりは単調（構え → 満額の間で行き過ぎたり戻ったりしない）
  for (let i = 1; i <= 9; i++) {
    expect(fadedKappaAddDeg(16, i * 0.05)).toBeGreaterThan(fadedKappaAddDeg(16, (i - 1) * 0.05))
  }
})

test('カタログは既存 3 項目 ＋ 腰椎の屈曲の 4 項目で、置き κ を持つのは 1 つだけ', () => {
  expect(CATALOG.map((e) => e.id)).toEqual(['hipShoot', 'upright', 'barFar', 'roundBack'])
  for (const e of CATALOG) {
    if (e.id !== 'roundBack') expect(e.kappaAddDeg).toEqual([0, 0, 0])
  }
})
