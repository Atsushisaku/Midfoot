import type { Body } from './geometry'

export interface Preset {
  readonly id: string
  readonly label: string
  readonly body: Body
}

/**
 * 足長（総長比）。全プリセット共通の定数（仕様 §13-1）。
 *
 * かつては「小柄」プリセットでここを 0.23 にしていたが、足長を変えると
 * 「足が大きいほど前傾が深くなる」という向きの効果が 3.6〜4.5° 出る。
 * これはモデルが「バーは必ず中足部の真上」と決め打ちしていることの産物で、
 * 物理的な予測ではない。現実の制約は「重心が支持基底の中にあること」であり、
 * 足が大きければ基底も広がって自由度が増すが、モデルはそれを表現できない。
 * 拘束だけが残って根拠のない向きの予測が出るので、定数に固定した。
 */
export const FOOT = 0.2

/**
 * 体型プリセット（仕様 §8.4）。
 * 1タップで体格パラメータすべてを設定する。
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'standard',
    label: '標準',
    body: { mShank: 1.0, mFemur: 1.0, mTorso: 1.0, foot: FOOT, romDeg: 30 },
  },
  {
    id: 'long-femur',
    label: '大腿が長い',
    body: { mShank: 1.0, mFemur: 1.18, mTorso: 0.92, foot: FOOT, romDeg: 30 },
  },
  {
    id: 'long-torso',
    label: '上体が長い',
    body: { mShank: 0.96, mFemur: 0.94, mTorso: 1.18, foot: FOOT, romDeg: 30 },
  },
  {
    id: 'long-shank',
    label: '脛が長い',
    body: { mShank: 1.18, mFemur: 0.95, mTorso: 0.95, foot: FOOT, romDeg: 30 },
  },
]

export const DEFAULT_PRESET = PRESETS[0]!

/** スライダーの範囲（仕様 §13-2。動かしながら調整する暫定値） */
export const RANGES = {
  segment: { min: 0.8, max: 1.25, step: 0.01 },
  /**
   * 足首の背屈可動域。θ_s は定義上そのまま knee-to-wall（荷重下ランジ）で測る角度なので、
   * 実測値をそのまま入れられる。
   *
   * 上限 35°。knee-to-wall の健常域（35〜45°）より低いのは、**バーベルスクワットで
   * 実際に使われる範囲に絞っているため**。可動域どおりに使い切ると膝が前に出すぎて、
   * 高重量を扱う姿勢としては非現実的になる（指導者の判断、2026-07）。
   */
  rom: { min: 10, max: 35, step: 1 },
  depth: { min: 0, max: 1, step: 0.01 },
} as const
