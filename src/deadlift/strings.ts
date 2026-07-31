/**
 * デッドリフト版の文言（日英）。仕様 docs/deadlift-proto-spec.md §0 / §8 / Rev.8
 *
 * 将来スクワット版の `src/i18n.ts` へ機械的に合流させたいので、**API と構造を
 * そちらに合わせてある**（`Lang` / `setLang` / `getLang` / `t` / `strings` / `asLang`）。
 * 英語も、同じ意味のキーがあるものはスクワット版 `en` の言い回しをそのまま使い、
 * 合流後に表記ゆれが出ないようにしている。
 */

export type Lang = 'ja' | 'en'

export interface DlStrings {
  readonly title: string
  /** 図の隅のボタン */
  readonly compare: string
  readonly notes: string
  readonly close: string
  /** スクワット版への行き来リンク（Rev.9） */
  readonly exLink: string
  /** 設定ペインの見出し */
  readonly bodySection: string
  readonly setupSection: string
  readonly simple: string
  readonly detail: string
  /** 共有の操作 */
  readonly lift: string
  readonly play: string
  readonly stop: string
  /** ボタン群のラベル */
  readonly stance: string
  /** スライダー */
  readonly femur: string
  readonly torso: string
  readonly shank: string
  readonly arm: string
  readonly stanceDeg: string
  /** 図の中の文字 */
  readonly backAngle: string
  readonly reachWarn: string
  /** 体型プリセット（presets.ts の id をキーにする） */
  readonly presets: Readonly<Record<string, string>>
  /** 腕の長さの3段階（ARM_LEVELS の倍率をキーにする。Rev.2-2） */
  readonly armLevels: Readonly<Record<string, string>>
  /** スタンスの3段階（STANCES の deg をキーにする） */
  readonly stances: Readonly<Record<string, string>>
  /** スクリーンリーダー用のグループ名 */
  readonly aria: {
    /** 2つの「簡易｜詳細」を読み上げで区別する（Rev.7） */
    readonly bodyMode: string
    readonly setupMode: string
    readonly bodyPreset: string
    readonly armLevel: string
    readonly stance: string
    readonly lang: string
  }
  /** 注記（仕様 §8）。<strong> を含むので innerHTML で入れる */
  readonly notesList: readonly string[]
}

const ja: DlStrings = {
  title: 'Midfoot デッドリフト',
  compare: '比較',
  notes: '注記',
  close: '閉じる',
  exLink: 'スクワット',
  bodySection: '身体的特徴',
  setupSection: 'セッティング',
  simple: '簡易',
  detail: '詳細',
  lift: '挙上',
  play: '▶ 再生',
  stop: '■ 停止',
  stance: 'スタンス',
  femur: '大腿',
  torso: '体幹',
  shank: 'すね',
  arm: '腕',
  stanceDeg: '開き角',
  // 「水平から」を明記する。スクワット版の上体角度（鉛直から）とは基準が逆なので、
  // 単に「背角」とだけ書くと2つの図を見比べたときに読み違える
  backAngle: '背角（水平から）',
  // Rev.3: warn は「重心目標がこの体格・設定では達成できず、最も近い姿勢を表示している」の意味
  reachWarn: 'この設定では釣り合えない（近い姿勢を表示）',
  presets: {
    standard: '標準',
    'long-femur': '大腿が長い',
    'long-torso': '体幹が長い',
  },
  // ARM_LEVELS の倍率をそのままキーにする（String(1.0) は '1' になる点に注意）
  armLevels: { 0.9: '短い', 1: '標準', 1.1: '長い' },
  stances: { 0: 'ナロー', 12: 'ミドル', 35: 'スモウ' },
  aria: {
    bodyMode: '身体的特徴の表示モード',
    setupMode: 'セッティングの表示モード',
    bodyPreset: '体型プリセット',
    armLevel: '腕の長さ',
    stance: 'スタンス',
    lang: '言語',
  },
  notesList: [
    'スタンスの開きは、前額面（正面から見た脚の開き）を<strong>矢状面へ射影した見なし</strong>で表している。3次元の動きをそのまま解いているわけではない。図の中の<strong>つま先の向き（床の下の足型）・靴の短縮・腕が脚の手前か奥か</strong>も、横からの1枚では描けない開きを補うための描画上の見なしで、幾何の計算には入っていない。',
    '模範フォームの決め方は「バーは中足部の真上」「身体重心はかかと寄りの標準位置」「シャフトが脛に触れる」の3つ。これで姿勢は閉じるので、<strong>腰の高さも腕の角度も肩の位置も、選ぶものではなく体格から決まる出力</strong>になる（「腕は鉛直」のようなルールは使っていない）。',
    '身体とバーを合わせた重心（COP）は、バーと身体重心の<strong>間</strong>に落ちる。バーが重いほどバー寄りになるので、バランスに必要なのは合成重心が<strong>足の上（支持基底の中）</strong>にあること。体節の質量比は Winter の標準値を使った見なし。',
  ],
}

