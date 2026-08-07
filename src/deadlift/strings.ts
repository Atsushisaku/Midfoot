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
  /** 種目ナビの文言（Rev.15）。現在地はハイライトで示すので、両方の名前が要る */
  readonly navSquat: string
  readonly navDeadlift: string
  /** エラー例のページへのリンク文言（Rev.15 で日英対応した） */
  readonly errLink: string
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
  /** 体型プリセットのボタン群のラベル（2026-08-07。エラー例ページと同じ語） */
  readonly build: string
  readonly stance: string
  /** 股関節の屈曲（可動域）のボタン群のラベル */
  readonly rom: string
  /** スライダー */
  readonly femur: string
  readonly torso: string
  readonly shank: string
  readonly arm: string
  readonly stanceDeg: string
  readonly romDeg: string
  /** 図の中の文字 */
  readonly backAngle: string
  readonly reachWarn: string
  /** 体型プリセット（presets.ts の id をキーにする） */
  readonly presets: Readonly<Record<string, string>>
  /** 腕の長さの3段階（ARM_LEVELS の倍率をキーにする。Rev.2-2） */
  readonly armLevels: Readonly<Record<string, string>>
  /** 股関節の屈曲の3段階（ROM_LEVELS の度をキーにする） */
  readonly romLevels: Readonly<Record<string, string>>
  /** スタンスの3段階（STANCES の deg をキーにする） */
  readonly stances: Readonly<Record<string, string>>
  /** スクリーンリーダー用のグループ名 */
  readonly aria: {
    /** 2つの「簡易｜詳細」を読み上げで区別する（Rev.7） */
    readonly bodyMode: string
    readonly setupMode: string
    readonly bodyPreset: string
    readonly armLevel: string
    readonly romLevel: string
    readonly stance: string
    readonly lang: string
  }
  /** 注記（仕様 §8）。<strong> を含むので innerHTML で入れる */
  readonly notesList: readonly string[]
}

const ja: DlStrings = {
  title: 'Midfoot デッドリフト',
  compare: '体格比較',
  notes: '注記',
  close: '閉じる',
  navSquat: 'スクワット',
  navDeadlift: 'デッドリフト',
  errLink: 'エラー比較',
  // 2026-08-07 の文言見直し（想定読者を**指導者**に定め、解剖・運動学の用語に揃える）。
  // 3 ページで同じ語を使うため、エラー例ページと対応させてある。
  // 「簡易｜詳細」の `detail` は表示モードの名前なので触らない（エラー例の「所見」とは別物）
  bodySection: '体格・可動域',
  setupSection: 'セットアップ',
  simple: '簡易',
  detail: '詳細',
  // 「挙上」→「挙上進行度」: バー高の進行を 0〜100% で表す量
  lift: '挙上進行度',
  play: '▶ 再生',
  stop: '■ 停止',
  build: '体節比',
  stance: 'スタンス',
  rom: '股関節屈曲',
  femur: '大腿',
  torso: '体幹',
  // 「すね」→「下腿」
  shank: '下腿',
  arm: '腕',
  stanceDeg: '開き角',
  romDeg: '股関節屈曲（°）',
  // 「水平から」を明記する。スクワット版の上体角度（鉛直から）とは基準が逆なので、
  // 単に「背角」とだけ書くと2つの図を見比べたときに読み違える
  backAngle: '背角（水平から）',
  // Rev.3: warn は「重心目標がこの体格・設定では達成できず、最も近い姿勢を表示している」の意味
  reachWarn: 'この設定では釣り合えない（近い姿勢を表示）',
  presets: {
    standard: '標準',
    // 体型の分類名として名詞化する
    'long-femur': '大腿長型',
    'long-torso': '体幹長型',
  },
  // ARM_LEVELS の倍率をそのままキーにする（String(1.0) は '1' になる点に注意）
  armLevels: { 0.9: '短い', 1: '標準', 1.1: '長い' },
  // ROM_LEVELS の度をそのままキーにする
  romLevels: { 110: '硬め', 120: '標準', 130: '柔らかめ' },
  stances: { 0: 'ナロー', 12: 'ミドル', 35: 'スモウ' },
  aria: {
    bodyMode: '体格・可動域の表示モード',
    setupMode: 'セットアップの表示モード',
    bodyPreset: '体節比プリセット',
    armLevel: '腕の長さ',
    romLevel: '股関節屈曲の可動域',
    stance: 'スタンス',
    lang: '言語',
  },
  notesList: [
    'スタンスの開きは、前額面（正面から見た脚の開き）を<strong>矢状面へ射影して置き換えたもの</strong>で、3 次元の動きをそのまま解いているわけではない。図の中の<strong>つま先の向き（床の下の足型）・靴を短く描くこと・腕を脚の手前と奥のどちらに描くか</strong>も、横からの 1 枚では開きを表せないことを補うための約束事で、幾何の計算には入っていない。',
    '模範フォームは「バーは中足部の真上」「身体重心はかかと寄りの標準位置」「シャフトが脛に触れる」の 3 つで決めている。この 3 つで姿勢が一つに決まるため、<strong>腰の高さも腕の角度も肩の位置も、選ぶものではなく体格から決まる結果</strong>になる（「腕は鉛直」のようなルールは使っていない）。',
    '身体とバーを合わせた重心は、バーと身体重心の<strong>間</strong>にあり、バーが重いほどバー側へ近づく。したがってバランスの条件は、バーが足のどこにあるかではなく<strong>この合成重心が足の上（支持基底の中）にあること</strong>。体節の質量比は Winter の標準値をそのまま当てはめている。',
    '背中の丸みは、<strong>体格が要求する前屈の深さが股関節の可動域を超えたぶん</strong>を腰椎の曲がりとして描いたもので、可動域そのものを解いているわけではない。3 択の値も<strong>集団の代表値で個人差が大きく</strong>、個人の実測値ではない。胸のあたりの丸みは<strong>正常な胸椎の後弯</strong>で、可動域に収まっていても常に描かれる。丸みがあること自体はエラーではない。',
  ],
}

