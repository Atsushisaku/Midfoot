/**
 * エラー提示アプリのプロトタイプ。
 * 要件: docs/error-app-requirements.md
 *
 * 左＝最適フォーム、右＝エラーフォーム。**同一人物**なので体格・スタンスは共有する。
 *
 * UI は**カタログ（頻出エラーの名前）＋ 程度（軽／中／重）だけ**。逸脱パラメータの
 * スライダーは出さない。インストラクターが指すのは「現象」であって、
 * バー位置や腰の先行度といった内部表現ではないため（要件 §7.3）。
 *
 * 数値も**主指標（脚の伸展の使用率）1 本だけ**にしてある。最適とエラーの梃子を並べた表は
 * 「特に何の分析にもならない」ため撤去した（要件 §12.4）。`./metrics` の梃子まわりは
 * モデル層として残してあるが、この画面からは呼んでいない。
 *
 * 描画と幾何は `../deadlift/` のものをそのまま使う。
 * プロトタイプなので日本語のみ・URL 共有なし・dev 専用エントリ。
 */

import { CM_PER_UNIT, solveDlPose, type DlBody, type DlPose } from '../deadlift/geometry'
import { ARM_LEVELS, DL_PRESETS, FOOT, STANCES } from '../deadlift/presets'
import { COLORS, renderScene, type Scene } from '../deadlift/render'
import { CATALOG, LEVEL_LABELS, NO_DEVIATION, type Deviation, type Level } from './catalog'
import { legExtensionUsed } from './metrics'
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
function poseAt(t: number, dev: Deviation): DlPose {
  return solveDlPose({
    body: bodyOf(),
    bar: 'standard',
    stanceDeg: state.stanceDeg,
    hipHeight: 0.5 + dev.hipDelta,
    t,
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
const legUsed = (dev: Deviation, t: number): number =>
  legExtensionUsed(poseAt(0, NO_DEVIATION), poseAt(1, NO_DEVIATION), poseAt(t, dev))

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

function buildSeg(
  buttons: readonly { v: string; label: string }[],
  isOn: (v: string) => boolean,
  onPick: (v: string) => void,
): { seg: HTMLDivElement; sync: () => void } {
  const seg = el('div', 'seg presets')
  seg.setAttribute('role', 'group')
  for (const b of buttons) {
    const btn = el('button', '', b.label)
    btn.dataset['v'] = b.v
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
    for (const btn of seg.querySelectorAll('button')) {
      btn.setAttribute('aria-pressed', String(isOn(btn.dataset['v']!)))
    }
  }
  return { seg, sync }
}

// --- 時間スライダー ＋ 再生 ---------------------------------------------------

const playBtn = el('button', 'playbtn', '▶ 再生')
let play: { start: number } | null = null
const PLAY_MS = 2600

const liftSlider = el('input')
liftSlider.type = 'range'
liftSlider.min = '0'
liftSlider.max = '1'
liftSlider.step = '0.005'
const liftRead = el('span', 'sliderval')

const syncLift = () => {
  liftSlider.value = String(state.lift)
  liftRead.textContent = `${Math.round(state.lift * 100)}%`
}
const stopPlay = () => {
  play = null
  playBtn.textContent = '▶ 再生'
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
    playBtn.textContent = '■ 停止'
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
liftBox.append(el('span', '', '時間'), liftSlider, liftRead)
liftRow.append(playBtn, liftBox)

// --- 体格（共通）-------------------------------------------------------------

const PRESET_LABELS: Record<string, string> = {
  standard: '標準',
  'long-femur': '大腿が長い',
  'long-torso': '体幹が長い',
}
const ARM_LABELS = ['短い', '標準', '長い']
const STANCE_LABELS = ['ナロー', 'ミドル', 'スモウ']

const bodyRow = el('div', 'row')
bodyRow.append(el('strong', 'rowlabel', '体格（両者共通）'))
const presetSeg = buildSeg(
  DL_PRESETS.map((p) => ({ v: p.id, label: PRESET_LABELS[p.id] ?? p.id })),
  (v) => v === state.presetId,
  (v) => {
    state.presetId = v
  },
)
const armSeg = buildSeg(
  ARM_LEVELS.map((m, i) => ({ v: String(m), label: ARM_LABELS[i]! })),
  (v) => Number(v) === state.mArm,
  (v) => {
    state.mArm = Number(v)
  },
)
const stanceSeg = buildSeg(
  STANCES.map((d, i) => ({ v: String(d), label: STANCE_LABELS[i]! })),
  (v) => Number(v) === state.stanceDeg,
  (v) => {
    state.stanceDeg = Number(v)
  },
)
bodyRow.append(presetSeg.seg, el('span', 'rowsub', '腕'), armSeg.seg, stanceSeg.seg)

// --- エラー（カタログ ＋ 程度）------------------------------------------------

const errRow = el('div', 'row')
errRow.append(el('strong', 'rowlabel', 'エラー'))
const errSeg = buildSeg(
  [{ v: '', label: 'なし' }, ...CATALOG.map((e) => ({ v: e.id, label: e.label }))],
  (v) => (v === '' ? state.errorId === null : v === state.errorId),
  (v) => {
    state.errorId = v === '' ? null : v
  },
)
const levelSeg = buildSeg(
  LEVEL_LABELS.map((l, i) => ({ v: String(i), label: l })),
  (v) => Number(v) === state.level,
  (v) => {
    state.level = Number(v) as Level
  },
)
// 「最大乖離点へ飛ぶ」ボタンは置かない。エラーは床を離れた直後にはもう出ていて、
// 乖離が最大になる時点を探すより前に問題は見えているため（2026-08-03 判断）。
const levelLabel = el('span', 'rowsub', '程度')
errRow.append(errSeg.seg, levelLabel, levelSeg.seg)

/**
 * エラー未選択のときの「詳細」。空にすると欄の高さが変わって図が動くので、常に 3 点置く。
 * カタログ側と同じく 3 点に揃えること（要件 §13）。
 */
const NO_ERROR_COMMENT: readonly [string, string, string] = [
  '左右とも模範フォーム',
  '上のボタンでエラーを選ぶと、右側だけがその動きになる',
  '程度（軽度／中等度／重度）も切り替えられる',
]

// 「詳細」は体格・エラーと同じ行の作り（左に見出し、右に中身）にする
const whatRow = el('div', 'row whatrow')
const whatList = el('ul', 'whatlist')
whatRow.append(el('strong', 'rowlabel', '詳細'), whatList)
const legBox = el('div', 'legbox')
panel.append(bodyRow, errRow, whatRow, legBox)

// ---------------------------------------------------------------------------
// 描画
// ---------------------------------------------------------------------------

/**
 * 主指標（要件 §11.1）。「バーの進み」に対して「脚をどこまで使ったか」。
 * ぶっこ抜きは先食い、上体の立てすぎは遅れ、と 1 本で逆向きに出る。
 *
 * エラー未選択でも**空にしない**。空にすると高さが変わって図が動くし、
 * 模範だけの値にも意味がある（要件 §13）。
 */
function renderLeg(hasError: boolean): void {
  const t = state.lift
  const o = legUsed(NO_DEVIATION, t)
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const head = el('span', 'leglabel', `バーが ${pct(t)} 上がった時点で、脚は`)

  if (!hasError) {
    legBox.replaceChildren(head, el('span', 'legnum opt', pct(o)), el('span', 'leglabel', '伸びている'))
    return
  }
  const e = legUsed(currentDev(), t)
  const gap = e - o
  const errNum = el('span', 'legnum err', pct(e))
  if (Math.abs(gap) > 0.08) errNum.classList.add('bad')
  legBox.replaceChildren(
    head,
    el('span', 'legnum opt', pct(o)),
    el('span', 'legsep', '／'),
    errNum,
    el(
      'span',
      'leglabel',
      gap > 0.08 ? '伸びている（脚を使うのが早すぎる）' : gap < -0.08 ? '伸びている（脚が使えていない）' : '伸びている',
    ),
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
  whatList.replaceChildren(...(entry ? entry.what : NO_ERROR_COMMENT).map((line) => el('li', '', line)))
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

syncLift()
render()
