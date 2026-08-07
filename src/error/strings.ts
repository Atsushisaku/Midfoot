/**
 * エラー例ページの文言（日英）。
 *
 * API と構造は `../deadlift/strings` に合わせてある（`Lang` / `setLang` / `getLang` /
 * `t` / `asLang`）。デッドリフト版からの行き来で `?lang=` を受け渡すので、
 * 3 ページで同じ規約に揃えておく。
 *
 * カタログの文言（エラー名と「詳細」の 3 点）もここに持つ。`./catalog` は
 * 逸脱パラメータだけを持ち、表示テキストは id で引く（スクワット版のプリセットと同じ流儀）。
 */

export type Lang = 'ja' | 'en'

/** 「詳細」の箇条書き。**必ず 3 点**（欄の高さが変わると図が動く。要件 §13） */
export type Comment = readonly [string, string, string]

export interface ErrStrings {
  readonly title: string
  /** 種目ナビの文言。エラー例はデッドリフトの下位なので crumb を足す */
  readonly navSquat: string
  readonly navDeadlift: string
  readonly crumb: string
  /** 行見出し */
  readonly bodyRow: string
  /**
   * 体格の行の見出し（2026-08-07 以降はこちらを使う）。
   * 「体格」だと 4 つ目の「股関節の屈曲」まで含めた総称にならないので、
   * **両者に共通の条件**であることだけを言う見出しにした。`bodyRow` は未使用だが残す。
   */
  readonly sharedRow: string
  readonly errorRow: string
  readonly detailRow: string
  /** 体格の行の小見出し（体型／腕／股関節の屈曲／スタンス） */
  readonly buildLabel: string
  readonly armLabel: string
  readonly romLabel: string
  readonly stanceLabel: string
  readonly levelLabel: string
  /** 共有の操作 */
  readonly time: string
  readonly play: string
  readonly stop: string
  /** エラーなし */
  readonly none: string
  readonly noneComment: Comment
  /** 程度 */
  readonly levels: readonly [string, string, string]
  /** 体格プリセット・腕・スタンス */
  readonly presets: Record<string, string>
  readonly armLevels: Record<string, string>
  readonly stances: Record<string, string>
  /** 股関節屈曲の可動域 3 択（`../deadlift/spine` の ROM_LEVELS をキーに引く） */
  readonly romLevels: Record<string, string>
  /** カタログ（id をキーに引く） */
  readonly errors: Record<string, { readonly label: string; readonly what: Comment }>
  /**
   * 主指標の文言。`バーが {0} 上がった時点で、脚は {opt} / {err} 伸びている（{note}）`
   * を組み立てるための断片。言語で語順が変わるので、文そのものを分けて持つ。
   */
  readonly legLead: (barPct: string) => string
  readonly legTail: string
  readonly legEarly: string
  readonly legLate: string
  readonly aria: {
    readonly lang: string
    readonly bodyPreset: string
    readonly armLevel: string
    readonly stance: string
    readonly rom: string
    readonly error: string
    readonly level: string
  }
}

const ja: ErrStrings = {
  title: 'Midfoot デッドリフトのエラー例',
  navSquat: 'スクワット',
  navDeadlift: 'デッドリフト',
  crumb: 'エラー例',
  bodyRow: '体格（両者共通）',
  // 2026-08-07 の文言見直し（想定読者を**指導者**に定め、解剖・運動学の用語をそのまま使う）。
  // 「両者共通」→「共通条件」: 左右の図に共通して掛かる条件であることを明示する
  sharedRow: '共通条件',
  errorRow: 'エラー',
  // 「詳細」→「所見」: 中立な語のままで、観察して述べたものだと分かる
  detailRow: '所見',
  // 「体型」→「体節比」: 実際に変えているのは大腿・体幹・下腿の長さの比
  buildLabel: '体節比',
  armLabel: '腕',
  romLabel: '股関節屈曲',
  stanceLabel: 'スタンス',
  levelLabel: '程度',
  // 「時間」→「挙上進行度」: バー高の進行を 0〜100% で表す量
  time: '挙上進行度',
  play: '▶ 再生',
  stop: '■ 停止',
  none: 'なし',
  noneComment: [
    '左右とも模範フォーム',
    'エラーを選択すると、右側のみ該当フォームに切り替わる',
    '程度（軽度／中等度／重度）も選択できる',
  ],
  levels: ['軽度', '中等度', '重度'],
  // 体型の分類名として名詞化する
  presets: { standard: '標準', 'long-femur': '大腿長型', 'long-torso': '体幹長型' },
  armLevels: { 0.9: '短い', 1: '標準', 1.1: '長い' },
  stances: { 0: 'ナロー', 12: 'ミドル', 35: 'スモウ' },
  // 角度の併記は見送った。ボタンが太って共通条件の行が 2 段に折り返し、図が縮むため（§13）
  romLevels: { 110: '硬め', 120: '標準', 130: '柔らかめ' },
  errors: {
    // 「ぶっこ抜き」→「股関節の先行伸展」: 俗称ではなく、何が先行しているかを述べる
    hipShoot: {
      label: '股関節の先行伸展',
      what: [
        '膝の伸展が股関節の伸展に先行し、体幹が水平化する',
        'ファーストプルで膝伸展を使い切るため、バーの膝関節通過後に停滞しやすい',
        '肩峰が前方へ移動し、バーと身体重心の水平距離が増える',
      ],
    },
    upright: {
      label: '体幹の過度な起立',
      what: [
        '体幹を起こそうとして股関節が下がり、膝屈曲が深くなる',
        '膝の伸展余力が乏しく、ファーストプルで床反力を得にくい',
        '膝が前方へ出るため、バー軌道が鉛直から逸れる',
      ],
    },
    barFar: {
      label: 'バー軌道の前方偏位',
      what: [
        'バーが中足部より前方に位置する',
        '関節角度そのものは模範から大きく外れない',
        '股関節・腰椎のモーメントアームが偏位量だけ増える',
      ],
    },
    // 名称は解剖学的に正確な「腰椎の屈曲」を採用（常時描画の胸椎の丸み＝正常と
    // 混同させないため、下背部に限定した名前にする）。詳細は現象だけを書く規約
    // （要件 §7.3）のまま、3 点目で描画の時間変化まで言う（2026-08-07 確定）
    roundBack: {
      label: '腰椎の屈曲',
      what: [
        'バー軌道・股関節高は模範と一致し、腰椎の屈曲のみが異なる',
        '骨盤が後傾位のまま股関節が屈曲するため、屈曲が腰椎に集中する',
        'セットアップでは軽度、バーの膝関節通過付近で最大、ロックアウトで中間位へ戻る',
      ],
    },
  },
  legLead: (barPct) => `バーが ${barPct} 上がった時点で、脚は`,
  legTail: '伸びている',
  legEarly: '伸びている（脚を使うのが早すぎる）',
  legLate: '伸びている（脚が使えていない）',
  aria: {
    lang: 'Language',
    bodyPreset: '体節比プリセット',
    armLevel: '腕の長さ',
    stance: 'スタンス',
    rom: '股関節屈曲',
    error: 'エラー',
    level: '程度',
  },
}