const en: DlStrings = {
  title: 'Midfoot Deadlift',
  compare: 'Compare builds',
  notes: 'Notes',
  close: 'Close',
  navSquat: 'Squat',
  navDeadlift: 'Deadlift',
  errLink: 'Compare errors',
  // 2026-08-07: 日本語に合わせて英語も指導者向けの用語へ。3 ページで同じ語を使う
  bodySection: 'Proportions & ROM',
  setupSection: 'Setup',
  simple: 'Simple',
  detail: 'Detailed',
  lift: 'Lift progress',
  play: '▶ Play',
  stop: '■ Stop',
  build: 'Segments',
  stance: 'Stance',
  rom: 'Hip flexion',
  femur: 'Femur',
  torso: 'Torso',
  shank: 'Shank',
  arm: 'Arm',
  stanceDeg: 'Stance angle',
  romDeg: 'Hip flexion ROM (°)',
  backAngle: 'Back angle (from horizontal)',
  reachWarn: 'Cannot balance with this setup (showing the closest pose)',
  presets: {
    standard: 'Average',
    'long-femur': 'Long femur',
    'long-torso': 'Long torso',
  },
  armLevels: { 0.9: 'Short', 1: 'Standard', 1.1: 'Long' },
  romLevels: { 110: 'Stiff', 120: 'Average', 130: 'Flexible' },
  stances: { 0: 'Narrow', 12: 'Middle', 35: 'Sumo' },
  aria: {
    bodyMode: 'Proportions & ROM display mode',
    setupMode: 'Setup display mode',
    bodyPreset: 'Segment ratio preset',
    armLevel: 'Arm length',
    romLevel: 'Hip flexion range of motion',
    stance: 'Stance',
    lang: 'Language',
  },
  notesList: [
    'Stance width is shown as <strong>a projection of the frontal-plane leg spread onto the sagittal plane</strong>. The model does not solve the three-dimensional movement itself. The <strong>toe direction (the footprint below the floor), the shortened shoe, and whether the arm is drawn in front of or behind the leg</strong> are drawing conventions for the same reason — a single side view cannot show the spread — and none of them enter the geometry.',
    'The reference form is fixed by three cues: the bar sits over the midfoot, the body’s center of mass sits at its standard position toward the heel, and the shaft touches the shin. Those close the pose, so <strong>hip height, arm angle and shoulder position are not things you choose but outputs of your proportions</strong> (no rule such as “the arms hang vertically” is used).',
    'The combined center of mass of body and bar falls <strong>between</strong> the bar and the body’s center of mass, and moves toward the bar as the load gets heavier. What balance requires is that this combined center stays <strong>over the foot (inside the base of support)</strong>. Segment mass ratios use Winter’s standard values as an approximation.',
    'The rounding of the back is drawn as an approximation: <strong>whatever part of the forward bend your proportions demand exceeds your hip range of motion</strong> is shown as lumbar flexion. The range itself is not solved for, and the three levels are <strong>population averages with wide individual variation</strong> — not your own measurement. The gentle rounding at chest height is the <strong>normal thoracic curve</strong> and is drawn even when the bend stays within range. Rounding is not the same thing as an error.',
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
