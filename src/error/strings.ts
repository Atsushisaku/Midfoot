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
  sharedRow: '両者共通',
  errorRow: 'エラー',
  detailRow: '詳細',
  buildLabel: '体型',
  armLabel: '腕',
  romLabel: '股関節の屈曲',
  stanceLabel: 'スタンス',
  levelLabel: '程度',
  time: '時間',
  play: '▶ 再生',
  stop: '■ 停止',
  none: 'なし',
  noneComment: [
    '左右とも模範フォーム',
    '上のボタンでエラーを選ぶと、右側だけがその動きになる',
    '程度（軽度／中等度／重度）も切り替えられる',
  ],
  levels: ['軽度', '中等度', '重度'],
  presets: { standard: '標準', 'long-femur': '大腿が長い', 'long-torso': '体幹が長い' },
  armLevels: { 0.9: '短い', 1: '標準', 1.1: '長い' },
  stances: { 0: 'ナロー', 12: 'ミドル', 35: 'スモウ' },
  romLevels: { 110: '硬め', 120: '標準', 130: '柔らかめ' },
  errors: {
    hipShoot: {
      label: 'ぶっこ抜き',
      what: [
        '腰だけが先に上がり、上体が寝る',
        '序盤で脚を使い切るため、バーが膝を越えたあたりで詰まりやすい',
        '肩が前に出るため、バーが体から離れやすい',
      ],
    },
    upright: {
      label: '上体の立てすぎ',
      what: [
        '上体を立てようとして尻が落ちる',
        '脚が伸びないまま引くため、ファーストプルが重い',
        '膝が前に出やすいため、バー軌道が鉛直になりにくい',
      ],
    },
    barFar: {
      label: 'バーが遠い',
      what: [
        'バーが中足部より前にある',
        '姿勢そのものは崩れていない',
        '離れただけ、腰と股関節の負担が増える',
      ],
    },
    // 名称は解剖学的に正確な「腰椎の屈曲」を採用（常時描画の胸椎の丸み＝正常と
    // 混同させないため、下背部に限定した名前にする）。詳細は現象だけを書く規約
    // （要件 §7.3）のまま、3 点目で描画の時間変化まで言う（2026-08-07 確定）
    roundBack: {
      label: '腰椎の屈曲',
      what: [
        'バーの通り道も腰の高さも模範と同じで、腰の丸まりだけが違う',
        '骨盤が起きた（後傾した）まま前屈するので、丸まりは腰に集中する',
        '構えでは軽く、バーが膝を過ぎるあたりで最も丸まり、立ち切るとまっすぐに戻る',
      ],
    },
  },
  legLead: (barPct) => `バーが ${barPct} 上がった時点で、脚は`,
  legTail: '伸びている',
  legEarly: '伸びている（脚を使うのが早すぎる）',
  legLate: '伸びている（脚が使えていない）',
  aria: {
    lang: 'Language',
    bodyPreset: '体型プリセット',
    armLevel: '腕の長さ',
    stance: 'スタンス',
    rom: '股関節の屈曲',
    error: 'エラー',
    level: 'エラーの程度',
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
