import { expect, test } from 'vitest'
import { CM_PER_UNIT, solveDlPose } from '../deadlift/geometry'
import { DL_PRESETS, FOOT } from '../deadlift/presets'
import { CATALOG, NO_DEVIATION, type Deviation } from './catalog'

const P = (t: number, dev: Deviation, presetId = 'standard') =>
  solveDlPose({
    body: { ...DL_PRESETS.find((p) => p.id === presetId)!.body, foot: FOOT },
    bar: 'standard', stanceDeg: 12, hipHeight: 0.5 + dev.hipDelta, t,
    barOffset: dev.barOffsetCm / CM_PER_UNIT, hipLead: dev.hipLead,
    kneeAheadExtra: dev.kneeAheadExtraCm / CM_PER_UNIT,
    ignoreBarClearance: dev.hipDelta < 0,
  })

/**
 * エラーは「立ち切った形が違う」のではなく「そこへ至る道のりに無駄が多い」もの、という
 * 前提（要件 §12）。3 項目 × 3 段 × 体格のどれでも、t=1 の関節位置が模範と一致すること。
 * 許容 0.05cm は倍精度の丸めぶんの逃げ。
 */
test('フィニッシュ（t=1）は 3 項目 × 3 段 × 体格 すべて模範と一致', () => {
  for (const pr of DL_PRESETS) {
    const ref = P(1, NO_DEVIATION, pr.id)
    for (const e of CATALOG) {
      for (let lv = 0; lv < 3; lv++) {
        const p = P(1, e.levels[lv]!, pr.id)
        const label = `${pr.id}/${e.label}/lv${lv}`
        for (const k of ['hip', 'knee', 'shoulder', 'bar', 'ankle'] as const) {
          expect(Math.abs(p[k].x - ref[k].x) * CM_PER_UNIT, `${label}/${k}.x`).toBeLessThan(0.05)
          expect(Math.abs(p[k].y - ref[k].y) * CM_PER_UNIT, `${label}/${k}.y`).toBeLessThan(0.05)
        }
      }
    }
  }
})
