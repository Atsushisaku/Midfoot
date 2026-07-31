/**
 * デッドリフト版の数値調整用の一覧表を出すだけのファイル。**アサーションは無い。**
 * 仕様: docs/deadlift-proto-spec.md Rev.3
 *
 * 文言テーブル（strings.ts）は UI 側の担当なので、ラベルはここに直書きする。
 */
import { it } from 'vitest'
import { CM_PER_UNIT, solveDlPose, type DlBody, type DlPoseInput } from './geometry'
import { ARM_LEVELS, DL_PRESETS, STANCES } from './presets'

const STANDARD: DlBody = { mShank: 1.0, mFemur: 1.0, mTorso: 1.0, mArm: 1.0, foot: 0.2 }

const PRESET_LABEL: Record<string, string> = {
  standard: '標準',
  'long-femur': '大腿が長い',
  'long-torso': '体幹が長い',
}
const STANCE_LABEL: Record<number, string> = { 0: 'ナロー', 12: 'ミドル', 35: 'スモウ' }
const ARM_LABEL: Record<string, string> = { '0.9': '短い', '1': '標準', '1.1': '長い' }

const f = (n: number) => n.toFixed(1).padStart(7)

/** 全角を 2 桁として数える簡易 padEnd（表を崩さないため） */
const pad = (s: string, w: number) => {
  const width = [...s].reduce((n, ch) => n + (ch.charCodeAt(0) < 0x100 ? 1 : 2), 0)
  return s + ' '.repeat(Math.max(0, w - width))
}

