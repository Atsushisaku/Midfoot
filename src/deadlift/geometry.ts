/**
 * デッドリフト姿勢の幾何モデルと解法。
 * 仕様: docs/deadlift-proto-spec.md §1 〜 §3
 *
 * スクワット版（`../geometry`）と同じ規約: 純関数のみ・DOM に一切触れない。
 * 長さは無次元（L_shank + L_femur + L_torso = 1.0）、外部インターフェースの角度は「度」。
 * 座標は x 前方正・y 上方正、床 y=0、かかと x=0。
 */

import { BASE_SEGMENTS, DEG, K_PIVOT, clamp, type Segments, type Vec } from '../geometry'

// ---------------------------------------------------------------------------
// 定数（仕様 §1 / §2 / §3）
// ---------------------------------------------------------------------------

/**
 * cm 換算係数（仕様 §1）。1 unit ≈ 身長の 0.779 倍で、身長は H=170cm 固定とみなす。
 * 表示と report のためだけの値で、解法には一切入らない。
 */
export const CM_PER_UNIT = 132.4

/** 腕（肩峰→グリップ）の基準長。倍率 mArm が掛かる。正規化には含めない（仕様 §3-1） */
export const ARM_BASE = 0.488

/**
 * 足関節の位置（L_foot 比、仕様 §1 / Rev.5-1）。
 *
 * x は 0.20。足首関節はかかと後端から足長の約 20%（26cm の足で約 5cm）にあるという
 * 解剖学的事実に合わせた DL ローカルの値で、スクワット版（`../geometry` の 0.25）は
 * 触らない。開始姿勢への影響は +0.1° 程度（Rev.5 で検算済み）。
 */
const ANKLE_X_RATIO = 0.2
const ANKLE_Y_RATIO = 0.2
/** 中足部の位置（L_foot 比、仕様 §1） */
const MID_X_RATIO = 0.5

/** L_foot の下限（仕様 §3-8）。0 除算とスライダー端の破綻を防ぐ */
const MIN_FOOT = 0.05

/**
 * スタンス射影の係数（仕様 §3-2）。大腿は開き角 α をそのまま矢状面へ射影し、
 * 脛は股関節の外転に対して傾きが小さいので 0.3α で射影する。
 */
const SHANK_PROJECTION_RATIO = 0.3

/**
 * 膝の前方量（仕様 §3-5）。腰を低く構えるほど膝が前に出る。
 * hipHeight=0.5 → kneeFwd=0.0255 ≒ シャフトが脛に触れる位置。
 */
const KNEE_FWD_LOW = 0.045
const KNEE_FWD_HIGH = 0.006

/**
 * 膝が後退し始める／終わる挙上進行度（仕様 §3-5）。
 * 「バーが膝を過ぎたら膝が後退する」を固定スケジュールで表す。
 */
const KNEE_RETREAT_START = 0.25
const KNEE_RETREAT_END = 0.75

/**
 * ロックアウトでの膝の前方量（Rev.5-2）。
 * 旧モデルはトップで脛を鉛直（0）に戻していたが、実際のロックアウトでは脚全体が
 * わずかに前傾して骨盤がバーの下に入る（hips through）。0 ではなく 0.02 に着地させる。
 */
export const KNEE_AHEAD_TOP = 0.02

/**
 * ロックアウトで規定する大腿角 φ（度、Rev.10）。負＝股関節が膝より前に出る。
 * 膝の前方量 KNEE_AHEAD_TOP と合わせて骨盤をバーの下へ送り込む（hips through）。
 */
export const PHI_TOP_DEG = -2

/**
 * ロックアウトで規定する上体角（度、Rev.10）。負＝肩が股関節より後ろ。
 * 完全なロックアウトは体幹が鉛直をわずかに越えて後傾し、肩峰が大転子の後ろに来る。
 * −4° は標準体格で肩が股関節の約 3.4cm 後方（体幹長 0.37 × sin4°）。
 */
export const TORSO_TOP_DEG = -4

/**
 * 規定のロックアウト姿勢へ寄せ始める挙上進行度（Rev.10）。
 * ここから t=1 まで smoothstep で角度を寄せる。両端で微分が 0 なので、
 * 重心解からの離脱もロックアウトへの着地も滑らかになる。
 */
export const LOCK_BLEND_START = 0.8

/**
 * 腰の先行（`hipLead`）が立ち上がりきる挙上進行度（Rev.11）。
 * t=0 では最適と同じ姿勢にし、バーが床を離れた直後に崩れ切らせる。
 */
const HIP_LEAD_RAMP_END = 0.2

/**
 * エラーの逸脱を消し始める挙上進行度（Rev.11）。
 *
 * **エラーのあるフォームでも、立ち切った姿勢は模範とほぼ同じになる。**
 * バーは腿に当たるので前には残れないし、膝も股関節も伸び切るしかない。
 * エラーは「フィニッシュが違う」のではなく「そこへ至る道のりに無駄が多い」もの、
 * という観察に合わせて、ここから t=1 にかけて逸脱を 0 へ戻す。
 *
 * `hipLead` にも掛ける。角度のほうはロックアウトへの寄せ（Rev.10）が t=1 で上書きするが、
 * `hipLead` は膝の前方量にも効いていて**そちらは寄せの対象外**だから。掛けないと
 * フィニッシュの膝が 0.7cm 前に残り、股関節が 1cm ずれた（実測）。
 */