const en: ErrStrings = {
  title: 'Midfoot — Deadlift error examples',
  navSquat: 'Squat',
  navDeadlift: 'Deadlift',
  crumb: 'Error examples',
  bodyRow: 'Proportions (shared)',
  sharedRow: 'Shared',
  errorRow: 'Error',
  detailRow: 'Detail',
  buildLabel: 'Build',
  armLabel: 'Arms',
  romLabel: 'Hip flexion',
  stanceLabel: 'Stance',
  levelLabel: 'Severity',
  time: 'Time',
  play: '▶ Play',
  stop: '■ Stop',
  none: 'None',
  noneComment: [
    'Both sides show the reference form',
    'Pick an error above and only the right figure changes',
    'Severity (mild / moderate / severe) can be switched too',
  ],
  levels: ['Mild', 'Moderate', 'Severe'],
  presets: { standard: 'Standard', 'long-femur': 'Long femur', 'long-torso': 'Long torso' },
  armLevels: { 0.9: 'Short', 1: 'Standard', 1.1: 'Long' },
  stances: { 0: 'Narrow', 12: 'Middle', 35: 'Sumo' },
  romLevels: { 110: 'Stiff', 120: 'Average', 130: 'Flexible' },
  errors: {
    hipShoot: {
      label: 'Hips shoot up',
      what: [
        'The hips rise first and the torso flattens',
        'The legs are spent early, so the bar tends to stall around the knee',
        'The shoulders drift forward, so the bar drifts away from the body',
      ],
    },
    upright: {
      label: 'Torso too upright',
      what: [
        'Trying to stay upright drops the hips',
        'The legs barely extend, so the first pull feels heavy',
        'The knees tend to travel forward, so the bar path is not vertical',
      ],
    },
    barFar: {
      label: 'Bar too far away',
      what: [
        'The bar sits ahead of the midfoot',
        'The posture itself is not broken',
        'The load on the lower back and hips grows by exactly that distance',
      ],
    },
    roundBack: {
      label: 'Lumbar flexion',
      what: [
        'The bar path and the hip height match the reference; only the rounding of the lower back differs',
        'The pelvis stays tucked under (posteriorly tilted) through the hinge, so the rounding is concentrated in the lower back',
        'It is slight at the setup, peaks as the bar passes the knees, and straightens out at lockout',
      ],
    },
  },
  legLead: (barPct) => `With the bar ${barPct} of the way up, the legs are`,
  legTail: 'extended',
  legEarly: 'extended (the legs are used too early)',
  legLate: 'extended (the legs are barely used)',
  aria: {
    lang: 'Language',
    bodyPreset: 'Body type preset',
    armLevel: 'Arm length',
    stance: 'Stance',
    rom: 'Hip flexion',
    error: 'Error',
    level: 'Severity',
  },
}

const TABLE: Record<Lang, ErrStrings> = { ja, en }

let current: Lang = 'ja'

export const setLang = (lang: Lang): void => {
  current = lang
}

export const getLang = (): Lang => current

/** 現在の言語の文言一式 */
export const t = (): ErrStrings => TABLE[current]

export const asLang = (v: string | null): Lang | null => (v === 'ja' || v === 'en' ? v : null)
