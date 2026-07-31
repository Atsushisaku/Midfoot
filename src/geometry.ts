/**
 * スクワット姿勢の幾何モデルと解法。
 * 仕様: docs/squat-visualizer-spec.md §4 / §5
 *
 * このモジュールは純関数のみ。DOM に一切触れない。
 * 長さは全て無次元（総長 L_shank + L_femur + L_torso = 1.0）。
 * 外部インターフェースの角度は「度」、内部計算はラジアン。
 */

export const DEG = Math.PI / 180

// ---------------------------------------------------------------------------
// 定数（仕様 §4）
// ---------------------------------------------------------------------------

/** セグメント長の基準値。倍率 1.0 のときこの比になる（§4.8） */
export const BASE_SEGMENTS = { shank: 0.32, femur: 0.31, torso: 0.37 } as const

/**
 * 足関節の位置（L_foot 比、§4.1）。
 *
 * x は 0.20。足首関節はかかと後端から足長の約 20%（26cm の足で約 5cm）にあるという
 * 解剖学的事実に合わせた値。Rev.12 まで 0.25 にしていたが、デッドリフト版を作る際に
 * かかとが長すぎることが分かったので、両種目でこちらに揃えた（2026-08-01）。
 * 足関節が後ろに寄ると中足部までの距離が伸びるので、上体はわずかに深く前傾する。
 */
const ANKLE_X_RATIO = 0.2
const ANKLE_Y_RATIO = 0.2
/** 中足部の位置（L_foot 比、§4.1） */
const MID_X_RATIO = 0.5
/** 靴の回転支点＝中足骨頭の位置（L_foot 比、§4.4） */
export const K_PIVOT = 0.7

/** 膝の描画半径相当（L_femur 比、§4.7） */
const R_KNEE_RATIO = 0.06
/** ボトムで IPF ラインをどれだけ越えるか（L_femur 比、§4.7） */
const D_DEEP_RATIO = 0.1

/** 上体前傾角の許容範囲（度、§5） */
export const TORSO_MIN_DEG = -10
export const TORSO_MAX_DEG = 90
/** これを超えたら注意表示（度、§5） */
export const TORSO_WARN_DEG = 70

/** 足部の回転量の上限と、超過量に対するゲイン（度、§5） */
const FOOT_ROT_MAX_DEG = 15
const FOOT_ROT_GAIN_DEG = 60

/**
 * ボトムでの大腿角 θ_f（度）。
 * sin θ_f = (r_knee - d_deep) / L_femur = R_KNEE_RATIO - D_DEEP_RATIO なので
 * L_femur に依存せず一定になる。
 */
export const FEMUR_BOTTOM_DEG = Math.asin(R_KNEE_RATIO - D_DEEP_RATIO) / DEG

/** L_foot の下限。0 除算とスライダー端の破綻を防ぐ */
const MIN_FOOT = 0.05

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

export interface Vec {
  readonly x: number
  readonly y: number
}

/** 担ぎ位置（§4.3） */
export type BarPosition = 'high' | 'low'

/** r = 上体長比、d = 後方オフセットの L_torso 比 */
export interface BarParams {
  readonly r: number
  readonly d: number
}

export const BAR_PARAMS: Record<BarPosition, BarParams> = {
  high: { r: 1.0, d: 0.03 },
  low: { r: 0.87, d: 0.08 },
}

/**
 * ハイ／ローの補間アニメーション（§8.1）のため、担ぎ位置は
 * プリセット名だけでなく中間値そのものも受け取れるようにする。
 * 中間値でも毎フレーム §4.6 を解き直すので、バーは常に中足部の真上に載る。
 */
export type BarSpec = BarPosition | BarParams

function resolveBar(spec: BarSpec): BarParams {
  return typeof spec === 'string' ? BAR_PARAMS[spec] : spec
}

/** 靴（§4.4） */
export type Shoe = 'flat' | 'running' | 'lifting'

/**
 * ヒール高 h。総長基準の絶対値であって足長比ではない（§4.4 の注記）。
 * h は「かかとが前足部よりどれだけ高いか」＝ドロップに相当する。
 * スニーカーの一般的なドロップは 8〜12mm なので 10mm 相当とする
 * （Rev.10 まで 20mm にしていたが過大だった。1mm ≈ 0.000735）。
 */
export const SHOE_HEEL: Record<Shoe, number> = {
  flat: 0,
  running: 0.00735,
  lifting: 0.0183,
}

/** 靴も補間アニメーションのため生のヒール高を受け取れる */
export type ShoeSpec = Shoe | { readonly h: number }

function resolveHeel(spec: ShoeSpec): number {
  return typeof spec === 'string' ? SHOE_HEEL[spec] : spec.h
}

/** 体格パラメータ。セグメントは「基準値からの倍率」で持つ（§4.8） */
export interface Body {
  readonly mShank: number
  readonly mFemur: number
  readonly mTorso: number
  /** 足長（総長比）。正規化には含めない */
  readonly foot: number
  /** 足首の背屈可動域（度） */
  readonly romDeg: number
}

