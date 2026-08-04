/**
 * エラーのカタログ。
 * 要件: docs/error-app-requirements.md §5 / §11
 *
 * **1 項目 = 1 つの症候群**。インストラクターが見るのは「現象の名前」だけで、
 * 内部の逸脱パラメータ（バー位置・腰の先行・腰の高さ）は見せない。
 * これが要件 §7.3 の「原因と現象を混ぜない」の実装で、スライダーを撤去した理由でもある。
 *
 * 束ね方は §11 の検証にもとづく:
 * - ぶっこ抜きと「腰が高いセッティング」は中盤で同じ姿勢に収束するので**同一項目**にする。
 *   分けると、腰高セッティング側が t≥0.2 でモデルの都合（キャップ）により最適へ戻ってしまう
 * - ぶっこ抜きは腰が上がると肩が前へ滑り、バーは手にぶら下がっているので前へ引かれる。
 *   「バーが遠くなりがち」は偶然の併発ではなく幾何的に強制されるので、束に含める
 * - 上体の立てすぎは「上体を立てようとする → 尻が落ちる」。脛はむしろ**前傾が強くなる**。
 *   腰の落ち（`hipLead` 負）を**構えから**効かせ、膝を前へ出して脛を倒す。
 *   膝を前へ出すと背中も起きるので、この 2 つは同じ向きに効く
 *
 * **フィニッシュは 3 項目とも模範と一致する**。エラーは「立ち切った形が違う」のではなく
 * 「そこへ至る道のりに無駄が多い」もの、という観察に合わせて、幾何側が t→1 で逸脱を消す
 * （`ERROR_FADE_START`）。
 */

/** 内部の逸脱パラメータ。UI には出さない */
export interface Deviation {
  /** バー x の中足部からの前方オフセット（cm）。正＝前 */
  readonly barOffsetCm: number
  /** 腰の先行度 −1〜+1。正＝ヒップシュート */
  readonly hipLead: number
  /** hipHeight の基準 0.5 からの差分。正＝腰が高い */
  readonly hipDelta: number
  /**
   * 膝をさらに前へ出す量（cm）。「上体の立てすぎ」で脛を前に倒すために使う。
   * 力学から出した量ではなく**そう見えるように置いた値**（要件 §12）。
   */
  readonly kneeAheadExtraCm: number
  /** `hipLead` が効き切る t。0 なら構えから効く（省略時は既定のランプ） */
  readonly hipLeadRamp?: number
}

export const NO_DEVIATION: Deviation = {
  barOffsetCm: 0,
  hipLead: 0,
  hipDelta: 0,
  kneeAheadExtraCm: 0,
}

export type Level = 0 | 1 | 2
export const LEVEL_LABELS = ['軽度', '中等度', '重度'] as const

export interface ErrorEntry {
  readonly id: string
  readonly label: string
  /**
   * 「コメント」欄の箇条書き。指導でそのまま読み上げられる文にする。
   * **何が起きているか（現象）だけ**を書き、原因や修正キューは書かない（要件 §7.3）。
   *
   * 専門用語と翻訳調を避ける。「脚の伸展」→「脚が伸びる」、「梃子」→「負担」、
   * 「肩が前へ滑る」→「肩が前に出る」。
   *
   * **必ず 3 点。1 点は 1400px 幅で 1 行に収める**（要件 §13）。
   * 数が揃っていないと、項目を切り替えたときに欄の高さが変わって図まで動く。
   */
  readonly what: readonly [string, string, string]
  /** 軽度／中等度／重度 */
  readonly levels: readonly [Deviation, Deviation, Deviation]
}

export const CATALOG: readonly ErrorEntry[] = [
  {
    id: 'hipShoot',
    label: 'ぶっこ抜き',
    what: [
      '腰だけが先に上がり、上体が寝る',
      '序盤で脚を使い切るため、バーが膝を越えたあたりで詰まりやすい',
      '肩が前に出るため、バーが体から離れやすい',
    ],
    levels: [
      { barOffsetCm: 1.5, hipLead: 0.35, hipDelta: 0.15, kneeAheadExtraCm: 0 },
      { barOffsetCm: 3, hipLead: 0.6, hipDelta: 0.3, kneeAheadExtraCm: 0 },
      { barOffsetCm: 5, hipLead: 0.9, hipDelta: 0.5, kneeAheadExtraCm: 0 },
    ],
  },
  {
    id: 'upright',
    label: '上体の立てすぎ',
    what: [
      '上体を立てようとして尻が落ちる',
      '脚が伸びないまま引くため、ファーストプルが重い',
      '膝が前に出やすいため、バー軌道が鉛直になりにくい',
    ],
    // ぶっこ抜きと対称に「構え（hipDelta）＋動作中（hipLead）」の 2 成分で持つ。
    // hipDelta だけだと膝の前後は 1.9cm しか動かず、程度の差がほとんど出なかった。
    levels: [
      { barOffsetCm: -0.5, hipLead: -0.15, hipDelta: 0, kneeAheadExtraCm: 1.5, hipLeadRamp: 0 },
      { barOffsetCm: -1, hipLead: -0.3, hipDelta: 0, kneeAheadExtraCm: 3, hipLeadRamp: 0 },
      { barOffsetCm: -1.5, hipLead: -0.45, hipDelta: 0, kneeAheadExtraCm: 4.5, hipLeadRamp: 0 },
    ],
  },
  {
    id: 'barFar',
    label: 'バーが遠い',
    what: [
      'バーが中足部より前にある',
      '姿勢そのものは崩れていない',
      '離れただけ、腰と股関節の負担が増える',
    ],
    levels: [
      { barOffsetCm: 2, hipLead: 0, hipDelta: 0, kneeAheadExtraCm: 0 },
      { barOffsetCm: 5, hipLead: 0, hipDelta: 0, kneeAheadExtraCm: 0 },
      { barOffsetCm: 8, hipLead: 0, hipDelta: 0, kneeAheadExtraCm: 0 },
    ],
  },
]