it('report', () => {
  const base = (over: Partial<DlPoseInput> = {}): DlPoseInput => ({
    body: STANDARD,
    bar: 'standard',
    stanceDeg: 0,
    hipHeight: 0.5,
    t: 0,
    ...over,
  })

  /** 背角 / 腰高cm / 腕傾き / 肩前方cm を 1 行に */
  const cols = (over: Partial<DlPoseInput>) => {
    const p = solveDlPose(base(over))
    const warn = p.warn === 'none' ? '' : '  (reach)'
    return f(p.backHorizDeg) + f(p.hip.y * CM_PER_UNIT) + f(p.armDeg) + f((p.shoulder.x - p.midX) * CM_PER_UNIT) + warn
  }
  const HEAD = '   背角°   腰高cm  腕傾き°  肩前方cm'

  // (a) 身体重心の位置 × スタンス。comPos は Rev.3 の主役スライダー。
  console.log('\n=== (a) 身体重心の位置 comPos × スタンス（標準体格・t=0・hipHeight=0.5）===')
  console.log(pad('comPos', 10) + pad('重心cm', 10) + pad('スタンス', 14) + HEAD)
  for (const comPos of [0, 0.25, 0.5, 0.75, 1]) {
    for (const stanceDeg of STANCES) {
      const p = solveDlPose(base({ comPos, stanceDeg }))
      console.log(
        pad(comPos.toFixed(2), 10) +
          pad((p.comX * CM_PER_UNIT).toFixed(1), 10) +
          pad(`${STANCE_LABEL[stanceDeg] ?? ''}(${stanceDeg}°)`, 14) +
          cols({ comPos, stanceDeg }),
      )
    }
  }

  // (b) 体格プリセット × スタンス（既定の重心位置）
  console.log('\n=== (b) 体型プリセット × スタンス × 腕（既定 comPos=0.3・t=0）===')
  console.log(pad('体型', 14) + pad('スタンス', 14) + pad('腕', 10) + HEAD)
  for (const pr of DL_PRESETS) {
    for (const stanceDeg of STANCES) {
      for (const mArm of ARM_LEVELS) {
        console.log(
          pad(PRESET_LABEL[pr.id] ?? pr.id, 14) +
            pad(`${STANCE_LABEL[stanceDeg] ?? ''}(${stanceDeg}°)`, 14) +
            pad(`${ARM_LABEL[String(mArm)] ?? ''}${mArm.toFixed(2)}`, 10) +
            cols({ body: { ...pr.body, mArm }, stanceDeg }),
        )
      }
    }
  }

  // (c) 挙上カーブ。バー→股（hips through）が数字で見えるようにする（Rev.5）
  const ts = [0, 0.25, 0.5, 0.75, 1]
  console.log('\n=== (c) 挙上カーブ（背角°／既定 comPos=0.3・α=0・hipHeight=0.5）===')
  console.log(pad('体型', 14) + ts.map((t) => `t=${t}`.padStart(7)).join(''))
  for (const pr of DL_PRESETS) {
    console.log(
      pad(PRESET_LABEL[pr.id] ?? pr.id, 14) +
        ts.map((t) => f(solveDlPose(base({ body: pr.body, t })).backHorizDeg)).join(''),
    )
  }
  console.log('\n--- 同・バー→股 cm（hips through。小さいほど骨盤がバーの下）---')
  console.log(pad('体型', 14) + ts.map((t) => `t=${t}`.padStart(7)).join(''))
  for (const pr of DL_PRESETS) {
    console.log(
      pad(PRESET_LABEL[pr.id] ?? pr.id, 14) +
        ts
          .map((t) => {
            const p = solveDlPose(base({ body: pr.body, t }))
            return f((p.midX - p.hip.x) * CM_PER_UNIT)
          })
          .join(''),
    )
  }
  console.log('\n--- 同・バー→脚 cm（クリアランス。バー高での脚ラインとの水平距離。Rev.6）---')
  console.log(pad('体型', 14) + ts.map((t) => `t=${t}`.padStart(7)).join(''))
  for (const pr of DL_PRESETS) {
    console.log(
      pad(PRESET_LABEL[pr.id] ?? pr.id, 14) +
        ts
          .map((t) => {
            const p = solveDlPose(base({ body: pr.body, t }))
            // バーが膝より上なら膝そのもの、間なら脛の内分点
            const legX =
              p.bar.y >= p.knee.y
                ? p.knee.x
                : p.ankle.x +
                  ((p.bar.y - p.ankle.y) / (p.knee.y - p.ankle.y)) * (p.knee.x - p.ankle.x)
            return f((p.midX - legX) * CM_PER_UNIT)
          })
          .join(''),
    )
  }

  console.log('\n--- 同・バー高 cm ---')
  console.log(pad('体型', 14) + ts.map((t) => `t=${t}`.padStart(7)).join(''))
  for (const pr of DL_PRESETS) {
    console.log(
      pad(PRESET_LABEL[pr.id] ?? pr.id, 14) +
        ts.map((t) => f(solveDlPose(base({ body: pr.body, t })).bar.y * CM_PER_UNIT)).join(''),
    )
  }
  console.log('\n--- 同・腕の傾き° ---')
  console.log(pad('体型', 14) + ts.map((t) => `t=${t}`.padStart(7)).join(''))
  for (const pr of DL_PRESETS) {
    console.log(
      pad(PRESET_LABEL[pr.id] ?? pr.id, 14) +
        ts.map((t) => f(solveDlPose(base({ body: pr.body, t })).armDeg)).join(''),
    )
  }

  // (d) 腰の高さ × 身体重心。2 本のコーチング変数の相互作用（体感調整用）。
  const coms = [0, 0.25, 0.5, 0.75, 1]
  console.log('\n=== (d) 腰の高さ × 身体重心のマトリクス（標準体格・α=0・t=0）===')
  console.log('--- 背角° ---')
  console.log(pad('hipHeight', 12) + coms.map((c) => `com=${c}`.padStart(8)).join(''))
  for (const hipHeight of [0, 0.25, 0.5, 0.75, 1]) {
    console.log(
      pad(hipHeight.toFixed(2), 12) +
        coms
          .map((comPos) => {
            const p = solveDlPose(base({ hipHeight, comPos }))
            return (p.warn === 'none' ? '' : '*') + p.backHorizDeg.toFixed(1).padStart(p.warn === 'none' ? 8 : 7)
          })
          .join(''),
    )
  }
  console.log('--- 腰高 cm ---')
  console.log(pad('hipHeight', 12) + coms.map((c) => `com=${c}`.padStart(8)).join(''))
  for (const hipHeight of [0, 0.25, 0.5, 0.75, 1]) {
    console.log(
      pad(hipHeight.toFixed(2), 12) +
        coms
          .map((comPos) =>
            (solveDlPose(base({ hipHeight, comPos })).hip.y * CM_PER_UNIT).toFixed(1).padStart(8),
          )
          .join(''),
    )
  }
  console.log('--- 腕の傾き° ---')
  console.log(pad('hipHeight', 12) + coms.map((c) => `com=${c}`.padStart(8)).join(''))
  for (const hipHeight of [0, 0.25, 0.5, 0.75, 1]) {
    console.log(
      pad(hipHeight.toFixed(2), 12) +
        coms
          .map((comPos) => solveDlPose(base({ hipHeight, comPos })).armDeg.toFixed(1).padStart(8))
          .join(''),
    )
  }
  console.log('（* は reach 警告。到達範囲の端にクランプした値）')
})