/** 正規化後のセグメント長。shank + femur + torso === 1 */
export interface Segments {
  readonly shank: number
  readonly femur: number
  readonly torso: number
  readonly foot: number
}

export interface PoseInput {
  readonly body: Body
  readonly bar: BarSpec
  readonly shoe: ShoeSpec
  /**
   * 足首の可動域をどれだけ使うか 0〜1（§4.5）。
   *
   * 度数で受け取らないのが要点。比率で持つと「可動域を超える入力」が原理的に
   * 存在しなくなるので、クランプも、それに伴う警告表示も要らなくなる。
   * 現場の語彙では「膝をどれだけ前に送るか／どれだけ後ろに座るか」。
   */
  readonly shankUsage: number
  /** 深さ進行度 0（立位）〜1（ボトム）（§4.7） */
  readonly p: number
}

/**
 * つま先の浮き（§5）。
 *
 * かかと浮きは扱わない。股関節が中足部より前に出たときに起きる状態だが、
 * 股関節は必ず膝より後ろにあり、膝は `L_shank·sin θ_s` しか前に出ないうえ
 * `θ_s ≤ ROM + φ` で頭打ちになるので、この経路は構造的に塞がっている。
 * そもそもバーベルスクワットでかかとが浮くことはほぼない（指導者の判断、2026-07）。
 */
export type LiftState = 'none' | 'toe'

export interface Pose {
  readonly seg: Segments

  // 関節（描画用）
  readonly ankle: Vec
  readonly knee: Vec
  readonly hip: Vec
  readonly shoulder: Vec
  readonly bar: Vec

  // 足部。つま先が浮いているときは回転済みの座標が入る。
  // 描画は heel → ball → toe の折れ線。
  readonly heel: Vec
  /** 中足骨頭（かかとから K_PIVOT × 足長）。靴のヒールが足部を傾ける支点でもある */
  readonly ball: Vec
  readonly toe: Vec
  readonly mid: Vec
  /** バランス基準となる中足部の x。足部が回転しても動かさない（§6） */
  readonly midX: number

  // 角度（度）
  /** 現在の深さ p での脛前傾角 */
  readonly shankDeg: number
  /** ROM + φ。この体格とこの靴で出せる脛前傾角の上限 */
  readonly shankMaxDeg: number
  /** 可動域の使用率 0〜1 */
  readonly shankUsage: number
  readonly femurDeg: number
  /** 許容範囲にクランプ後の上体前傾角 */
  readonly torsoDeg: number
  /** 靴による足部の前傾角 φ */
  readonly heelTiltDeg: number
  /** 足部の描画回転角（つま先上がり方向、度）。浮いていなければ 0 */
  readonly footRotDeg: number

  // 高さの基準
  /** IPF 合格ライン y = K_y + r_knee */
  readonly ipfLineY: number

  // 状態フラグ（§5）
  readonly lift: LiftState
  readonly torsoWarn: boolean
}

// ---------------------------------------------------------------------------
// 補助
// ---------------------------------------------------------------------------

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function rotate(p: Vec, pivot: Vec, angleDeg: number): Vec {
  const a = angleDeg * DEG
  const c = Math.cos(a)
  const s = Math.sin(a)
  const dx = p.x - pivot.x
  const dy = p.y - pivot.y
  return { x: pivot.x + dx * c - dy * s, y: pivot.y + dx * s + dy * c }
}

// ---------------------------------------------------------------------------
// 体格の正規化（§4.8）
// ---------------------------------------------------------------------------

/**
 * 倍率で与えられた体格を、総長 1.0 のセグメント長に正規化する。
 * 足長は正規化に含めず、総長比としてそのまま通す。
 */
export function normalize(body: Body): Segments {
  const rawShank = BASE_SEGMENTS.shank * body.mShank
  const rawFemur = BASE_SEGMENTS.femur * body.mFemur
  const rawTorso = BASE_SEGMENTS.torso * body.mTorso
  const sum = rawShank + rawFemur + rawTorso
  return {
    shank: rawShank / sum,
    femur: rawFemur / sum,
    torso: rawTorso / sum,
    foot: Math.max(MIN_FOOT, body.foot),
  }
}

// ---------------------------------------------------------------------------
// 靴（§4.4）
// ---------------------------------------------------------------------------

/**
 * ヒール高による足部の前傾角 φ（度）。
 * 支点はつま先ではなく中足骨頭（かかとから k_pivot × 足長）。
 * h を総長基準で持っているので、足が大きいほど φ は小さくなる。
 */
export function heelTiltDeg(shoe: ShoeSpec, foot: number): number {
  const h = resolveHeel(shoe)
  if (h <= 0) return 0
  const lever = K_PIVOT * Math.max(MIN_FOOT, foot)
  return Math.asin(clamp(h / lever, -1, 1)) / DEG
}

// ---------------------------------------------------------------------------
// 解法（§4.5 〜 §4.7）
// ---------------------------------------------------------------------------

