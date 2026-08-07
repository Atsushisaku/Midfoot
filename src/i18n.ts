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
  /** デッドリフト版への行き来リンク（Rev.9） */
  /** 種目ナビの文言（Rev.15）。現在地はハイライトで示すので、両方の名前が要る */
  readonly navSquat: string
  readonly navDeadlift: string
  /** 設定ペイン */
  readonly bodySection: string
  readonly toolSection: string
  readonly simple: string
  readonly detail: string
  /** 体型プリセットのボタン群のラベル（2026-08-07。エラー例ページと同じ語） */
  readonly build: string
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
  compare: '体格比較',
  notes: '注記',
  close: '閉じる',
  navSquat: 'スクワット',
  navDeadlift: 'デッドリフト',
  // 2026-08-07 の文言見直し（想定読者を**指導者**に定め、解剖・運動学の用語に揃える）。
  // 3 ページで同じ語を使うため、デッドリフト版・エラー例ページと対応させてある。
  // 「簡易｜詳細」の `detail` は表示モードの名前なので触らない
  bodySection: '体格・可動域',
  // デッドリフト版の `setupSection` と同じ語に揃える。担ぐ位置も靴も
  // 「引く／しゃがむ前に決める条件」なので、種目をまたいで同じ見出しでよい
  toolSection: 'セットアップ',
  simple: '簡易',
  detail: '詳細',
  build: '体節比',
  ankle: '足関節',
  // 「深さ」→「しゃがみ深度」: デッドリフト版の「挙上進行度」と対になる進行量
  depth: 'しゃがみ深度',
  play: '▶ 再生',
  stop: '■ 停止',
  highBar: 'ハイバー',
  lowBar: 'ローバー',
  flat: 'フラット',
  sneaker: 'スニーカー',
  lifting: 'リフティング',
  femur: '大腿',
  // 「上体」→「体幹」、「すね」→「下腿」: デッドリフト版のスライダー名と揃える
  torso: '体幹',
  shank: '下腿',
  // 制限しているのは背屈の可動域なので、そう書く
  rom: '足関節背屈 ROM',
  // 基準を明記する。デッドリフト版の「背角（水平から）」と見比べて読み違えないため
  torsoAngle: '体幹角（鉛直から）',
  toeLift: 'つま先が浮く',
  torsoWarn: '非現実的な前傾角',
  presets: {
    standard: '標準',
    // 体型の分類名として名詞化する
    'long-femur': '大腿長型',
    'long-torso': '体幹長型',
    'long-shank': '下腿長型',
  },
  // 「ふつう」→「標準」: 3 ページで同じ語に揃える
  ankleLevels: { 15: '硬め', 30: '標準', 35: '柔らかめ' },
  aria: {
    settingMode: '設定モード',
    bodyPreset: '体節比プリセット',
    ankle: '足関節背屈の可動域',
    barPosition: '担ぎ位置',
    shoes: 'シューズ',
    lang: '言語',
  },
  notesList: [
    '厳密な条件は「バーが中足部の真上」ではなく、<strong>身体とバーを合わせた重心が中足部の真上</strong>にあること。高重量ではバーの位置でほぼ近似できる。',
    'この図では上体を1本の棒として扱っている。実際の前傾は腰椎と胸椎に分散する。',
    'スタンスを広げたり股関節を外旋させたりすると、横から見た面では<strong>大腿が短くなったのと同じ効果</strong>になる。この図では表現していないが、前傾を抑える手段としては有効。',
    '靴のヒールが変えるのは、必要な前傾の量そのものではなく<strong>すねをどこまで前に倒せるか</strong>。足首が硬い人ほど効果が大きい。',
    'ローバーは前傾を<strong>減らすのではなく増やす</strong>。得られるのは「すねを立てたままバランスが取れること」で、引き換えに前傾が深くなり、股関節と背部の負担が増える。大腿が長い人ほど増え方は大きい。',
    '身長そのものは上体角度に影響しない。効くのは<strong>各部位の長さの比だけ</strong>で、比が同じなら大柄でも小柄でも同じ角度になる。',
    '傾きの大きさは<strong>その人の体格にとっての最適解</strong>であって、フォームの良し悪しではない。',
  ],
}

const en: Strings = {
  title: 'Squat Posture Visualizer',
  compare: 'Compare builds',
  notes: 'Notes',
  close: 'Close',
  navSquat: 'Squat',
  navDeadlift: 'Deadlift',
  // 2026-08-07: 日本語を指導者向けの用語に揃えたので、英語も同じ水準へ合わせる。
  // 3 ページで同じ語を使う（体節比 = Segments、セットアップ = Setup ほか）
  bodySection: 'Proportions & ROM',
  toolSection: 'Setup',
  simple: 'Simple',
  detail: 'Detailed',
  build: 'Segments',
  ankle: 'Ankle',
  depth: 'Squat depth',
  play: '▶ Play',
  stop: '■ Stop',
  highBar: 'High bar',
  lowBar: 'Low bar',
  flat: 'Flat',
  sneaker: 'Sneakers',
  lifting: 'Lifting shoes',
  femur: 'Femur',
  torso: 'Torso',
  // 日本語を「下腿」にしたのに合わせ、解剖用語の shank にする（旧 'Shin'）
  shank: 'Shank',
  // 制限しているのは背屈の可動域なので、そう書く（旧 'Ankle mobility'）。
  // ROM も可動域が大きいほど右へ動くので、スライダーの向きとは一致したまま
  rom: 'Ankle dorsiflexion ROM',
  torsoAngle: 'Torso angle (from vertical)',
  toeLift: 'Toes lift off',
  torsoWarn: 'Unrealistic lean angle',
  presets: {
    standard: 'Average',
    'long-femur': 'Long femur',
    'long-torso': 'Long torso',
    'long-shank': 'Long shank',
  },
  ankleLevels: { 15: 'Stiff', 30: 'Average', 35: 'Mobile' },
  aria: {
    settingMode: 'Settings mode',
    bodyPreset: 'Segment ratio preset',
    ankle: 'Ankle dorsiflexion ROM',
    barPosition: 'Bar position',
    shoes: 'Shoes',
    lang: 'Language',
  },
  notesList: [
    'The exact condition is not that the bar sits over the midfoot, but that the <strong>combined center of mass of body and bar</strong> does. Under heavy loads the bar position is a close enough approximation.',
    'This model treats the torso as a single rigid segment. Real forward lean is distributed across the lumbar and thoracic spine.',
    'Widening the stance or rotating the hips outward has <strong>the same effect as a shorter femur</strong> when seen from the side. The model does not show this, but it is an effective way to reduce lean in practice.',
    'What a raised heel changes is <strong>how far the shin can travel forward</strong>, not the amount of lean you need. The stiffer the ankle, the more it helps.',
    'Low bar <strong>increases</strong> forward lean rather than reducing it. What you gain is the ability to stay balanced with more vertical shins; in exchange the lean gets deeper and the hips and back carry more. The longer the femur, the larger the increase.',
    'Height itself does not affect torso angle. Only the <strong>ratios between segment lengths</strong> matter — with the same ratios, a tall and a short lifter end up at the same angle.',
    'How much you lean is <strong>the optimal answer for your proportions</strong>, not a measure of good or bad form.',
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