const ERROR_FADE_START = 0.6

/**
 * 腰の先行（`hipLead`）で φ を走査するときの刻みと上限（度、Rev.11）。
 * この範囲で「まだ成立する姿勢」の端を探し、hipLead=±1 をその端に対応させる。
 */
const HIP_LEAD_SCAN_DEG = 0.5
const HIP_LEAD_SCAN_STEPS = 80

/**
 * 腰の先行で認める腕の前傾の上限（度、Rev.11）。
 *
 * 膝とバーが決まると姿勢の自由度は φ の 1 つだけなので、腰を上げると肩は腕の円に
 * 沿って前へ滑る。上げすぎると交点が破綻側の枝へ飛ぶ（実測で肩がバーの 40cm 前、
 * 腕の傾き 40° まで飛び出した）。
 *
 * 上限を肩の絶対位置ではなく**腕の傾き**で置くのは、そちらに物理的な根拠があるため。
 * バーは手にぶら下がっているので、肩がバーより前に出るほどバーは前へ振れようとする。
 * 20° を超える腕の角度を保つのは実際には無理で、その前にバーが体から離れる
 * （＝別のエラーへ移行する。この連鎖のモデル化は今後の課題）。
 */
const ARM_AHEAD_MAX_DEG = 20

/**
 * ロックアウトでの身体重心 x の目標（Rev.5-2）。
 * 立位の自然な身体重心は足首とミッドフットの間（≈0.06〜0.07）にあるので、
 * 挙上に合わせて目標をそこへ動かす。これがないと腰がバーの後方に取り残される。
 * この結果、入力の `comPos` は「開始時（t=0）の重心位置」という意味になる。
 *
 * Rev.10 以降、t=1 の姿勢そのものは重心拘束ではなく PHI_TOP_DEG / TORSO_TOP_DEG で
 * 規定する（理由は同節を参照）。この値は t<1 の目標としてだけ効く。規定姿勢が実際に
 * 持つ重心は 0.056〜0.062（体格による）で、ここと整合していることをテストで固定してある。
 */
export const COM_TOP = 0.06

/**
 * 脛の中心線とバー中心の最小水平距離（unit、Rev.6）。
 * 脛の描画半幅 ≈2cm ＋ バー軸の余白で 2.9cm 相当。標準体格の開始姿勢が自然に持つ
 * クリアランス 0.0239 よりわずかに小さく取ってあるので、標準の開始姿勢は変わらない。
 */
export const BAR_CLEARANCE = 0.022

/**
 * 身体重心 x の目標位置の既定値（Rev.3）。0=かかと、1=中足部。
 * 0.3 は comT=0.03 ≒ かかと前方 4cm。実測 COP（足長の 35〜40%）と高重量時の
 * 荷重比から逆算した現実的な既定値。
 */
export const COM_POS_DEFAULT = 0.3

/**
 * 体節の質量比（Rev.3）。Winter, *Biomechanics and Motor Control of Human Movement* の
 * 標準体節質量比を、矢状面 2D の 5 体節（足・下腿・大腿・体幹+頭・腕）に丸めた値。
 * 左右をまとめてあるので合計 1.0。矢状面射影にも同じ質量を使う見なし。
 */
export const SEGMENT_MASS = {
  foot: 0.029,
  shank: 0.093,
  femur: 0.2,
  torso: 0.578,
  arm: 0.1,
} as const

/**
 * 節内重心の位置（近位からの比、Rev.3）。同じく Winter の標準値。
 * 体幹は頭部込みなので、体幹単体の 0.5 より遠位（肩寄り）の 0.60 になる。
 */
export const COM_RATIO = {
  /** 膝から足首へ */
  shank: 0.433,
  /** 股から膝へ */
  femur: 0.433,
  /** 股から肩へ */
  torso: 0.6,
  /** 肩からバーへ */
  arm: 0.43,
} as const

/**
 * 大腿角 φ の走査範囲と刻み（Rev.3 / Rev.5-3）。φ=0 が膝の真上、増えるほど股関節が後方へ回る。
 * 140° まで見れば、現実的な体格では深いヒンジまで全部入る。
 * 下端は 0°。hips through（Rev.5）でもロックアウトの解は φ≈+2° に来る
 * （膝終端 KNEE_AHEAD_TOP が脚の前傾を担うため、負側の走査は不要）。
 * 負側まで走査すると「上体が後方へ倒れ込んだ非物理枝」の交差を全域 4131 ケース中
 * 4 件だけ拾い、その全部がグリッチ（トップ直前で背角が 104° に飛ぶ）だったので
 * 0° 開始に戻した（2026-07-31 検証）。
 * 2° 刻みで根を括ってから二分法 50 回（区間幅 2°/2^50 ＝ 倍精度の下限まで詰まる）。
 *
 * Rev.10: ロックアウトの hips through（φ<0）は走査ではなく規定値 PHI_TOP_DEG への
 * 寄せで作るので、ここは 0° 開始のままでよい。
 */
const PHI_MIN_DEG = 0
const PHI_MAX_DEG = 140
const PHI_STEP_DEG = 2
const BISECT_ITER = 50

