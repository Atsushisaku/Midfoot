/**
 * 日英の文言（仕様 §10.1）。
 *
 * 画面に出る文字列はすべてここに集約する。DOM に依存しないので
 * テスト（report スクリプト）からもそのまま読める。
 */

export type Lang = 'ja' | 'en'

export interface Strings {
  readonly title: string
  /** 図の隅のボタン */
  readonly compare: string
  readonly notes: string
  readonly close: string
  /** 設定ペイン */
  readonly bodySection: string
  readonly simple: string
  readonly detail: string
  readonly ankle: string
  readonly depth: string
  readonly play: string
  readonly stop: string
  /** 担ぎ位置・シューズ */
  readonly highBar: string
  readonly lowBar: string
  readonly flat: string
  readonly sneaker: string
  readonly lifting: string
  /** 詳細スライダー */
  readonly femur: string
  readonly torso: string
  readonly shank: string
  readonly rom: string
  /** 図の中の文字 */
  readonly torsoAngle: string
  readonly toeLift: string
  readonly torsoWarn: string
  /** プリセット（presets.ts の id をキーにする） */
  readonly presets: Readonly<Record<string, string>>
  /** 足首の3段階（ANKLE_LEVELS の deg をキーにする） */
  readonly ankleLevels: Readonly<Record<string, string>>
  /** スクリーンリーダー用のグループ名 */
  readonly aria: {
    readonly settingMode: string
    readonly bodyPreset: string
    readonly ankle: string
    readonly barPosition: string
    readonly shoes: string
    readonly lang: string
  }
  /** 注記（§9）。<strong> を含むので innerHTML で入れる */
  readonly notesList: readonly string[]
}

const ja: Strings = {
  title: 'スクワット姿勢可視化',
  compare: '比較',
  notes: '注記',
  close: '閉じる',
  bodySection: '身体の特徴',
  simple: '簡易',
  detail: '詳細',
  ankle: '足首',
  depth: '深さ',
  play: '▶ 再生',
  stop: '■ 停止',
  highBar: 'ハイバー',
  lowBar: 'ローバー',
  flat: 'フラット',
  sneaker: 'スニーカー',
  lifting: 'リフティング',
  femur: '大腿',
  torso: '上体',
  shank: 'すね',
  rom: '足首の硬さ',
  torsoAngle: '上体角度',
  toeLift: 'つま先が浮く',
  torsoWarn: '現実的でない前傾',
  presets: {
    standard: '標準',
    'long-femur': '大腿が長い',
    'long-torso': '上体が長い',
    'long-shank': 'すねが長い',
  },
  ankleLevels: { 15: '硬め', 30: 'ふつう', 35: '柔らかめ' },
  aria: {
    settingMode: '設定モード',
    bodyPreset: '体型プリセット',
    ankle: '足首の硬さ',
    barPosition: '担ぎ位置',
    shoes: 'シューズ',
    lang: '言語',
  },
  notesList: [
    'バーではなく、身体＋バーの合成重心が中足部の上にあるのが正確な条件。高重量ではバー位置で近似できる。',
    '上体は1本の棒として扱っている（実際は腰椎・胸椎で角度が分散する）。',
    'スタンス幅を広げたり股関節を外旋させると、矢状面では大腿骨が短くなったのと同じ効果が出る。この図では表現していないが、実際の解決策としては有効。',
    '靴のヒールは最適な傾き量を変えるのではなく、その脛角度に<strong>届くかどうか</strong>を変える。',
    'ローバーは前傾を<strong>減らすのではなく増やす</strong>。買っているのは「脛を立てたままバランスが取れること」で、対価が前傾と股関節・背部の負担。大腿が長い人ほどこの増分は大きい。',
    '身長そのものは上体角度に影響しない。効くのは<strong>セグメントの比率だけ</strong>で、比率が同じなら大柄でも小柄でも答えは変わらない。',
    '傾きの大きさは体格による最適解であり、フォームの優劣ではない。',
  ],
}

const en: Strings = {
  title: 'Squat Posture Visualizer',
  compare: 'Compare',
  notes: 'Notes',
  close: 'Close',
  bodySection: 'Body',
  simple: 'Simple',
  detail: 'Detailed',
  ankle: 'Ankle',
  depth: 'Depth',
  play: '▶ Play',
  stop: '■ Stop',
  highBar: 'High bar',
  lowBar: 'Low bar',
  flat: 'Flat',
  sneaker: 'Sneakers',
  lifting: 'Lifting shoes',
  femur: 'Femur',
  torso: 'Torso',
  shank: 'Shin',
  // 可動域が大きいほど右へ動くので、英語では「硬さ」ではなく mobility と呼ぶ方が向きと一致する
  rom: 'Ankle mobility',
  torsoAngle: 'Torso angle',
  toeLift: 'Toes lift',
  torsoWarn: 'Unrealistic lean',
  presets: {
    standard: 'Average',
    'long-femur': 'Long femur',
    'long-torso': 'Long torso',
    'long-shank': 'Long shins',
  },
  ankleLevels: { 15: 'Stiff', 30: 'Average', 35: 'Mobile' },
  aria: {
    settingMode: 'Settings mode',
    bodyPreset: 'Body type preset',
    ankle: 'Ankle mobility',
    barPosition: 'Bar position',
    shoes: 'Shoes',
    lang: 'Language',
  },
  notesList: [
    "Strictly, it is the combined center of mass of body + bar that must stay over the midfoot, not the bar itself. Under heavy loads the bar's position is a good approximation.",
    'The torso is modeled as a single rigid segment (in reality the angle is distributed across the lumbar and thoracic spine).',
    "Widening the stance or externally rotating the hips has the same effect as a shorter femur in the sagittal plane. This model doesn't show it, but it is an effective real-world solution.",
    'A raised heel does not change the optimal amount of lean — it changes whether you can <strong>reach</strong> that shin angle.',
    'Low bar <strong>increases</strong> forward lean rather than reducing it. What it buys is the ability to stay balanced with more vertical shins; the price is more lean and more load on the hips and back. The longer the femur, the larger this increase.',
    "Height itself does not affect torso angle. Only the <strong>ratios between segments</strong> matter — with the same ratios, a tall and a short lifter get the same answer.",
    'How much you lean is the optimal solution for your proportions, not a measure of good or bad form.',
  ],
}

const TABLE: Record<Lang, Strings> = { ja, en }

let current: Lang = 'ja'

export const setLang = (lang: Lang): void => {
  current = lang
}

export const getLang = (): Lang => current

/** 現在の言語の文言一式 */
export const t = (): Strings => TABLE[current]

/** 言語を問わず参照したいとき（report スクリプト用） */
export const strings = (lang: Lang): Strings => TABLE[lang]

export const asLang = (v: string | null): Lang | null => (v === 'ja' || v === 'en' ? v : null)
