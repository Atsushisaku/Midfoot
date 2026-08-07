/**
 * デッドリフトのエラー例。
 * 要件: docs/error-app-requirements.md
 *
 * 左＝最適フォーム、右＝エラーフォーム。**同一人物**なので体格・スタンスは共有する。
 *
 * UI は**カタログ（エラー名）＋ 程度（軽／中／重）＋ 体格の行だけ**。逸脱パラメータの
 * スライダーは出さない。インストラクターが指すのは「現象」であって、
 * バー位置や腰の先行度といった内部表現ではないため（要件 §7.3）。
 *
 * **数値の readout は置かない**（2026-08-07 の UI 整理）。主指標（脚の伸展の使用率）も
 * 脊柱まわりの数値も撤去し、図だけを見せる。最適とエラーの梃子を並べた表は
 * 「特に何の分析にもならない」ため撤去済み（要件 §12.4）。`./metrics` の梃子まわりは
 * モデル層として残っており、経路B（`./kappa`）が使っている。
 *
 * 骨盤と脊柱は `../deadlift/spine` の `lumbarSpineOf` で出す。可動域由来（κ_A）に加えて
 * エラー由来の丸まり（経路B、`./kappa`）をこのページだけ上乗せする。
 *
 * 描画と幾何は `../deadlift/` のものをそのまま使う。
 * 日英対応。URL 共有は持たないが、デッドリフト版が付ける `?lang=` だけは読む
 * （他の 2 ページと同じ規約）。文言に依存する DOM の更新は `applyLang()` と
 * 各 seg の `sync()` に集約してあり、言語を切り替えても同じ経路を通る。
 */

import { CM_PER_UNIT, solveDlPose, type DlBody, type DlPose } from '../deadlift/geometry'
import { ARM_LEVELS, DL_PRESETS, FOOT, STANCES } from '../deadlift/presets'
import { COLORS, renderScene, type Scene } from '../deadlift/render'
// 図の中の文言（「背角（水平から）」など）は render.ts が deadlift 側の strings から引くので、
// こちらの言語切替に合わせて**あちらの言語も揃える**必要がある
import { setLang as setFigureLang } from '../deadlift/strings'
import { ROM_LEVELS, lumbarSpineOf, type SpineOptions } from '../deadlift/spine'
import { CATALOG, NO_DEVIATION, type Deviation, type Level } from './catalog'
import { errorKappaOf, fadedKappaAddDeg } from './kappa'
import { asLang, getLang, setLang, t, type Lang } from './strings'
import '../style.css'

const state = {
  presetId: DL_PRESETS[0]!.id,
  mArm: 1.0,
  stanceDeg: STANCES[1]!,
  lift: 0,
  /** null ＝ エラーなし */
  errorId: null as string | null,
  level: 1 as Level,
  /** 股関節屈曲の可動域（度）。ROM_LEVELS の 3 択。両者共通（同一人物なので） */
  romDeg: 120,
}

/**
 * 曲げの誇張倍率（2026-08-07 の UI 整理で確定）。実寸のままだと弓なりが浅くて
 * 読めず、×2 は大げさなので、その中間に置いた**表示上の倍率**。
 */
const EXAGGERATE = 1.5

const currentEntry = () => CATALOG.find((e) => e.id === state.errorId) ?? null
const currentDev = (): Deviation => currentEntry()?.levels[state.level] ?? NO_DEVIATION

// ---------------------------------------------------------------------------
// 姿勢
// ---------------------------------------------------------------------------

const bodyOf = (): DlBody => ({
  ...DL_PRESETS.find((p) => p.id === state.presetId)!.body,
  mArm: state.mArm,
  foot: FOOT,
})

/** 逸脱を渡さなければ最適フォーム。`hipHeight` の基準 0.5 は Rev.4 の規約（要件 §7.1） */
function poseAt(lift: number, dev: Deviation): DlPose {
  return solveDlPose({
    body: bodyOf(),
    bar: 'standard',
    stanceDeg: state.stanceDeg,
    hipHeight: 0.5 + dev.hipDelta,
    t: lift,
    barOffset: dev.barOffsetCm / CM_PER_UNIT,
    hipLead: dev.hipLead,
    kneeAheadExtra: dev.kneeAheadExtraCm / CM_PER_UNIT,
    ...(dev.hipLeadRamp !== undefined ? { hipLeadRamp: dev.hipLeadRamp } : {}),
  })
}

/**
 * 骨盤・脊柱モデルの入力。可動域まわりは両者で共有する（同一人物なので）。
 * 違うのは `kappaExtraDeg`（経路B の置き κ）だけで、最適側は常に 0。
 */