/**
 * 姿勢として認める背角の上限（度、Rev.5-3）。
 * 走査を負の φ まで広げると、上体が後方へ倒れ込んだ非物理枝が中間の t で
 * 交差として現れうる。鉛直から 15° の後傾（背角 105°）までを物理的な範囲とみなし、
 * それを超える枝は解の候補から外す。
 */
const BACK_HORIZ_MAX_DEG = 105

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

/** 体格パラメータ。セグメントは「基準値からの倍率」で持つ（仕様 §2） */
export interface DlBody {
  readonly mShank: number
  readonly mFemur: number
  readonly mTorso: number
  /** 腕（肩峰→グリップ）倍率。ARM_BASE に掛かる。正規化には含めない */
  readonly mArm: number
  /** 足長（総長比）。正規化には含めない */
  readonly foot: number
}

/** バーセッティング（仕様 §2） */
export type BarSetting = 'standard' | 'block' | 'deficit' | 'small'

/**
 * バー中心の床からの高さ（unit）。
 * 由来: 22.5cm（20kg プレート半径）/ 132.4、+5cm ブロック、−5cm デフィシット、r=15cm 小径。
 */
export const BAR_SETTING_Y: Record<BarSetting, number> = {
  standard: 0.17,
  block: 0.208,
  deficit: 0.132,
  small: 0.113,
}

/**
 * 切り替えの補間アニメーション（フェーズ B）のため、セッティングは
 * プリセット名だけでなく生値そのものも受け取れるようにする。
 * スクワット版の `BarSpec` / `ShoeSpec` と同じ流儀。
 */
export type BarSettingSpec = BarSetting | { readonly y: number }

function resolveBarY(spec: BarSettingSpec): number {
  return typeof spec === 'string' ? BAR_SETTING_Y[spec] : spec.y
}

export interface DlPoseInput {
  readonly body: DlBody
  readonly bar: BarSettingSpec
  /** スタンス開き角 α（度）0〜45。前額面の脚の開きを矢状面へ射影する見なしパラメータ */
  readonly stanceDeg: number
  /** 腰の高さ 0（低め）〜1（高め）。膝の閉じ方の自由度。既定 0.5 ≒ シャフトが脛に触れる位置 */
  readonly hipHeight: number
  /** 挙上進行度 0（床）〜1（ロックアウト） */
  readonly t: number
  /**
   * 身体重心 x の目標位置 0（かかと）〜1（中足部）。省略時 COM_POS_DEFAULT（Rev.3）。
   * 目標値そのものは `comT = comPos × midX`。
   */
  readonly comPos?: number

  /**
   * バー x の中足部からの前方オフセット（unit、既定 0 ＝ 中足部の真上。Rev.11）。
   *
   * エラー提示アプリ（`docs/error-app-requirements.md`）のための逸脱パラメータ。
   * 「バーが身体から遠い」を表す。**省略時は 0 で、最適フォームの挙動は一切変わらない。**
   *
   * 足（＝支持基底）と身体重心の目標 `comT` は中足部を基準にしたままにしてある。
   * バーだけが前へずれ、身体はもとの釣り合いを保とうとする、というのがこのモデルの見なし。
   * その結果、肩が前へ届くぶん股関節が後ろへ逃げて背中が寝る（実際の「バーが遠い」に一致）。
   */
  readonly barOffset?: number

  /**
   * 腰の先行度（既定 0。Rev.11）。同じくエラー提示アプリのための逸脱パラメータで、
   * 「ぶっこ抜き（ヒップシュート）」を表す。
   *
   * バー高は `t` のまま進め、**膝の前方量だけ**を脚の伸展の終端（正）／始端（負）へ
   * 内分する。正なら脚が先に伸びてバーが置き去りになり、上体だけが倒れる
   * ＝ ファーストプルをキャンセルした形。負なら逆（腰が落ちてから引く）。
   * 範囲は −1〜+1（外側はクランプ）。
   */
  readonly hipLead?: number

  /**
   * クリアランス・キャップ（Rev.6）を無効にする（既定 false。Rev.11）。
   *
   * キャップは「バーが脛に食い込まないよう膝の前方量に上限を掛ける」もので、
   * **上手い人がやっていることをモデルに埋め込んだ**制約。そのため
   * 「腰を落としすぎて膝が前に出る」エラーを入れても、キャップが全部吸収してしまい
   * 姿勢が一切変わらない（実測: hipHeight 0.5→0 で背角 +1°、腰高 変化なし）。
   *
   * エラー提示アプリはこれを外して**膝がバーの前へ出た状態そのもの**を描く。
   * そのときバーは脛に当たるが、それはエラーの帰結として指標に出す（`barToShinCm`）。
   * **省略時は false で、最適フォームの挙動は一切変わらない。**
   */
  readonly ignoreBarClearance?: boolean

  /**
   * 膝をさらに前へ出す量（unit、既定 0。Rev.11）。エラー提示アプリ用。
   *
   * 「上体の立てすぎ」を描くための逸脱。`hipHeight` 経由だと膝は 1.9cm しか動かせず、
   * 「脛が前に倒れて上体がほぼ鉛直」という実際の見た目に届かなかった。
   * ここは力学から導出した量ではなく**そう見えるように置いた値**で、
   * エラーの描写なのでそれでよい、という判断（要件 §12）。
   *
   * `ignoreBarClearance` と併用する前提。単独で使うとキャップに吸収される。
   */
  readonly kneeAheadExtra?: number

