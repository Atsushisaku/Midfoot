/**
 * 数値調整（仕様 §13-2）用の一覧表を出すだけのファイル。**アサーションは無い。**
 * 単体で回すなら `npm run report`。
 */
import { it } from 'vitest'
import { solvePose, type PoseInput } from './geometry'
import { PRESETS } from './presets'

const f = (n: number) => n.toFixed(1).padStart(6)

it('report', () => {
  const base = (over: Partial<PoseInput>): PoseInput => ({
    body: PRESETS[0]!.body,
    bar: 'high',
    shoe: 'flat',
    shankUsage: 1,
    p: 1,
    ...over,
  })

  const ps = [0, 0.2, 0.4, 0.6, 0.8, 0.9, 1]
  console.log('\n=== 降下カーブ（上体角度）===')
  console.log('preset/bar        ' + ps.map((p) => `p=${p}`.padStart(6)).join(''))
  for (const pr of PRESETS) {
    for (const bar of ['high', 'low'] as const) {
      const row = ps.map((p) => f(solvePose(base({ body: pr.body, bar, p })).torsoDeg)).join('')
      console.log(`${(pr.label + '/' + bar).padEnd(18)}${row}`)
    }
  }

  console.log('\n=== ボトムの上体角度（θ_s=30°）===')
  console.log('preset            ハイバー  ローバー     差')
  for (const pr of PRESETS) {
    const hi = solvePose(base({ body: pr.body, bar: 'high' })).torsoDeg
    const lo = solvePose(base({ body: pr.body, bar: 'low' })).torsoDeg
    console.log(`${pr.label.padEnd(14)}${f(hi)}${f(lo)}${f(lo - hi)}`)
  }

  console.log('\n=== 靴の効果（使用率 100%、ローバー）===')
  console.log('ROM        フラット  20mm   LS   φ(LS)')
  for (const romDeg of [15, 20, 30]) {
    const r = (['flat', 'running', 'lifting'] as const).map(
      (shoe) =>
        solvePose(base({ body: { ...PRESETS[0]!.body, romDeg }, shoe, bar: 'low' })).torsoDeg,
    )
    const phi = solvePose(base({ shoe: 'lifting' })).heelTiltDeg
    console.log(`${String(romDeg).padEnd(8)}${r.map(f).join('')}${f(phi)}`)
  }

  console.log('\n=== 膝の前送り（可動域の使用率）の効果 ===')
  console.log('使用率     ハイバー ローバー')
  for (const shankUsage of [1, 0.85, 0.7, 0.55, 0.4, 0.3]) {
    const hi = solvePose(base({ shankUsage, bar: 'high' }))
    const lo = solvePose(base({ shankUsage, bar: 'low' }))
    const note = lo.lift !== 'none' ? `  (${lo.lift})` : ''
    console.log(`${(shankUsage * 100).toFixed(0).padEnd(8)}%${f(hi.torsoDeg)}${f(lo.torsoDeg)}${note}`)
  }

  console.log('\n=== 立位ゴースト ===')
  for (const pr of PRESETS) {
    console.log(`${pr.label.padEnd(14)}${f(solvePose(base({ body: pr.body, p: 0 })).torsoDeg)}`)
  }
})