export function solvePose(input: PoseInput): Pose {
  const seg = normalize(input.body)
  const { shank, femur, torso, foot } = seg

  // --- 脛前傾角（§4.5）---
  // 可動域 ROM に靴のヒールぶん φ を足したものが上限で、その何割を使うかを入力に取る。
  // 上限を超える状態が作れないので、クランプも警告も不要になる。
  const phi = heelTiltDeg(input.shoe, foot)
  const shankMaxDeg = input.body.romDeg + phi
  const usage = clamp(input.shankUsage, 0, 1)
  const shankDeg = usage * shankMaxDeg

  // --- 足部と足関節（§4.1）。靴は幾何に反映しない（§4.4） ---
  const ankle: Vec = { x: ANKLE_X_RATIO * foot, y: ANKLE_Y_RATIO * foot }
  const midX = MID_X_RATIO * foot

  // --- 深さ進行度による補間（§4.7） ---
  const p = clamp(input.p, 0, 1)

  // 脛：序盤に速く倒れ、ボトムで飽和する。
  const thetaS = shankDeg * Math.sin(p * 90 * DEG)
  const knee: Vec = {
    x: ankle.x + shank * Math.sin(thetaS * DEG),
    y: ankle.y + shank * Math.cos(thetaS * DEG),
  }

  // 大腿：立位の 90°（垂直）からボトムの FEMUR_BOTTOM_DEG まで、角度を線形に振る。
  //
  // 股関節「高さ」を p に対して線形に補間してはいけない。バランス条件に効くのは
  //   c = 0.25·L_foot − L_shank·sin θ_s + L_femur·cos θ_f
  // であり、高さ線形だと θ_f = asin(...) が立位付近で一気に動いて早々に飽和する。
  // その後は脛の前傾だけが進んで股関節を前に押し戻すため、ボトム手前で上体が
  // 最大 8° 起き上がる（脛が長い体格ほど顕著）。角度を線形に振れば dc/dp は
  // ほぼ全域で正になり、股関節の角速度が一定になるので動きも実際のしゃがみに近い。
  const femurDeg = 90 + p * (FEMUR_BOTTOM_DEG - 90)
  const femurRad = femurDeg * DEG
  const hip: Vec = {
    x: knee.x - femur * Math.cos(femurRad),
    y: knee.y + femur * Math.sin(femurRad),
  }

  const rKnee = R_KNEE_RATIO * femur

  // --- バランス条件（§4.6-4） ---
  const { r, d } = resolveBar(input.bar)
  const a = r * torso
  const b = d * torso
  const c = midX - hip.x
  const R = Math.hypot(a, b)
  const psi = Math.atan2(b, a)

  // θ_t = 90°（上体が水平）のとき (B_x − H_x) は最大値 a を取る。
  // これを超える c は「バーを中足部まで後ろに置けない」＝後方に倒れる状態（§5）。
  const reachMax = a

  let lift: LiftState = 'none'
  let torsoDeg: number
  let excess = 0

  if (c > reachMax) {
    lift = 'toe'
    torsoDeg = TORSO_MAX_DEG
    excess = c - reachMax
  } else {
    // 逆側（c が負に振り切れてバーが中足部より前にしか置けない＝かかと浮き）は
    // 構造的に到達不能なので状態としては扱わず、角度を許容範囲に丸めるだけにする。
    torsoDeg = clamp((psi + Math.asin(clamp(c / R, -1, 1))) / DEG, TORSO_MIN_DEG, TORSO_MAX_DEG)
  }

  const tRad = torsoDeg * DEG
  const u: Vec = { x: Math.sin(tRad), y: Math.cos(tRad) }
  const n: Vec = { x: -Math.cos(tRad), y: Math.sin(tRad) }

  const shoulder: Vec = { x: hip.x + torso * u.x, y: hip.y + torso * u.y }
  const barPos: Vec = { x: hip.x + a * u.x + b * n.x, y: hip.y + a * u.y + b * n.y }

  // --- 足部の描画回転（§5） ---
  const footRotDeg =
    lift === 'toe' ? Math.min(FOOT_ROT_MAX_DEG, (FOOT_ROT_GAIN_DEG * excess) / foot) : 0
  const ballX = K_PIVOT * foot

  /** 床上の点を描画位置へ写す。つま先浮きのときだけ、足部全体がかかとを支点に回る */
  const footPoint = (x: number): Vec =>
    lift === 'toe' ? rotate({ x, y: 0 }, { x: 0, y: 0 }, footRotDeg) : { x, y: 0 }

  return {
    seg,
    ankle,
    knee,
    hip,
    shoulder,
    bar: barPos,
    heel: footPoint(0),
    ball: footPoint(ballX),
    toe: footPoint(foot),
    mid: footPoint(midX),
    midX,
    shankDeg: thetaS,
    shankMaxDeg,
    shankUsage: usage,
    femurDeg,
    torsoDeg,
    heelTiltDeg: phi,
    footRotDeg,
    ipfLineY: knee.y + rKnee,
    lift,
    torsoWarn: torsoDeg > TORSO_WARN_DEG,
  }
}

/** 立位ゴースト。通常の解法に p = 0 を入れるだけ（§4.9） */
export function solveStanding(input: PoseInput): Pose {
  return solvePose({ ...input, p: 0 })
}