const en: DlStrings = {
  title: 'Midfoot Deadlift',
  compare: 'Compare',
  notes: 'Notes',
  close: 'Close',
  exLink: 'Squat',
  bodySection: 'Body',
  setupSection: 'Setup',
  simple: 'Simple',
  detail: 'Detailed',
  lift: 'Lift',
  play: '▶ Play',
  stop: '■ Stop',
  stance: 'Stance',
  femur: 'Femur',
  torso: 'Torso',
  shank: 'Shin',
  arm: 'Arm',
  stanceDeg: 'Stance angle',
  backAngle: 'Back angle (from horizontal)',
  reachWarn: 'Cannot balance with this setup (showing the closest pose)',
  presets: {
    standard: 'Average',
    'long-femur': 'Long femur',
    'long-torso': 'Long torso',
  },
  armLevels: { 0.9: 'Short', 1: 'Standard', 1.1: 'Long' },
  stances: { 0: 'Narrow', 12: 'Middle', 35: 'Sumo' },
  aria: {
    bodyMode: 'Proportions display mode',
    setupMode: 'Setup display mode',
    bodyPreset: 'Body type preset',
    armLevel: 'Arm length',
    stance: 'Stance',
    lang: 'Language',
  },
  notesList: [
    'Stance width is shown as <strong>a projection of the frontal-plane leg spread onto the sagittal plane</strong>. The model does not solve the three-dimensional movement itself. The <strong>toe direction (the footprint below the floor), the shortened shoe, and whether the arm is drawn in front of or behind the leg</strong> are drawing conventions for the same reason — a single side view cannot show the spread — and none of them enter the geometry.',
    'The reference form is fixed by three cues: the bar sits over the midfoot, the body’s center of mass sits at its standard position toward the heel, and the shaft touches the shin. Those close the pose, so <strong>hip height, arm angle and shoulder position are not things you choose but outputs of your proportions</strong> (no rule such as “the arms hang vertically” is used).',
    'The combined center of mass of body and bar (COP) falls <strong>between</strong> the bar and the body’s center of mass, and moves toward the bar as the load gets heavier. What balance requires is that this combined center stays <strong>over the foot (inside the base of support)</strong>. Segment mass ratios use Winter’s standard values as an approximation.',
  ],
}

const TABLE: Record<Lang, DlStrings> = { ja, en }

let current: Lang = 'ja'

export const setLang = (lang: Lang): void => {
  current = lang
}

export const getLang = (): Lang => current

/** 現在の言語の文言一式 */
export const t = (): DlStrings => TABLE[current]

/** 言語を問わず参照したいとき（report スクリプト用） */
export const strings = (lang: Lang): DlStrings => TABLE[lang]

export const asLang = (v: string | null): Lang | null => (v === 'ja' || v === 'en' ? v : null)