  /**
   * `hipLead` が効き切る挙上進行度（既定 `HIP_LEAD_RAMP_END`。Rev.11）。
   *
   * 0 を渡すと**構え（t=0）から効く**。ぶっこ抜きは「セットアップは悪くないのに
   * ファーストプルが飛ぶ」動作なので既定のランプが要るが、上体の立てすぎは
   * **構えの時点ですでに腰が落ちている**ので、そちらはランプ無しで使う。
   */
  readonly hipLeadRamp?: number
}

/**
 * 到達不能の警告（Rev.3）。
 * 指定した身体重心の目標位置が、その体格・その膝の閉じ方では実現できないとき、
 * 一番近い端の姿勢にクランプしたうえでこのフラグを立てる。
 */
export type DlWarn = 'none' | 'reach'

export interface DlPose {
  readonly seg: Segments
  /** 腕長 = ARM_BASE × mArm。正規化外なので Segments には入れない */
  readonly armLen: number

  // 関節（描画用）
  readonly ankle: Vec
  readonly knee: Vec
  readonly hip: Vec
  /** 肩。「|肩 − バー| = 腕長」から出力として決まる（クランプ時のみ体幹長と乖離しうる） */
  readonly shoulder: Vec
  readonly bar: Vec

  // 足部。デッドリフトでは足部は回転しないので常に床の上に並ぶ。
  readonly heel: Vec
  readonly ball: Vec
  readonly toe: Vec
  readonly mid: Vec
  /** バランス基準となる中足部の x */
  readonly midX: number

  // 角度（度）
  /**
   * 鉛直からの上体前傾。スクワット版 torsoDeg と同じ向きの規約。
   * ロックアウトでは負（＝肩が股関節より後ろ）になる（Rev.10）。
   */
  readonly torsoDeg: number
  /** 水平からの背角 = 90 − torsoDeg。表示・report 用 */
  readonly backHorizDeg: number
  /** 脛の前傾 */
  readonly shinDeg: number
  /** 腕（バー→肩）の鉛直からの傾き。肩がバーより前なら正。Rev.3 では完全に出力 */
  readonly armDeg: number
  /**
   * 達成した身体重心の x（床マーカー描画用）。warn が none で、かつロックアウトへの
   * 寄せが効いていない（t ≤ LOCK_BLEND_START）なら目標 comT と一致する。
   */
  readonly comX: number

  /** プレート円盤の半径。セッティングの生値で固定（挙上中は円盤ごと床から浮く） */
  readonly plateR: number
  readonly warn: DlWarn
}

// ---------------------------------------------------------------------------
// 補助
// ---------------------------------------------------------------------------

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** GLSL と同じ smoothstep。両端で微分が 0 になるので膝の後退が滑らかに始まり滑らかに止まる */
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

// ---------------------------------------------------------------------------
// 体格の正規化（仕様 §3-1）
// ---------------------------------------------------------------------------

/**
 * 倍率で与えられた体格を、総長 1.0 のセグメント長に正規化する。
 * 足長は正規化に含めず、総長比としてそのまま通す。
 *
 * `../geometry` の `normalize()` と計算は完全に同じだが、あちらは引数が `Body`
 * （足首の背屈可動域 `romDeg` を必須で持つ）で、DL の `DlBody` は romDeg を持たず
 * 代わりに `mArm` を持つ。ダミーの romDeg を詰めて呼ぶとモデルに嘘が入るので、
 * 基準値 `BASE_SEGMENTS` だけを共有して正規化はここに書く。
 */
