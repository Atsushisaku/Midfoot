/**
 * 経路B：エラー由来の腰椎の丸まり（エラー例ページ専用）。
 *
 * `./metrics` と同じ規約: 純関数のみ・DOM に一切触れない。
 *
 * 本編（`../deadlift/spine`）が出す κ_A は「可動域が尽きて丸まる」だけを表すので、
 * どのエラーを選んでも増えない（エラーはむしろ股屈曲を減らす）。実際に丸まる主因は
 * 力の問題で幾何からは出せないため、ここで**置きの値**を作って
 * `SpineOptions.kappaExtraDeg` から合流させる。
 *
 * 本編に置かないのは、**本編が error 配下へ依存する向きを作らない**ため
 * （エラー例ページが本編を参照する側）。この向きは `../deadlift/spine` の
 * `hipAngleDeg` を写してある理由と同じ。
 */

import { clamp } from '../geometry'
import type { DlPose } from '../deadlift/geometry'
import { hipAngleDeg, kneeAngleDeg, metricsOf } from './metrics'

/**
 * ハム長の代理量（度）。股関節屈曲量 ＋ 膝伸展量（`docs/error-app-requirements.md` §11.4）。
 * ハムは股関節と膝をまたぐので、股が屈曲するほど・膝が伸びるほど引き伸ばされる。
 */
export function hamProxyDeg(pose: DlPose): number {
  return 180 - hipAngleDeg(pose) + kneeAngleDeg(pose)
}

/**
 * バーの梃子 ÷ 上体の梃子の重み比。**等重みの見なし**（2026-08-06 に 2 → 1 へ）。
 *
 * `./metrics` は「質量比の仮定を置かない」方針でバーの梃子と上体の梃子を分けて返すが、
 * 腰の曲げモーメントを 1 本の量にするには足すしかなく、足すには重み付けが要る。
 * ここは**エラーの描写のため**なので、この仮定を 1 つだけ置く。
 *
 * 当初は実重量比（バー ≈ 1.3×体重、上体〈体幹＋腕〉≈ 0.68×体重 → 比 ≈ 2）を採ったが、
 * それだと「上体の立てすぎ」に丸まりが出てしまう。腰を落として上体を立てると
 * L5/S1 がバーから後ろへ離れるので、バーの梃子の伸び（重度 t=0.6 で +11.0cm）が
 * 上体の梃子の縮み（−10.1cm）を上回り、R_BAR=2 の重み付けでは超過 11.9cm ≒ κ_B 10° が残る。
 * 「立てすぎでは丸まらない」という指導実感（要件 §11.4 の検討とも一貫）のほうを実重量比より
 * 優先し、**等重み**に置き直した。これで立てすぎの超過は軽度・中等度がほぼ 0（全 t で 1° 未満）、
 * 重度も終盤（t≥0.6）に 1〜3cm 残るだけになる。
 */
export const R_BAR = 1

/**
 * 腰の曲げモーメントの代理量（cm）。バーの梃子 × R_BAR ＋ 上体自重の梃子。
 *
 * ぶっこ抜きでは腰が上がって上体が寝るぶん L5/S1 がバーに近づくので**バーの梃子は縮む**が、
 * 上体自身の梃子は伸びる。2 本を足して初めて「ぶっこ抜きは腰にこたえる」が量として出る。
 */
export function loadProxyCm(pose: DlPose): number {
  const m = metricsOf(pose)
  return R_BAR * m.l5s1ArmCm + m.upperArmCm
}

/**
 * 経路B（エラー由来）の置き κ の内訳（度）。`ref` は**同じ t の最適フォーム**。
 *
 * どちらも最適超過分（max(0, err − ref)）なので、超過が負のエラーでは 0 ＝ 丸まらない、
 * という向きが実測から自動で出る。
 *
 * 「上体の立てすぎ」はハム由来が全 t・全 3 段で 0（超過 −12〜−33°）。荷重由来も R_BAR=1 に
 * してからは軽度・中等度が全 t で 1° 未満、重度も終盤（t=0.75）の 4.8° が最大になった
 * （2026-08-06 の実測。R_BAR=2 のときは重度が t=0.6 で 10° まで出ていた）。
 */
export interface ErrorKappa {
  /** ハム由来：張ったハムが坐骨結節を介して骨盤を後傾へ引く */
  readonly hamDeg: number
  /** 荷重由来：腰の曲げモーメントが背中を負かす */
  readonly loadDeg: number
}

/** GLSL と同じ smoothstep。`../deadlift/geometry` の同名関数は private なので式だけ写す */
function smoothstep(e0: number, e1: number, x: number): number {
  const u = clamp((x - e0) / (e1 - e0), 0, 1)
  return u * u * (3 - 2 * u)
}

/** 経路B の効きが構え（t=0）で持つ比率。荷重が乗る前は張りがあってもまだ耐えている、の見なし */
export const KAPPA_B_SETUP_FRAC = 0.35