const spineOpts = (kappaExtraDeg = 0): SpineOptions => ({
  romDeg: state.romDeg,
  stanceDeg: state.stanceDeg,
  exaggerate: EXAGGERATE,
  kappaExtraDeg,
})

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const $ = <T extends Element>(sel: string): T => {
  const node = document.querySelector<T>(sel)
  if (!node) throw new Error(`missing element: ${sel}`)
  return node
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text) node.textContent = text
  return node
}

const svg = $<SVGSVGElement>('#fig')
const liftRow = $<HTMLDivElement>('#liftRow')
const panel = $<HTMLDivElement>('#errPanel')
const langSeg = $<HTMLDivElement>('#lang')
const navEl = $<HTMLElement>('#nav')
/**
 * 図の左下の「エラー比較」ボタン（2026-08-07）。デッドリフト版の同名ボタンと同じ位置・
 * 同じ見た目で、こちらでは**押下状態**にしてある。押すとデッドリフト版へ戻る
 * （押すと入る・もう一度押すと出る、という「体格比較」と同じ挙動）。
 */
const errLink = $<HTMLAnchorElement>('#errLink')
/**
 * 「体格比較」ボタン（2026-08-07）。このページは左右で体格が共通なので体格比較は
 * **オフ**で、押すとデッドリフト版の体格比較モードへ直接入る（`?compare=1`）。
 * エラー比較 ⇔ 体格比較 を 1 タップで行き来できる。
 */
const compareBtn = $<HTMLAnchorElement>('#compareBtn')
/**
 * 種目ナビ（Rev.15）。現在地を `aria-current` でハイライトし、リンクには言語を引き継ぐ。
 * `?lang=` の規約は 3 ページ共通で、既定の `ja` は付けない。
 */
function applyNav(current: 'squat' | 'deadlift', labels: { squat: string; deadlift: string }): void {
  const q = getLang() === 'ja' ? '' : `?lang=${getLang()}`
  // スクワットの href は file:// の 2 枚並べ運用でも辿れるよう index.html、
  // それ以外は計測のパスが割れないよう './' に寄せる（従来の exLink と同じ規約）
  const squatBase = location.protocol === 'file:' ? 'index.html' : './'
  for (const a of navEl.querySelectorAll('a')) {
    const page = a.dataset['page'] as 'squat' | 'deadlift'
    a.textContent = labels[page]
    a.href = (page === 'squat' ? squatBase : 'deadlift.html') + q
    if (page === current) a.setAttribute('aria-current', 'page')
    else a.removeAttribute('aria-current')
  }
}


/**
 * ボタン群。値（`v`）は言語によらず不変なので DOM は 1 度だけ作り、
 * `sync()` で**文言と押下状態の両方**を更新する。こうしておくと言語切替でも
 * 作り直さずに追従でき、押下状態の更新と同じ経路で済む。
 */
function buildSeg(
  values: readonly string[],
  labelOf: (v: string) => string,
  isOn: (v: string) => boolean,
  onPick: (v: string) => void,
  ariaOf: () => string,
): { seg: HTMLDivElement; sync: () => void } {
  const seg = el('div', 'seg presets')
  seg.setAttribute('role', 'group')
  for (const v of values) {
    const btn = el('button')
    btn.dataset['v'] = v
    seg.append(btn)
  }
  seg.addEventListener('click', (ev) => {
    const v = (ev.target as HTMLElement).closest('button')?.dataset['v']
    if (v !== undefined) {
      onPick(v)
      render()
    }
  })
  const sync = () => {
    seg.setAttribute('aria-label', ariaOf())
    for (const btn of seg.querySelectorAll('button')) {
      const v = btn.dataset['v']!
      btn.textContent = labelOf(v)
      btn.setAttribute('aria-pressed', String(isOn(v)))
    }
  }
  return { seg, sync }
}

// --- 時間スライダー ＋ 再生 ---------------------------------------------------

const playBtn = el('button', 'playbtn')
let play: { start: number } | null = null
const PLAY_MS = 2600

const liftSlider = el('input')
liftSlider.type = 'range'
liftSlider.min = '0'
liftSlider.max = '1'
liftSlider.step = '0.005'
const liftRead = el('span', 'sliderval')
const liftLabel = el('span')

const syncLift = () => {
  liftSlider.value = String(state.lift)
  liftRead.textContent = `${Math.round(state.lift * 100)}%`
}
const stopPlay = () => {
  play = null
  playBtn.textContent = t().play
}
liftSlider.addEventListener('input', () => {
  state.lift = Number(liftSlider.value)
  stopPlay()
  syncLift()
  render()
})
playBtn.addEventListener('click', () => {
  if (play) stopPlay()
  else {
    play = { start: performance.now() }
    playBtn.textContent = t().stop
    requestAnimationFrame(step)
  }
})
function step(now: number): void {
  if (!play) return
  state.lift = Math.min(1, (now - play.start) / PLAY_MS)
  syncLift()
  render()
  if (state.lift >= 1) stopPlay()
  else requestAnimationFrame(step)
}