export function normalizeDl(body: DlBody): Segments {
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
// 解法（仕様 §3）
// ---------------------------------------------------------------------------


/**
 * φ（大腿角）を 1 つ与えたときの姿勢。
 * 肩は「|肩 − バー| = 腕長」の円交点で消去済み。物理的にありえない枝は null で弾く。
 */
interface Branch {
  readonly phiDeg: number
  readonly hip: Vec
  readonly shoulder: Vec
  /** この姿勢での身体重心の x */
  readonly comX: number
}

/**
 * Rev.3 の解法。
 *
 * 閉じ方が Rev.1/Rev.2 と根本的に違う。バーが中足部の真上に載るのは同じだが、
 * 残りの自由度を「腕をどう見なすか」（鉛直／肩甲骨基準）で埋めるのをやめ、
 * **身体重心 x を目標位置に置く**という力学的な条件で埋める。腕の角度や肩の位置は
 * ルールではなく**結果**になる。合成重心（COP）は身体重心とバーの内分点なので、
 * バーを中足部に載せたうえで身体重心をかかと〜中足部のどこに置くかを選べば、
 * 合成重心は必ず支持基底（足）の中に落ちる。
 *
 * 未知数は大腿角 φ と体幹角の 2 つ、拘束は「|肩 − バー| = 腕長」と
 * 「身体重心 x = comT」の 2 つで自由度 0。前者で肩を消去すると残差
 * `comX(φ) − comT` の 1 変数問題になり、物理枝（円が交わり・上側交点・肩が股より上）
 * の中でこれはおおむね単調減少するので、粗い走査で根を括ってから二分法で詰める。
 */
export function solveDlPose(input: DlPoseInput): DlPose {
  const seg = normalizeDl(input.body)
  const { torso, foot } = seg
  const armLen = ARM_BASE * input.body.mArm

  // --- スタンス射影（§3-2）。体幹・腕は射影しない ---
  const alpha = clamp(input.stanceDeg, 0, 45)
  const femurEff = seg.femur * Math.cos(alpha * DEG)
  const shankEff = seg.shank * Math.cos(SHANK_PROJECTION_RATIO * alpha * DEG)

  const ankle: Vec = { x: ANKLE_X_RATIO * foot, y: ANKLE_Y_RATIO * foot }
  const midX = MID_X_RATIO * foot

  const t = clamp(input.t, 0, 1)

  /**
   * バーの水平位置（Rev.11）。既定（`barOffset` 省略）では中足部そのもの。
   * 以降「バーに対する量」はすべて `barX`、「足・支持基底に対する量」は `midX` を使う。
   */
  /**
   * 逸脱の残り具合（1=そのまま、0=最適と同じ）。フィニッシュを模範に揃えるためのもの。
   * 位置に効く逸脱（バー・膝）に掛ける。角度に効く `hipLead` は Rev.10 の寄せが吸収する。
   */
  const errorFade = 1 - smoothstep(ERROR_FADE_START, 1, clamp(input.t, 0, 1))

  const barX = midX + (input.barOffset ?? 0) * errorFade

  /**
   * 腰の先行度（Rev.11）。既定 0。
   *
   * `t` でランプさせる（`smoothstep(0, HIP_LEAD_RAMP_END, t)`）。ぶっこ抜きは
   * 「セットアップは悪くないのにファーストプルが飛ぶ」動作なので、t=0 の姿勢は
   * 最適と一致させ、**バーが床を離れた直後から崩れ始める**のが実像に合う。
   * セットアップ自体が腰高いのは別のエラー（`hipHeight`）として分けてある。
   */
  const hipLeadRaw = clamp(input.hipLead ?? 0, -1, 1)
  const hipLeadRamp = input.hipLeadRamp ?? HIP_LEAD_RAMP_END
  const hipLead =
    hipLeadRaw *
    (hipLeadRamp > 0 ? smoothstep(0, hipLeadRamp, clamp(input.t, 0, 1)) : 1) *
    errorFade

  /**
   * 身体重心 x の目標（Rev.3 / Rev.5-2）。
   * 開始時は comPos（0=かかと、1=中足部）で選び、ロックアウトへ向けて COM_TOP へ
   * 線形に動かす。挙上とともに重心が前へ移るのが hips through の駆動力になる。
   */
  const comT = lerp(clamp(input.comPos ?? COM_POS_DEFAULT, 0, 1) * midX, COM_TOP, t)

  // --- ロックアウトの規定姿勢（Rev.10）---
  // トップの姿勢だけは重心拘束で解かず、角度で直接規定する。理由は Rev.10 に書いたとおり、
  // ロックアウト近傍では「股 →(体幹)→ 肩 →(腕)→ バー」がほぼ折り畳まれた特異配置になり、
  // 重心残差が φ に対して平坦かつ二重根になって、根から姿勢が決まらないため。
  // ここで組んだ姿勢が満たすバー高をロックアウト高として採り、t→1 でここへ寄せる。
  const kneeAheadTop = Math.min(KNEE_AHEAD_TOP, barX - BAR_CLEARANCE - ankle.x, shankEff)
  const kneeTopY = ankle.y + Math.sqrt(Math.max(0, shankEff ** 2 - kneeAheadTop ** 2))
  const hipTop: Vec = {
    x: ankle.x + kneeAheadTop - femurEff * Math.sin(PHI_TOP_DEG * DEG),
    y: kneeTopY + femurEff * Math.cos(PHI_TOP_DEG * DEG),
  }
  const shoulderTop: Vec = {
    x: hipTop.x + torso * Math.sin(TORSO_TOP_DEG * DEG),
    y: hipTop.y + torso * Math.cos(TORSO_TOP_DEG * DEG),
  }

  // --- バー（§3-3 / Rev.3 / Rev.10）---
  // ロックアウト高は「規定姿勢の肩から腕長だけ下、ただしバー x は中足部」で決まる。
  // Rev.6 まではここが直立チェーン − 腕長（＝理論上の最大高）だったが、それだと
  // 肩・股・バーが厳密に一直線になり、上体を傾ける余地がゼロになっていた。
  const barY0 = resolveBarY(input.bar)
  const armSpanTop = armLen ** 2 - (shoulderTop.x - barX) ** 2
  const barYLock =
    armSpanTop > 0
      ? shoulderTop.y - Math.sqrt(armSpanTop)
      : ankle.y + shankEff + femurEff + torso - armLen
  const barY = lerp(barY0, barYLock, t)
  // バー x は常に中足部（このアプリの拘束その1）。
  // これは重心解を組み立てる間のバー位置。ロックアウトへの寄せ（Rev.10）が入ると
  // バー高は肩から導出し直すので、最終的な出力は下の `bar` になる。
  /**
   * 重心解を組むときのバー位置（Rev.11）。**中足部に固定**する。
   *
   * `barOffset` を入れたときここを実際のバー位置にすると、腕の重心が前へ出たぶんを
   * 打ち消すように体幹が後ろへ回り、**バーを前に置くほど上体が立つ**という逆の絵が出た
   * （実測 t=0.35 で背角 36°→45°、肩はむしろ 3cm 後退）。
   *
   * 実際の人は「バーが遠いぶん自分の釣り合いを取り直す」のではなく、
   * **いつもどおり構えて、遠いバーへ手を伸ばす**。だから釣り合い（＝ φ の決定）は
   * 意図した位置＝中足部で解き、肩だけを実際のバーから取り直す（下の「バーの位置ずれ」）。
   * 身体重心はその結果として前へ動く ＝ それがこのエラーの帰結。
   */
  const barSolve: Vec = { x: midX, y: barY }

  // --- 膝（§3-5）。腰の高さの自由度はここで閉じる（Rev.1 から変更なし） ---
  const hipHeight = clamp(input.hipHeight, 0, 1)
  const kneeFwd = lerp(KNEE_FWD_LOW, KNEE_FWD_HIGH, hipHeight)
  const kneeAhead0 = midX - ankle.x + kneeFwd
  // 終端は 0（脛鉛直）ではなく KNEE_AHEAD_TOP（脚全体がわずかに前傾した位置、Rev.5-2）。
  const kneeAheadBase =
    kneeAhead0 + (KNEE_AHEAD_TOP - kneeAhead0) * smoothstep(KNEE_RETREAT_START, KNEE_RETREAT_END, t)

  // --- クリアランス・キャップ（Rev.6）---
  // 膝の後退を t だけで決めると、バーが脛上部〜膝を通過する時間帯（t≈0.3〜0.6）に
  // 膝が前に残ってバーが脚に食い込む。バー高における脛の中心線 x が
  // 「midX − BAR_CLEARANCE」を超えないように、膝の前方量そのものに上限を掛ける。
  //
  // 脛の高さ比 ratio は開始閉じでの膝高 kneeY0 で近似する（現在の膝高は kneeAhead に
  // 依存するので、そのまま使うと循環する）。ratio=0（バーが足首より下）では
  // 脛は制約に掛からないので上限なし。
  const kneeY0 =
    ankle.y + Math.sqrt(Math.max(0, shankEff ** 2 - Math.min(kneeAhead0, 0.99 * shankEff) ** 2))
  const ratio = clamp((barY - ankle.y) / (kneeY0 - ankle.y), 0, 1)
  const cap = ratio > 0 ? (barX - BAR_CLEARANCE - ankle.x) / ratio : Infinity

  // 足が極端に大きいと kneeAhead が脛より長くなりうる。sqrt を守るだけだと
  // 脛の長さが保存されなくなるので、前方量そのものを脛長でも頭打ちにする。
  const kneeOpt = input.ignoreBarClearance
    ? Math.min(kneeAheadBase, shankEff)
    : Math.min(kneeAheadBase, cap, shankEff)

  // --- 腰の先行（Rev.11）---
  // 最適の膝位置を、脚の伸展の**終端／始端へ向けて内分**する。hipLead=0 で kneeOpt そのもの。
  //
  // 当初は「脚の伸展スケジュールだけ時間を早送りする」形で書いたが、実測したところ
  // 挙上の中盤（t≈0.3〜0.6）は Rev.6 のクリアランス・キャップが膝位置を完全に支配していて、
  // スケジュールを早送りしても min() がキャップを拾うので**何も変わらなかった**。
  // キャップは「バーが脛に当たらない」という物理そのものなので外せない。そこで
  // 時間ではなくキャップ後の値を直接内分する形にした（要件 §3.3 を更新済み）。
  //
  // 負側（腰が落ちてから引く）はキャップを超えうる。それはまさに「バーが脛に擦る」
  // 状態なので、エラーの描写としては正しい。最適側（hipLead=0）は従来どおり超えない。
  const kneeLead =
    hipLead >= 0
      ? kneeOpt + hipLead * (kneeAheadTop - kneeOpt)
      : kneeOpt - hipLead * (Math.min(kneeAhead0, shankEff) - kneeOpt)
  // 膝をさらに前へ（上体の立てすぎ用）。脛より長くはできない
  const kneeAhead = Math.min(kneeLead + (input.kneeAheadExtra ?? 0) * errorFade, 0.99 * shankEff)
  const knee: Vec = {
    x: ankle.x + kneeAhead,
    y: ankle.y + Math.sqrt(Math.max(0, shankEff ** 2 - kneeAhead ** 2)),
  }

  // 足部の重心は床の上、足長の中央。φ に依らないのでループの外で 1 回だけ求める。
  const footComX = 0.5 * foot

  /** 股関節と肩が決まったときの身体重心 x（Winter の質量比） */
  const comXOf = (hip: Vec, shoulder: Vec, handX: number): number =>
    SEGMENT_MASS.foot * footComX +
    SEGMENT_MASS.shank * (knee.x + COM_RATIO.shank * (ankle.x - knee.x)) +
    SEGMENT_MASS.femur * (hip.x + COM_RATIO.femur * (knee.x - hip.x)) +
    SEGMENT_MASS.torso * (hip.x + COM_RATIO.torso * (shoulder.x - hip.x)) +
    SEGMENT_MASS.arm * (shoulder.x + COM_RATIO.arm * (handX - shoulder.x))

  /**
   * φ から姿勢を組む。クロージャは φ ループの外で 1 回だけ作る（毎フレーム 2 体分
   * 呼ばれるので、走査 70 点 + 二分 50 回のたびに関数を作り直さない）。
   * 股関節は膝の後上方 `K + femurEff·(−sinφ, cosφ)`、肩は円 (hip, torso) ∩ (bar, armLen)。
   */
  const poseAt = (phiDeg: number, bar: Vec): Branch | null => {
    const r = phiDeg * DEG
    const hip: Vec = {
      x: knee.x - femurEff * Math.sin(r),
      y: knee.y + femurEff * Math.cos(r),
    }
    const dx = bar.x - hip.x
    const dy = bar.y - hip.y
    const d = Math.hypot(dx, dy)
    // 股からバーまでが体幹＋腕で届かない／近すぎて交わらないときは物理枝でない。
    if (d <= 0 || d > torso + armLen || d < Math.abs(torso - armLen)) return null
    const a = (d * d + torso ** 2 - armLen ** 2) / (2 * d)
    const h2 = torso ** 2 - a * a
    if (h2 < 0) return null
    const h = Math.sqrt(h2)
    const ux = dx / d
    const uy = dy / d
    const px = hip.x + a * ux
    const py = hip.y + a * uy
    const c1: Vec = { x: px - h * uy, y: py + h * ux }
    const c2: Vec = { x: px + h * uy, y: py - h * ux }
    // 上側交点（肩が背中側に回り込んだ解を捨てる）。さらに肩が股より上にあることを要求する。
    const shoulder = c1.y >= c2.y ? c1 : c2
    if (!(shoulder.y > hip.y)) return null
    // 上体が後方へ倒れ込んだ非物理枝を外す（Rev.5-3）。負の φ まで走査する副作用で、
    // 中間の t にこの枝の交差が現れることがある。
    const torsoDeg = Math.atan2(shoulder.x - hip.x, shoulder.y - hip.y) / DEG
    if (90 - torsoDeg > BACK_HORIZ_MAX_DEG) return null
    return { phiDeg, hip, shoulder, comX: comXOf(hip, shoulder, bar.x) }
  }

  // --- φ の走査（Rev.3）---
  // 残差 comX(φ) − comT の「正 → 負」の最初の符号変化を、隣り合う走査点で括る。
  // 無効な φ を挟んだ区間で括らないよう、無効に当たったら直前の点を捨てる
  // （区間の両端が有効でないと二分法が意味を持たないため）。
  let bracketLo: Branch | null = null
  let bracketHi: Branch | null = null
  let firstValid: Branch | null = null
  let lastValid: Branch | null = null
  let prev: Branch | null = null
  for (let phiDeg = PHI_MIN_DEG; phiDeg <= PHI_MAX_DEG + 1e-9; phiDeg += PHI_STEP_DEG) {
    const b = poseAt(phiDeg, barSolve)
    if (b === null) {
      prev = null
      continue
    }
    if (firstValid === null) firstValid = b
    lastValid = b
    if (prev !== null && prev.comX > comT && b.comX <= comT) {
      bracketLo = prev
      bracketHi = b
      break
    }
    prev = b
  }

  let solution: Branch
  let warn: DlWarn = 'none'
  if (bracketLo !== null && bracketHi !== null) {
    // --- 二分法（区間幅 2° を 50 回半分にするので倍精度の下限まで詰まる）---
    let lo = bracketLo.phiDeg
    let hi = bracketHi.phiDeg
    let best: Branch = bracketHi
    for (let i = 0; i < BISECT_ITER; i++) {
      const mid = (lo + hi) / 2
      const b = poseAt(mid, barSolve)
      if (b === null) {
        // 両端が有効な 2° 幅の中で無効点が出るのは実測では起きないが、
        // 出たときに区間が壊れないよう正側（重心が前）に寄せて潰す。
        lo = mid
        continue
      }
      best = b
      if (b.comX > comT) lo = mid
      else hi = mid
    }
    solution = poseAt((lo + hi) / 2, barSolve) ?? best
  } else if (lastValid !== null && firstValid !== null) {
    // --- クランプ（Rev.3）---
    // 符号変化が無い＝目標の重心位置がこの体格・この膝の閉じ方では実現できない。
    // 残差が全区間で正（重心が目標より前にしか置けない）なら一番後ろに引ける端＝
    // 最後の有効 φ、全区間で負なら一番前に出せる端＝最初の有効 φ を採る。
    // 残差は物理枝で単調減少なので、どちらも「残差が最小の端」になる。
    warn = 'reach'
    solution = lastValid.comX > comT ? lastValid : firstValid
  } else {
    // --- 最後の手段（Rev.3）---
    // 物理枝が 1 つも無い極端な体格。描画が破綻しないよう、Rev.1 と同じ
    // 「腕は鉛直・股関節は膝から肩へ向けてクランプ」で有限な座標を作る。
    warn = 'reach'
    const shoulder: Vec = { x: barX, y: barY + armLen }
    const dx = shoulder.x - knee.x
    const dy = shoulder.y - knee.y
    const d = Math.hypot(dx, dy)
    const ux = d > 0 ? dx / d : 0
    const uy = d > 0 ? dy / d : -1
    const hip: Vec = { x: knee.x + femurEff * ux, y: knee.y + femurEff * uy }
    solution = { phiDeg: 0, hip, shoulder, comX: comXOf(hip, shoulder, barSolve.x) }
  }

  // --- 腰の先行：股関節の高さ（Rev.11）---
  // 膝の内分（上）だけでは背角が数度しか動かない。実測すると、腰の高さと背角を
  // 決めているのは膝ではなく**大腿角 φ** で、そこは重心拘束が握っているため。
  // ぶっこ抜きは「釣り合いを保ったまま腰が上がる」のではなく、**腰を上げた結果として
  // 重心が動く**動作なので、ここでは φ を規定し、重心 comX のほうを出力に落とす。
  // これで順問題（姿勢を与えて帰結を計算する）になる ＝ 要件 §3.1 の狙いどおり。
  if (hipLead !== 0) {
    // 到達可能な φ の端まで走査し、hipLead=±1 をその端に対応させる。
    // 「腰を N cm 上げる」と決め打つより頑健で、hipLead に対して単調になる
    // （決め打つと、上げられる余地がない t で破綻枝を拾って逆戻りした）。
    const dir = hipLead > 0 ? -1 : 1 // 腰を上げる ＝ 大腿を立てる ＝ φ を減らす
    let limit = solution.phiDeg
    for (let k = 1; k <= HIP_LEAD_SCAN_STEPS; k++) {
      const phi = solution.phiDeg + dir * k * HIP_LEAD_SCAN_DEG
      const probe = poseAt(phi, barSolve)
      if (probe === null) break
      const armDeg =
        Math.atan2(probe.shoulder.x - barSolve.x, probe.shoulder.y - barSolve.y) / DEG
      if (armDeg > ARM_AHEAD_MAX_DEG) break
      limit = phi
    }
    const b = poseAt(lerp(solution.phiDeg, limit, Math.abs(hipLead)), barSolve)
    if (b !== null) solution = b
    // 姿勢を重心目標に合わせていないので「目標に届かなかった」の警告は成り立たない
    warn = 'none'
  }

  // --- バーの位置ずれ（Rev.11）---
  // φ（＝下半身の構え）は意図どおりのまま、実際のバーへ手を伸ばした肩に取り直す。
  // 体幹が前へ倒れ、身体重心は comT から前へずれる。そのずれがこのエラーの帰結。
  if (barX !== midX) {
    const reached = poseAt(solution.phiDeg, { x: barX, y: barY })
    if (reached !== null) solution = reached
  }

  // --- ロックアウトへの寄せ（Rev.10）---
  // 重心解の (φ, 体幹角) を規定値へ smoothstep で寄せる。角度で混ぜるので体節長は常に厳密。
  const w = smoothstep(LOCK_BLEND_START, 1, t)
  let { hip, shoulder } = solution
  let bar: Vec = { x: barX, y: barY }
  if (w > 0) {
    const phi = lerp(solution.phiDeg, PHI_TOP_DEG, w)
    const th = lerp(Math.atan2(shoulder.x - hip.x, shoulder.y - hip.y) / DEG, TORSO_TOP_DEG, w)
    hip = {
      x: knee.x - femurEff * Math.sin(phi * DEG),
      y: knee.y + femurEff * Math.cos(phi * DEG),
    }
    shoulder = {
      x: hip.x + torso * Math.sin(th * DEG),
      y: hip.y + torso * Math.cos(th * DEG),
    }
    // 角度を混ぜると肩は腕の円から外れるので、バー高のほうを肩に合わせ直す
    // （バーは手にぶら下がっている＝バー高は肩から腕長ぶん下、が本来の因果）。
    // w=0 では解が既に円上にあるので導出値はスケジュール値と一致し、接続は連続。
    const span = armLen ** 2 - (shoulder.x - barX) ** 2
    if (span > 0) bar = { x: barX, y: shoulder.y - Math.sqrt(span) }
    // 寄せが効いている間は姿勢を重心目標に合わせていないので、「目標に届かなかった」
    // という意味の reach 表示は成り立たない。実測では reach が立つのは t<0.2 だけなので、
    // ここで落としても表示が途中で消えるようなことは起きない。
    warn = 'none'
  }
  const comX = w > 0 ? comXOf(hip, shoulder, bar.x) : solution.comX

  // --- 角度（§3-7 / Rev.3）---
  const torsoDeg = Math.atan2(shoulder.x - hip.x, shoulder.y - hip.y) / DEG
  const shinDeg = Math.atan2(knee.x - ankle.x, knee.y - ankle.y) / DEG
  // 腕はバー→肩。肩がバーより前なら正。Rev.3 では入力ではなく結果。
  const armDeg = Math.atan2(shoulder.x - bar.x, shoulder.y - bar.y) / DEG

  return {
    seg,
    armLen,
    ankle,
    knee,
    hip,
    shoulder,
    bar,
    heel: { x: 0, y: 0 },
    ball: { x: K_PIVOT * foot, y: 0 },
    toe: { x: foot, y: 0 },
    mid: { x: midX, y: 0 },
    midX,
    torsoDeg,
    backHorizDeg: 90 - torsoDeg,
    shinDeg,
    armDeg,
    comX,
    plateR: barY0,
    warn,
  }
}