/** 経路B が全開になる挙上進行度。バーが膝を過ぎる（セカンドプル序盤）あたり */
export const KAPPA_B_FULL_T = 0.45

/**
 * 経路B に掛ける時間窓。
 *
 * ham/load はどちらも**静的な幾何量**（その t の姿勢だけで決まる超過）なので、そのまま使うと
 * 構えの時点でほぼピークになる（旧較正でぶっこ抜き中等度が t=0 で 8.6°〈うち荷重 4.7°〉・
 * t=0.15 で 9.1°）。
 * 実際は「セッティングの丸まりはまし → ファーストプル〜セカンドプル序盤（バーが膝を過ぎる
 * あたり）が一番丸まる → フィニッシュでまっすぐ」（atsushi さん、2026-08-06）。背中が負けるのは
 * **荷重が乗ってから**なので、構えでは効きを KAPPA_B_SETUP_FRAC まで落としておく。
 *
 * **κ_A（可動域由来）には掛けない**。可動域が尽きていれば構えから丸いのは物理そのもので、
 * 「まだ耐えている」余地がないため。
 */
function kappaBWindowOf(t: number): number {
  return (
    KAPPA_B_SETUP_FRAC + (1 - KAPPA_B_SETUP_FRAC) * smoothstep(0, KAPPA_B_FULL_T, clamp(t, 0, 1))
  )
}

/**
 * ハム超過 1° あたりの腰椎屈曲（度/度）。
 *
 * 較正（標準体格・腕標準・ナロー・hipHeight 0.5・ROM 120、時間窓こみ、t を 0.05 刻みで掃引）:
 * **ぶっこ抜き中等度**のハム超過は t=0.175 の 13.7° を頂点に、t=0.45 で 7.2° まで落ちてから
 * t=0.575 で 9.1° へ戻る二こぶ型。時間窓を掛けるとこの 2 つの山がほぼ平らにならされ、
 * キリのよい 1.0 で κ_B(0) = 4.4°・最大 8.6°（t=0.55）になって目標（構え 3〜5°・山 8〜12°）に入る。
 *
 * ぶっこ抜きで荷重超過が t≥0.2 で出ないのは、腰が上がって上体が寝るとバーの梃子が縮むため。
 * 要件 §4 が「ぶっこ抜きではバーの梃子はむしろ縮む」と書いているとおりの向き。R_BAR を
 * 2 → 1 にしても構えの荷重超過（中等度 t=0 で 2.7 → 1.5cm）が減るだけで、この向きは変わらない。
 */
export const C_HAM = 1.0

/**
 * 荷重超過 1cm あたりの腰椎屈曲（度/cm）。
 *
 * 同じ条件で**バーが遠い中等度は荷重超過だけが効く**（ハム超過は全 t で負 ＝ 0）。
 *
 * R_BAR を 2 → 1 にすると、バーが遠いの超過（バーの梃子がそのまま伸びるエラー）も
 * ほぼ半分に縮む（中等度の山 9.7 → 4.8cm）。エラーの見え方は変えたくないので、係数を
 * 0.8 → **1.6** へ倍にして補償する。山は t=0.6 の 7.7°（目安 5〜9°）で、R_BAR=2・0.8 の
 * ときの 7.8° をほぼ保つ。この値でも「上体の立てすぎ」は重度の 4.8° が最大に収まる。
 */
export const C_LOAD = 1.6

/** `t` は挙上進行度。ham/load とも時間窓（`kappaBWindowOf`）で構え側を薄くする */
export function errorKappaOf(err: DlPose, ref: DlPose, t: number): ErrorKappa {
  const w = kappaBWindowOf(t)
  return {
    hamDeg: w * C_HAM * Math.max(0, hamProxyDeg(err) - hamProxyDeg(ref)),
    loadDeg: w * C_LOAD * Math.max(0, loadProxyCm(err) - loadProxyCm(ref)),
  }
}

/**
 * 置き κ（`ErrorEntry.kappaAddDeg`）が効き始めから消えるまでの t。
 * `../deadlift/geometry` の `ERROR_FADE_START`（private）と同じ 0.6 で、
 * 「フィニッシュは模範と一致する」規約（要件 §12.1）に揃えるため。
 */
export const KAPPA_ADD_FADE_START = 0.6

/**
 * 置き κ を t で整形した値（度）。
 *
 * 置き κ も経路B なので、立ち上がりは `kappaBWindowOf` の時間窓を掛ける。落ちるほうは
 * 姿勢に紐づかない値なので自分で消す必要がある（経路B の ham/load は姿勢の収束で
 * 自動的に 0 へ戻るが、置き κ は戻らない）。結果は構え 0.35 倍 → t=0.45〜0.6 で満額 →
 * t=1 で 0 の山になる。
 */
export function fadedKappaAddDeg(addDeg: number, t: number): number {
  const u = clamp(t, 0, 1)
  return addDeg * kappaBWindowOf(u) * (1 - smoothstep(KAPPA_ADD_FADE_START, 1, u))
}
