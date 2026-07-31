/**
 * デッドリフト版のプリセットとスライダー範囲。
 * 仕様: docs/deadlift-proto-spec.md §2 / §6
 */

import { FOOT } from '../presets'
import type { DlBody } from './geometry'

/** 足長はスクワット版と共通の定数を使う（プリセットで変えない理由は `../presets` の FOOT を参照） */
export { FOOT }

/**
 * バーセッティングの高さは幾何側の定数。ここからも引けるように再輸出する。
 * Rev.2-1 で UI からは外した（常に 'standard' を渡す）が、ソルバ API とテストは温存する。
 */
export { BAR_SETTING_Y } from './geometry'

/** 身体重心スライダーの既定値（Rev.3）。実体は幾何側の定数 */
export { COM_POS_DEFAULT } from './geometry'

/** 表示名はフェーズ B の strings.ts が id をキーに持つ（スクワット版 i18n と同じ流儀） */
export interface DlPreset {
  readonly id: string
  readonly body: DlBody
}

/**
 * 体型プリセット（仕様 §6 / Rev.2-2）。1タップで体格パラメータすべてを設定する。
 * long-femur / long-torso はスクワット版の同名プリセットと同じ倍率。
 *
 * 「腕が長い」は Rev.2 で削除した。腕はプリセットではなく独立入力に格上げしたため
 * （プリセットは mArm を 1.0 にリセットする。スクワット版プリセットが romDeg を持つのと同じ扱い）。
 */
export const DL_PRESETS: readonly DlPreset[] = [
  { id: 'standard', body: { mShank: 1.0, mFemur: 1.0, mTorso: 1.0, mArm: 1.0, foot: FOOT } },
  { id: 'long-femur', body: { mShank: 1.0, mFemur: 1.18, mTorso: 0.92, mArm: 1.0, foot: FOOT } },
  { id: 'long-torso', body: { mShank: 0.96, mFemur: 0.94, mTorso: 1.18, mArm: 1.0, foot: FOOT } },
]

export const DEFAULT_DL_PRESET = DL_PRESETS[0]!

/**
 * 腕の長さの簡易3択（Rev.2-2）。短い 0.90 ／ 標準 1.00 ／ 長い 1.10。
 * 表示名は倍率をキーに引く（スクワット版 ANKLE_LEVELS と同じ枠）。
 * 標準 1.00 を既定値と一致させ、初期表示の見た目を変えない。
 */
export const ARM_LEVELS: readonly number[] = [0.9, 1.0, 1.1]

/**
 * スタンスの簡易3択（仕様 §2）。ナロー0° / ミドル12° / スモウ35°。
 * 表示名は deg をキーに引く（スクワット版 ANKLE_LEVELS と同じ流儀）。
 *
 * α=35 でナロー比 背角 +10.7°。文献のスモウ／コンベンショナルの体幹角差
 * 5〜15° の範囲内に収まる値として選んである。
 */
export const STANCES: readonly number[] = [0, 12, 35]

/** スライダーの範囲（仕様 §6） */
export const DL_RANGES = {
  /** 脛・大腿・体幹・腕の倍率。スクワット版 RANGES.segment と同じ幅 */
  segment: { min: 0.8, max: 1.25, step: 0.01 },
  arm: { min: 0.8, max: 1.25, step: 0.01 },
  /** スタンス開き角 α（度）。矢状面への射影に使う見なしパラメータ */
  stance: { min: 0, max: 45, step: 1 },
  hipHeight: { min: 0, max: 1, step: 0.01 },
  /** 挙上進行度。スクワット版の depth の後継 */
  lift: { min: 0, max: 1, step: 0.01 },
  /** 身体重心 x の目標位置 0（かかと）〜1（中足部）。既定は COM_POS_DEFAULT（Rev.3） */
  comPos: { min: 0, max: 1, step: 0.01 },
} as const
