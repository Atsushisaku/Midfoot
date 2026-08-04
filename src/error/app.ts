/**
 * デッドリフトのエラー例。
 * 要件: docs/error-app-requirements.md
 *
 * 左＝最適フォーム、右＝エラーフォーム。**同一人物**なので体格・スタンスは共有する。
 *
 * UI は**カタログ（エラー名）＋ 程度（軽／中／重）だけ**。逸脱パラメータの
 * スライダーは出さない。インストラクターが指すのは「現象」であって、
 * バー位置や腰の先行度といった内部表現ではないため（要件 §7.3）。
 *
 * 数値も**主指標（脚の伸展の使用率）1 本だけ**にしてある。最適とエラーの梃子を並べた表は
 * 「特に何の分析にもならない」ため撤去した（要件 §12.4）。`./metrics` の梃子まわりは
 * モデル層として残してあるが、この画面からは呼んでいない。
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
import { CATALOG, NO_DEVIATION, type Deviation, type Level } from './catalog'
import { legExtensionUsed } from './metrics'
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
}

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
 * 脚の伸展の使用率（要件 §11.1）。物差しは**両者とも最適フォームの可動範囲**で取る。
 * エラー側の範囲で正規化すると、深く構えるエラーは範囲ごと広がって差が消える。
 */
const legUsed = (dev: Deviation, lift: number): number =>
  legExtensionUsed(poseAt(0, NO_DEVIATION), poseAt(1, NO_DEVIATION), poseAt(lift, dev))

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
const backLink = $<HTMLAnchorElement>('#backLink')

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
const armRowLabel = el('span', 'rowsub')
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
bodyRow.append(bodyRowLabel, presetSeg.seg, armRowLabel, armSeg.seg, stanceSeg.seg)

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
errRow.append(errRowLabel, errSeg.seg, levelLabel, levelSeg.seg)

// 「詳細」は体格・エラーと同じ行の作り（左に見出し、右に中身）にする
const whatRow = el('div', 'row whatrow')
const whatRowLabel = el('strong', 'rowlabel')
const whatList = el('ul', 'whatlist')
whatRow.append(whatRowLabel, whatList)

const legBox = el('div', 'legbox')
panel.append(bodyRow, errRow, whatRow, legBox)

// ---------------------------------------------------------------------------
// 描画
// ---------------------------------------------------------------------------

/**
 * 主指標（要件 §11.1）。「バーの進み」に対して「脚をどこまで伸ばしたか」。
 * ぶっこ抜きは先食い、上体の立てすぎは遅れ、と 1 本で逆向きに出る。
 *
 * エラー未選択でも**空にしない**。空にすると高さが変わって図が動くし、
 * 模範だけの値にも意味がある（要件 §13）。
 */
function renderLeg(hasError: boolean): void {
  const s = t()
  const now = state.lift
  const o = legUsed(NO_DEVIATION, now)
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const head = el('span', 'leglabel', s.legLead(pct(now)))

  if (!hasError) {
    legBox.replaceChildren(head, el('span', 'legnum opt', pct(o)), el('span', 'leglabel', s.legTail))
    return
  }
  const e = legUsed(currentDev(), now)
  const gap = e - o
  const errNum = el('span', 'legnum err', pct(e))
  if (Math.abs(gap) > 0.08) errNum.classList.add('bad')
  legBox.replaceChildren(
    head,
    el('span', 'legnum opt', pct(o)),
    el('span', 'legsep', '／'),
    errNum,
    el('span', 'leglabel', gap > 0.08 ? s.legEarly : gap < -0.08 ? s.legLate : s.legTail),
  )
}

function render(): void {
  const opt = poseAt(state.lift, NO_DEVIATION)
  const err = poseAt(state.lift, currentDev())
  const scene: Scene = {
    layout: 'side',
    bodies: [
      { pose: opt, color: COLORS.bodyA, stanceDeg: state.stanceDeg },
      { pose: err, color: COLORS.bodyB, stanceDeg: state.stanceDeg },
    ],
  }
  renderScene(svg, scene)

  // 要素は消さない。消すと下の段の高さが変わって**図まで動く**ので、
  // 説明も指標も常に置いたままにして中身だけ差し替える（要件 §13）。
  // 程度は選べないだけにして、場所は残す。
  const entry = currentEntry()
  const comment = entry ? (t().errors[entry.id]?.what ?? t().noneComment) : t().noneComment
  whatList.replaceChildren(...comment.map((line) => el('li', '', line)))
  whatRow.classList.toggle('muted', entry === null)
  levelSeg.seg.classList.toggle('is-off', entry === null)
  levelLabel.classList.toggle('is-off', entry === null)
  renderLeg(entry !== null)

  presetSeg.sync()
  armSeg.sync()
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
  backLink.textContent = s.backLink
  // 戻り先でも言語を保つ（既定の ja は付けない。他の 2 ページと同じ規約）
  backLink.href = getLang() === 'ja' ? 'deadlift.html' : `deadlift.html?lang=${getLang()}`
  bodyRowLabel.textContent = s.bodyRow
  armRowLabel.textContent = s.armLabel
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