const liftBox = el('div', 'slider')
liftBox.append(liftLabel, liftSlider, liftRead)
liftRow.append(playBtn, liftBox)

// --- 体格（共通）-------------------------------------------------------------

const bodyRow = el('div', 'row')
const bodyRowLabel = el('strong', 'rowlabel')
// 4 つのセグそれぞれに小見出しを付ける（体型／腕／股関節の屈曲／スタンス）。
// 行見出しは「両者共通」で、この行が**両者に共通の条件**であることだけを言う
const presetRowLabel = el('span', 'rowsub')
const armRowLabel = el('span', 'rowsub')
const romRowLabel = el('span', 'rowsub')
const stanceRowLabel = el('span', 'rowsub')
const presetSeg = buildSeg(
  DL_PRESETS.map((p) => p.id),
  (v) => t().presets[v] ?? v,
  (v) => v === state.presetId,
  (v) => {
    state.presetId = v
  },
  () => t().aria.bodyPreset,
)
const armSeg = buildSeg(
  ARM_LEVELS.map(String),
  (v) => t().armLevels[v] ?? v,
  (v) => Number(v) === state.mArm,
  (v) => {
    state.mArm = Number(v)
  },
  () => t().aria.armLevel,
)
const stanceSeg = buildSeg(
  STANCES.map(String),
  (v) => t().stances[v] ?? v,
  (v) => Number(v) === state.stanceDeg,
  (v) => {
    state.stanceDeg = Number(v)
  },
  () => t().aria.stance,
)
/**
 * 股関節の屈曲（可動域）の 3 択。κ_A = 見かけの股屈曲 − ROM なので、ここを動かすと
 * **姿勢はそのままで腰の丸まりだけ**が増減する。丸まりやすさが体格・柔軟性の関数だ、
 * という Midfoot の主題そのものなので、体格の行に置く。
 */
const romSeg = buildSeg(
  ROM_LEVELS.map(String),
  (v) => t().romLevels[v] ?? v,
  (v) => Number(v) === state.romDeg,
  (v) => {
    state.romDeg = Number(v)
  },
  () => t().aria.rom,
)
/**
 * 小見出しとボタン群は**必ず 1 つの塊**にする（2026-08-07）。
 * 素で並べると、狭い画面で行が折り返したときに小見出しだけが前の行の末尾に残り、
 * 「体節比」と［標準］［大腿長型］…が離れてしまう（スマホで実際に起きた）。
 * `.labeled-seg` はスクワット版・デッドリフト版が同じ目的で使っているものと同じ。
 */
const labeled = (label: HTMLElement, seg: HTMLElement): HTMLDivElement => {
  const box = el('div', 'labeled-seg')
  box.append(label, seg)
  return box
}
bodyRow.append(
  bodyRowLabel,
  labeled(presetRowLabel, presetSeg.seg),
  labeled(armRowLabel, armSeg.seg),
  labeled(romRowLabel, romSeg.seg),
  labeled(stanceRowLabel, stanceSeg.seg),
)

// --- エラー（カタログ ＋ 程度）------------------------------------------------

const errRow = el('div', 'row')
const errRowLabel = el('strong', 'rowlabel')
const levelLabel = el('span', 'rowsub')
const errSeg = buildSeg(
  ['', ...CATALOG.map((e) => e.id)],
  (v) => (v === '' ? t().none : (t().errors[v]?.label ?? v)),
  (v) => (v === '' ? state.errorId === null : v === state.errorId),
  (v) => {
    state.errorId = v === '' ? null : v
  },
  () => t().aria.error,
)
const levelSeg = buildSeg(
  ['0', '1', '2'],
  (v) => t().levels[Number(v) as Level],
  (v) => Number(v) === state.level,
  (v) => {
    state.level = Number(v) as Level
  },
  () => t().aria.level,
)
// 「最大乖離点へ飛ぶ」ボタンは置かない。エラーは床を離れた直後にはもう出ていて、
// 乖離が最大になる時点を探すより前に問題は見えているため（2026-08-03 判断）。
errRow.append(errRowLabel, errSeg.seg, labeled(levelLabel, levelSeg.seg))

// 「詳細」は体格・エラーと同じ行の作り（左に見出し、右に中身）にする
const whatRow = el('div', 'row whatrow')
const whatRowLabel = el('strong', 'rowlabel')
const whatList = el('ul', 'whatlist')
whatRow.append(whatRowLabel, whatList)

