/**
 * 骨盤の三角（3 ページ共通の描画モデル）。
 *
 * `./geometry` と同じ規約: 純関数のみ・DOM に一切触れない。**ソルバは触らない**
 * （骨盤は描画層の話で、姿勢そのものは体幹を剛体として解いたままにする）。
 *
 * スクワット版・デッドリフト版・エラー例ページの 3 ページで同じ見た目にするため、
 * 寸法と組み立てをここ 1 か所に置く。違うのは「骨盤の上がどちらか」（`upDir`）だけで、
 * デッドリフトは脊柱下端の接線、スクワットは股→肩の向きを渡す。
 */

import type { Vec } from './geometry'

/**
 * 骨盤の三角（描画用）。矢状面 2D なので 3 点で足りる。
 *
 * 頂点は解剖のランドマークに対応させる: PSIS（後上・仙骨と同じ高さで脊柱の土台）、
 * ASIS（前上。PSIS と結んだ線の傾きが骨盤の前後傾の定義そのもの）、
 * 坐骨結節（後下。ハムの起始）。前後が非対称なので、後傾すると後ろの尻尾が回って見える。
 *
 * 一度 2026-08-07 に対称な二等辺三角へ変えたが、**忠実版へ差し戻した**（atsushi さん判断）。
 */
export interface Pelvis {
  readonly psis: Vec
  readonly asis: Vec
  readonly ischium: Vec
}

/**
 * 股関節中心を基準にした骨盤 3 点の位置。up（骨盤の「上」の向き）と fwd（その前方）で置く。
 * 総長 1.0 に対する比なので、0.06 ≒ 8cm（CM_PER_UNIT 換算）程度。
 *
 * 初版（PSIS 0.055/0.02・ASIS 0.04/0.045・坐骨 0.045/0.025）は体幹・大腿の管
 * （太さ 12.5px ≒ 0.036 unit）にほぼ呑まれて読めなかったので、頂点が管の外へ
 * はっきり出る寸法へ広げてある（2026-08-05 実機確認）。
 *
 * `PELVIS_SCALE` は形を保ったまま全体を拡縮する倍率。頂点ごとの比を触ると別の形に
 * なってしまうので、大きさの調整はここだけで行う（2026-08-07 に 1.0 → 0.75 → 0.8 → 0.85）。
 *
 * ASIS の前方量だけは倍率と別に詰めてある（0.06 → 0.045）。直立（ロックアウト）では
 * 骨盤がほぼ立つので ASIS が体の前面から飛び出して見えたため（2026-08-07 実機確認）。
 *
 * **股関節が三角の内側に十分収まること**が要件（2026-08-07）。股関節の白抜き円をやめた
 * ので、大腿と体幹の管の端（丸い蓋）は三角の白い塗りで隠すしかない。管の半幅は
 * 12.5px/2 ＝ 6.25px なので、**股関節から三角のどの辺までも 6.25px 以上**必要
 * （側面レイアウトの s=345 が最も厳しい ＝ 0.0181 モデル単位）。
 * ASIS を上 0.03 に置いていたときは前下の辺までが 3.1px しかなく、管の蓋が三角から
 * はみ出して「脚と上体の切れ目」に見えていた。ASIS を股関節とほぼ同じ高さまで下げ、
 * 坐骨を少し下げて辺を寝かせることで 6.7px を確保した（大きさ・輪郭はほぼ不変）。
 *
 * さらに同日、**構えで骨盤が尻側へ寄りすぎて見える**ため、三角全体を局所の
 * 前 +0.006・上 +0.010 だけずらした（構えでは体幹が寝ているので、局所の「上」が
 * 画面の右斜め上に当たる ＝ 指定どおりの向き）。上へずらすと前下の辺が股関節に
 * 近づいてクリアランスを失うので、坐骨は下げたままにして辺の位置を保っている。
 */
const PELVIS_SCALE = 0.85
const PELVIS_PSIS_UP = 0.063 * PELVIS_SCALE
const PELVIS_PSIS_BACK = 0.029 * PELVIS_SCALE
const PELVIS_ASIS_UP = 0.018 * PELVIS_SCALE
const PELVIS_ASIS_FWD = 0.051 * PELVIS_SCALE
const PELVIS_ISCHIUM_DOWN = 0.062 * PELVIS_SCALE
const PELVIS_ISCHIUM_BACK = 0.032 * PELVIS_SCALE

/**
 * 股関節中心と「上」の向きから骨盤の三角を組む。
 *
 * `upDir` = 骨盤の「上」方向の単位ベクトル（脊柱下端の接線。無い場合は股→肩の向き）。
 * 呼び出し側の計算をそのまま使えるよう、長さは中で正規化する（ゼロ長なら鉛直上向き）。
 */
export function pelvisOf(hip: Vec, upDir: Vec): Pelvis {
  const len = Math.hypot(upDir.x, upDir.y)
  const up: Vec = len > 0 ? { x: upDir.x / len, y: upDir.y / len } : { x: 0, y: 1 }
  // up を「前へ」90° 回す（x 前方正・y 上方正なので、up=(0,1) のとき fwd=(1,0)）
  const fwd: Vec = { x: up.y, y: -up.x }
  const at = (alongUp: number, alongFwd: number): Vec => ({
    x: hip.x + up.x * alongUp + fwd.x * alongFwd,
    y: hip.y + up.y * alongUp + fwd.y * alongFwd,
  })
  return {
    psis: at(PELVIS_PSIS_UP, -PELVIS_PSIS_BACK),
    asis: at(PELVIS_ASIS_UP, PELVIS_ASIS_FWD),
    ischium: at(-PELVIS_ISCHIUM_DOWN, -PELVIS_ISCHIUM_BACK),
  }
}