panel.append(bodyRow, errRow, whatRow)

// ---------------------------------------------------------------------------
// 描画
// ---------------------------------------------------------------------------

// 主指標（脚の伸展の使用率）の readout は 2026-08-07 の UI 整理で撤去した。
// モデル（`./metrics` の `legExtensionUsed`）と文言（`./strings` の legLead など）は
// 残っているので、戻すときは git 履歴の renderLeg を復元すればよい。

function render(): void {
  const entry = currentEntry()
  const opt = poseAt(state.lift, NO_DEVIATION)
  const err = poseAt(state.lift, currentDev())
  // 経路B は「同じ t の最適フォームからの超過」なので、ref には opt をそのまま渡す。
  // 置き κ（腰椎の屈曲）だけは姿勢に紐づかないので、自前でフェードさせて足す
  const kb = errorKappaOf(err, opt, state.lift)
  const kappaExtra = entry
    ? kb.hamDeg + kb.loadDeg + fadedKappaAddDeg(entry.kappaAddDeg[state.level]!, state.lift)
    : 0
  const optSpine = lumbarSpineOf(opt, spineOpts())
  const errSpine = lumbarSpineOf(err, spineOpts(kappaExtra))
  const scene: Scene = {
    layout: 'side',
    bodies: [
      {
        pose: opt,
        color: COLORS.bodyA,
        stanceDeg: state.stanceDeg,
        spine: optSpine.spine,
        pelvis: optSpine.pelvis,
      },
      {
        pose: err,
        color: COLORS.bodyB,
        stanceDeg: state.stanceDeg,
        spine: errSpine.spine,
        pelvis: errSpine.pelvis,
      },
    ],
  }
  renderScene(svg, scene)

  // 要素は消さない。消すと下の段の高さが変わって**図まで動く**ので、
  // 説明も指標も常に置いたままにして中身だけ差し替える（要件 §13）。
  // 程度は選べないだけにして、場所は残す。
  const comment = entry ? (t().errors[entry.id]?.what ?? t().noneComment) : t().noneComment
  whatList.replaceChildren(...comment.map((line) => el('li', '', line)))
  whatRow.classList.toggle('muted', entry === null)
  levelSeg.seg.classList.toggle('is-off', entry === null)
  levelLabel.classList.toggle('is-off', entry === null)

  presetSeg.sync()
  armSeg.sync()
  romSeg.sync()
  stanceSeg.sync()
  errSeg.sync()
  levelSeg.sync()
}

// ---------------------------------------------------------------------------
// 言語
// ---------------------------------------------------------------------------

/** 文言に依存する DOM の更新はここに集約する（切替時に同じ経路を通る） */
function applyLang(): void {
  const s = t()
  setFigureLang(getLang())
  document.documentElement.lang = getLang()
  document.title = s.title
  // エラー例はデッドリフトの下位ページ。ナビはデッドリフトを選択したままにする
  applyNav('deadlift', { squat: s.navSquat, deadlift: s.navDeadlift })
  // 押下状態の「エラー例」ボタン。押すとデッドリフト版へ戻る（言語は引き継ぐ）
  errLink.textContent = s.errLink
  errLink.href = getLang() === 'ja' ? 'deadlift.html' : `deadlift.html?lang=${getLang()}`
  // 体格比較へ。言語も引き継ぐ（?lang= の規約は 3 ページ共通で、既定の ja は付けない）
  compareBtn.textContent = s.compare
  compareBtn.href =
    getLang() === 'ja' ? 'deadlift.html?compare=1' : `deadlift.html?compare=1&lang=${getLang()}`
  bodyRowLabel.textContent = s.sharedRow
  presetRowLabel.textContent = s.buildLabel
  armRowLabel.textContent = s.armLabel
  romRowLabel.textContent = s.romLabel
  stanceRowLabel.textContent = s.stanceLabel
  errRowLabel.textContent = s.errorRow
  levelLabel.textContent = s.levelLabel
  whatRowLabel.textContent = s.detailRow
  liftLabel.textContent = s.time
  if (!play) playBtn.textContent = s.play
  langSeg.setAttribute('aria-label', s.aria.lang)
  for (const btn of langSeg.querySelectorAll('button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset['v'] === getLang()))
  }
}

// URL 共有は持たないが、デッドリフト版が付ける ?lang= だけは読む
const initial = asLang(new URLSearchParams(location.search).get('lang'))
if (initial) setLang(initial)

langSeg.addEventListener('click', (ev) => {
  const v = asLang((ev.target as HTMLElement).closest('button')?.dataset['v'] ?? null)
  if (!v || v === getLang()) return
  setLang(v as Lang)
  applyLang()
  render()
})

applyLang()
syncLift()
render()
