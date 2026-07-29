/**
 * 状態管理・UI・アニメーション。仕様 §6 / §8 / §10
 */

import './style.css'
import {
  BAR_PARAMS,
  SHOE_HEEL,
  solvePose,
  type BarPosition,
  type BarParams,
  type Body,
  type Pose,
  type PoseInput,
  type Shoe,
} from './geometry'
import { ANKLE_LEVELS, DEFAULT_PRESET, PRESETS, RANGES } from './presets'
import { COLORS, renderScene, type Scene, type SceneBody } from './render'
import { asLang, getLang, setLang, t, type Lang } from './i18n'

/** 補間アニメーションの長さ（§8.1） */
const DUR = 300

// ---------------------------------------------------------------------------
// 補間
// ---------------------------------------------------------------------------

const easeInOutQuad = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)

class Tween {
  private value: number
  private from: number
  private to: number
  private start = 0
  private dur = 0

  constructor(v: number) {
    this.value = this.from = this.to = v
  }

  /** dur = 0 なら即時。スライダーのドラッグは即時、ボタンは DUR で補間する */
  set(v: number, dur: number, now: number): void {
    if (v === this.to && this.dur > 0) return
    if (dur <= 0) {
      this.value = this.from = this.to = v
      this.dur = 0
      return
    }
    this.from = this.value
    this.to = v
    this.start = now
    this.dur = dur
  }

  read(now: number): number {
    if (this.dur > 0) {
      const k = Math.min(1, (now - this.start) / this.dur)
      this.value = this.from + (this.to - this.from) * easeInOutQuad(k)
      if (k >= 1) this.dur = 0
    }
    return this.value
  }

  get animating(): boolean {
    return this.dur > 0
  }
}

// ---------------------------------------------------------------------------
// 状態
// ---------------------------------------------------------------------------

/**
 * 1ペイン分の状態（§8.5 Rev.10）。比較モードでは2ペインが独立して
 * 体格・担ぎ位置・靴を持つ。共有するのは深さ p だけ。
 */
interface PaneState {
  body: Body
  bar: BarPosition
  shoe: Shoe
  presetId: string | null
  /** 身体の特徴の表示モード（§6 Rev.10）。URL には保存しない表示上の状態 */
  bodyMode: 'simple' | 'detail'
}

interface State {
  panes: [PaneState, PaneState]
  comparing: boolean
  p: number
}

const defaultPane = (): PaneState => ({
  body: { ...DEFAULT_PRESET.body },
  bar: 'high',
  shoe: 'flat',
  presetId: DEFAULT_PRESET.id,
  bodyMode: 'simple',
})

const state: State = {
  panes: [defaultPane(), defaultPane()],
  comparing: false,
  p: 1,
}

interface PaneTweens {
  barMix: Tween
  shoeH: Tween
  mShank: Tween
  mFemur: Tween
  mTorso: Tween
  foot: Tween
  romDeg: Tween
}

const makeTweens = (s: PaneState): PaneTweens => ({
  barMix: new Tween(s.bar === 'low' ? 1 : 0),
  shoeH: new Tween(SHOE_HEEL[s.shoe]),
  mShank: new Tween(s.body.mShank),
  mFemur: new Tween(s.body.mFemur),
  mTorso: new Tween(s.body.mTorso),
  foot: new Tween(s.body.foot),
  romDeg: new Tween(s.body.romDeg),
})

const tweens: [PaneTweens, PaneTweens] = [makeTweens(state.panes[0]), makeTweens(state.panes[1])]

/** panes[i].body → tween。dur=0 でスライダー、DUR でプリセット／URL 復元 */
function pushBody(i: 0 | 1, dur: number, now = performance.now()): void {
  const s = state.panes[i]
  const t = tweens[i]
  t.mShank.set(s.body.mShank, dur, now)
  t.mFemur.set(s.body.mFemur, dur, now)
  t.mTorso.set(s.body.mTorso, dur, now)
  t.foot.set(s.body.foot, dur, now)
  t.romDeg.set(s.body.romDeg, dur, now)
}

/** バー・靴も含めてペイン全体を tween に反映する（URL 復元・比較開始時のコピー用） */
function pushPane(i: 0 | 1, dur: number, now = performance.now()): void {
  const s = state.panes[i]
  const t = tweens[i]
  t.barMix.set(s.bar === 'low' ? 1 : 0, dur, now)
  t.shoeH.set(SHOE_HEEL[s.shoe], dur, now)
  pushBody(i, dur, now)
}

// ---------------------------------------------------------------------------
// URL 共有（§10）
// ---------------------------------------------------------------------------

const encodeBody = (b: Body) =>
  [b.mShank, b.mFemur, b.mTorso, b.foot, b.romDeg].map((n) => Math.round(n * 100)).join('.')

/**
 * プリセット判定はセグメント比だけで行い、足首（romDeg）は見ない（Rev.10）。
 * 足首の硬さは簡易設定でも独立したトグルなので、体型の一致とは別の軸。
 */
const sameSegments = (a: Body, b: Body) =>
  a.mShank === b.mShank && a.mFemur === b.mFemur && a.mTorso === b.mTorso

const presetIdFor = (body: Body): string | null =>
  PRESETS.find((p) => sameSegments(p.body, body))?.id ?? null

function decodeBody(s: string): Body | null {
  const n = s.split('.').map(Number)
  if (n.length !== 5 || n.some((v) => !Number.isFinite(v))) return null
  return {
    mShank: n[0]! / 100,
    mFemur: n[1]! / 100,
    mTorso: n[2]! / 100,
    foot: n[3]! / 100,
    romDeg: n[4]! / 100,
  }
}

const asBar = (v: string | null): BarPosition | null => (v === 'high' || v === 'low' ? v : null)

const asShoe = (v: string | null): Shoe | null =>
  v === 'flat' || v === 'running' || v === 'lifting' ? v : null

/**
 * file:// で開いたときは origin が null になり、replaceState が SecurityError を投げる。
 * 単一 HTML をダブルクリックで開く使い方（§10）を壊さないよう、その場合は黙って諦める。
 */
const canWriteUrl = location.protocol !== 'file:'

function writeUrl(): void {
  if (!canWriteUrl) return
  const q = new URLSearchParams()
  const [a, b] = state.panes
  q.set('b', a.bar)
  q.set('s', a.shoe)
  q.set('d', String(Math.round(state.p * 100)))
  q.set('m', encodeBody(a.body))
  if (state.comparing) {
    q.set('f', encodeBody(b.body))
    q.set('b2', b.bar)
    q.set('s2', b.shoe)
  }
  // 既定（日本語）のときは付けない。英語のリンクだけ ?lang=en で共有できる
  if (getLang() !== 'ja') q.set('lang', getLang())
  try {
    history.replaceState(null, '', `${location.pathname}?${q}`)
  } catch {
    // 共有 URL が作れないだけで、アプリ本体の動作には影響しない
  }
}

function readUrl(): void {
  const q = new URLSearchParams(location.search)
  if (![...q.keys()].length) return

  // 自動判定はしない（§10.1）。指定が無ければ日本語のまま
  const lang = asLang(q.get('lang'))
  if (lang) setLang(lang)

  const [a, b] = state.panes

  const bar = asBar(q.get('b'))
  if (bar) a.bar = bar

  const shoe = asShoe(q.get('s'))
  if (shoe) a.shoe = shoe

  // Rev.9 まで存在した「膝の前送り」の u= パラメータは無視する（古い共有リンク互換）
  // Rev.10 まで存在した比較レイアウトの l= パラメータも同様に無視する

  // has() で確かめてから読む。Number(null) は 0 なので、d の無いリンク
  // （?lang=en だけを手で共有した場合など）で深さが立位に落ちてしまう
  const d = Number(q.get('d'))
  if (q.has('d') && Number.isFinite(d)) state.p = Math.min(1, Math.max(0, d / 100))

  const m = q.get('m')
  const bodyA = m ? decodeBody(m) : null
  if (bodyA) {
    a.body = bodyA
    a.presetId = presetIdFor(bodyA)
  }

  const f = q.get('f')
  const bodyB = f ? decodeBody(f) : null
  if (bodyB) {
    state.comparing = true
    b.body = bodyB
    b.presetId = presetIdFor(bodyB)
    // b2/s2 の無い旧リンク（担ぎ・靴を強制共有していた頃）はペインAと同じにする
    b.bar = asBar(q.get('b2')) ?? a.bar
    b.shoe = asShoe(q.get('s2')) ?? a.shoe
  }

  pushPane(0, 0, 0)
  pushPane(1, 0, 0)
}

// ---------------------------------------------------------------------------
// DOM
// ---------------------------------------------------------------------------

const $ = <T extends Element>(sel: string): T => {
  const node = document.querySelector<T>(sel)
  if (!node) throw new Error(`missing element: ${sel}`)
  return node
}

const svg = $<SVGSVGElement>('#fig')
const panesHost = $<HTMLDivElement>('#panes')
const depthRow = $<HTMLDivElement>('#depthRow')
const compareBtn = $<HTMLButtonElement>('#compareBtn')
const notesPanel = $<HTMLElement>('#notes')
const notesBtn = $<HTMLButtonElement>('#notesBtn')
const notesList = $<HTMLUListElement>('#notesList')
const notesClose = $<HTMLButtonElement>('#notesClose')
const langSeg = $<HTMLDivElement>('#lang')

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

interface PaneSliderSpec {
  key: 'femur' | 'torso' | 'shank' | 'rom'
  range: { min: number; max: number; step: number }
  get: (b: Body) => number
  set: (b: Body, v: number) => Body
}

const PANE_SLIDERS: readonly PaneSliderSpec[] = [
  { key: 'femur', range: RANGES.segment, get: (b) => b.mFemur, set: (b, v) => ({ ...b, mFemur: v }) },
  { key: 'torso', range: RANGES.segment, get: (b) => b.mTorso, set: (b, v) => ({ ...b, mTorso: v }) },
  { key: 'shank', range: RANGES.segment, get: (b) => b.mShank, set: (b, v) => ({ ...b, mShank: v }) },
  { key: 'rom', range: RANGES.rom, get: (b) => b.romDeg, set: (b, v) => ({ ...b, romDeg: v }) },
]

/** セグメント比のスライダー。動かすとプリセット選択が外れる（足首は別軸なので外さない） */
const SEGMENT_SLIDERS = new Set(['femur', 'torso', 'shank'])

interface PaneUI {
  root: HTMLDivElement
  modeSeg: HTMLDivElement
  presetSeg: HTMLDivElement
  ankleSeg: HTMLDivElement
  barSeg: HTMLDivElement
  shoeSeg: HTMLDivElement
  simpleRow: HTMLDivElement
  slidersRow: HTMLDivElement
  inputs: Map<string, HTMLInputElement>
}

function buildSlider(
  host: HTMLElement,
  label: string,
  range: { min: number; max: number; step: number },
  value: number,
  onInput: (v: number) => void,
): HTMLInputElement {
  const wrap = el('label', 'slider')
  wrap.append(el('span', '', label))
  const input = el('input')
  input.type = 'range'
  input.min = String(range.min)
  input.max = String(range.max)
  input.step = String(range.step)
  input.value = String(value)
  // ドラッグ中は補間せず即座に追従させる（§8.2）
  input.addEventListener('input', () => onInput(Number(input.value)))
  wrap.append(input)
  host.append(wrap)
  return input
}

function buildSeg(
  className: string,
  ariaLabel: string,
  buttons: readonly { v: string; label: string; sub?: string }[],
  onPick: (v: string) => void,
): HTMLDivElement {
  const seg = el('div', `seg ${className}`)
  seg.setAttribute('role', 'group')
  seg.setAttribute('aria-label', ariaLabel)
  for (const spec of buttons) {
    const btn = el('button', '', spec.label)
    btn.dataset['v'] = spec.v
    if (spec.sub) btn.append(el('small', '', spec.sub))
    seg.append(btn)
  }
  seg.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('button')
    const v = btn?.dataset['v']
    if (v) onPick(v)
  })
  return seg
}

function buildPane(i: 0 | 1): PaneUI {
  const s = state.panes[i]
  const root = el('div', i === 0 ? 'pane' : 'pane pane-b')

  // --- 身体の特徴（簡易｜詳細） ---
  const modeSeg = buildSeg('mode', t().aria.settingMode, [
    { v: 'simple', label: t().simple },
    { v: 'detail', label: t().detail },
  ], (v) => {
    if (v !== 'simple' && v !== 'detail') return
    s.bodyMode = v
    sync()
  })

  const presetSeg = buildSeg('presets', t().aria.bodyPreset,
    PRESETS.map((p) => ({ v: p.id, label: t().presets[p.id] ?? p.id })),
    (v) => {
      const preset = PRESETS.find((p) => p.id === v)
      if (!preset) return
      // プリセットが設定するのはセグメント比だけ。足首は独立したトグルなので保持する（Rev.10）
      s.body = { ...preset.body, romDeg: s.body.romDeg }
      s.presetId = preset.id
      pushBody(i, DUR)
      sync()
      requestFrame()
      scheduleUrl()
    })

  const ankleSeg = buildSeg('presets', t().aria.ankle,
    ANKLE_LEVELS.map((deg) => ({ v: String(deg), label: t().ankleLevels[deg] ?? String(deg) })),
    (v) => {
      s.body = { ...s.body, romDeg: Number(v) }
      pushBody(i, DUR)
      sync()
      requestFrame()
      scheduleUrl()
    })

  const labeled = el('div', 'labeled-seg')
  labeled.append(el('span', 'seg-label', t().ankle), ankleSeg)

  // 見出し（カテゴリ名＋簡易／詳細）と設定そのものは段を分ける（Rev.11）
  const simpleRow = el('div', 'row row-buttons')
  simpleRow.append(presetSeg, labeled)

  const head = el('div', 'row row-buttons')
  head.append(el('span', 'section-label', t().bodySection), modeSeg)

  const slidersRow = el('div', 'row sliders')
  slidersRow.hidden = true
  const inputs = new Map<string, HTMLInputElement>()
  for (const spec of PANE_SLIDERS) {
    const input = buildSlider(slidersRow, t()[spec.key], spec.range, spec.get(s.body), (v) => {
      s.body = spec.set(s.body, v)
      // セグメント比を手で動かしたときだけプリセット選択を外す。足首は独立した軸なので維持する
      if (SEGMENT_SLIDERS.has(spec.key)) s.presetId = null
      pushBody(i, 0)
      sync()
      requestFrame()
      scheduleUrl()
    })
    inputs.set(spec.key, input)
  }

  const bodySection = el('div', 'body-section')
  bodySection.append(head, simpleRow, slidersRow)

  // --- 道具：担ぎ位置・シューズ ---
  const barSeg = buildSeg('', t().aria.barPosition, [
    { v: 'high', label: t().highBar },
    { v: 'low', label: t().lowBar },
  ], (v) => {
    const bar = asBar(v)
    if (!bar) return
    s.bar = bar
    tweens[i].barMix.set(bar === 'low' ? 1 : 0, DUR, performance.now())
    sync()
    requestFrame()
    scheduleUrl()
  })

  const shoeSeg = buildSeg('shoe', t().aria.shoes, [
    { v: 'flat', label: t().flat },
    { v: 'running', label: t().sneaker, sub: '(10mm)' },
    { v: 'lifting', label: t().lifting, sub: '(25mm)' },
  ], (v) => {
    const shoe = asShoe(v)
    if (!shoe) return
    s.shoe = shoe
    tweens[i].shoeH.set(SHOE_HEEL[shoe], DUR, performance.now())
    sync()
    requestFrame()
    scheduleUrl()
  })

  // 身体側と同じ「見出しの段 → 設定の段」の形にそろえる（Rev.11）
  const toolHead = el('div', 'row row-buttons')
  toolHead.append(el('span', 'section-label', t().toolSection))

  const toolRow = el('div', 'row row-buttons')
  toolRow.append(barSeg, shoeSeg)

  const toolSection = el('div', 'tool-section')
  toolSection.append(toolHead, toolRow)

  root.append(bodySection, toolSection)
  panesHost.append(root)

  return { root, modeSeg, presetSeg, ankleSeg, barSeg, shoeSeg, simpleRow, slidersRow, inputs }
}

let panes: [PaneUI, PaneUI]
let depthInput: HTMLInputElement
let playBtn: HTMLButtonElement

// ---------------------------------------------------------------------------
// 自動再生（§8.2）：立位↔ボトムを、両端で一瞬止めながら往復し続ける
// ---------------------------------------------------------------------------

/** 片道の所要時間（p の全域ぶん。途中から始まる区間は距離に比例して短くなる） */
const PLAY_MOVE = 1200
/** 立位・ボトムでの静止時間 */
const PLAY_HOLD = 300

type PlaySeg = 'down' | 'holdBottom' | 'up' | 'holdTop'

interface Play {
  seg: PlaySeg
  from: number
  start: number
  dur: number
}

let play: Play | null = null

const PLAY_NEXT: Record<PlaySeg, PlaySeg> = {
  down: 'holdBottom',
  holdBottom: 'up',
  up: 'holdTop',
  holdTop: 'down',
}

const playTarget = (seg: PlaySeg): number => (seg === 'down' || seg === 'holdBottom' ? 1 : 0)

function makeSeg(seg: PlaySeg, from: number, start: number): Play {
  const dur =
    seg === 'down' ? PLAY_MOVE * (1 - from) : seg === 'up' ? PLAY_MOVE * from : PLAY_HOLD
  return { seg, from, start, dur }
}

/** 再生中は毎フレーム p を進める。区間の継ぎ目は start を積み上げてリズムを保つ */
function stepPlay(now: number): void {
  if (!play) return
  while (now - play.start >= play.dur) {
    play = makeSeg(PLAY_NEXT[play.seg], playTarget(play.seg), play.start + play.dur)
  }
  const to = playTarget(play.seg)
  const k = play.dur > 0 ? Math.min(1, (now - play.start) / play.dur) : 1
  state.p = play.from + (to - play.from) * easeInOutQuad(k)
  depthInput.value = String(state.p)
}

function syncPlayBtn(): void {
  const on = play !== null
  playBtn.textContent = on ? t().stop : t().play
  playBtn.dataset['on'] = String(on)
  playBtn.setAttribute('aria-pressed', String(on))
}

function setPlaying(on: boolean): void {
  // 現在の深さから連続的に動き出す（立位寄りなら下降から、ボトム寄りなら上昇から）
  play = on ? makeSeg(state.p < 0.5 ? 'down' : 'up', state.p, performance.now()) : null
  syncPlayBtn()
  if (!on) scheduleUrl()
  requestFrame()
}

function press(seg: HTMLElement, value: string | null): void {
  for (const b of seg.querySelectorAll('button')) {
    b.setAttribute('aria-pressed', String(b.dataset['v'] === value))
  }
}

/** state → DOM（ボタンの点灯・スライダー位置・表示切替）を一括同期 */
function sync(): void {
  for (const i of [0, 1] as const) {
    const s = state.panes[i]
    const ui = panes[i]
    press(ui.barSeg, s.bar)
    press(ui.shoeSeg, s.shoe)
    press(ui.presetSeg, s.presetId)
    // 3段階のどれとも一致しない値（詳細スライダーで設定）のときは、どれも点灯しない
    press(ui.ankleSeg, String(s.body.romDeg))
    press(ui.modeSeg, s.bodyMode)
    ui.simpleRow.hidden = s.bodyMode !== 'simple'
    ui.slidersRow.hidden = s.bodyMode !== 'detail'
    for (const spec of PANE_SLIDERS) {
      const input = ui.inputs.get(spec.key)
      if (input) input.value = String(spec.get(s.body))
    }
  }
  panes[1].root.hidden = !state.comparing
  compareBtn.setAttribute('aria-pressed', String(state.comparing))
  compareBtn.dataset['on'] = String(state.comparing)
  depthInput.value = String(state.p)
  press(langSeg, getLang())
}

/**
 * 言語切替（§10.1）。文言は生成時に埋め込まれるので、ペインと深さ行は作り直す。
 * 状態（state）は DOM と独立なので、作り直しても選択内容は保たれる。
 */
function applyLang(): void {
  const s = t()
  document.documentElement.lang = getLang()
  document.title = s.title
  compareBtn.textContent = s.compare
  notesBtn.textContent = s.notes
  notesClose.setAttribute('aria-label', s.close)
  langSeg.setAttribute('aria-label', s.aria.lang)

  notesList.replaceChildren(
    ...s.notesList.map((html) => {
      const li = document.createElement('li')
      // <strong> を効かせるため。文言は自前の定数で、外部入力は混ざらない
      li.innerHTML = html
      return li
    }),
  )

  panesHost.replaceChildren()
  depthRow.replaceChildren()
  panes = [buildPane(0), buildPane(1)]
  buildDepthRow()
  sync()
}

// ---------------------------------------------------------------------------
// 描画ループ
// ---------------------------------------------------------------------------

let frameHandle = 0

function requestFrame(): void {
  if (frameHandle) return
  frameHandle = requestAnimationFrame(draw)
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

function currentBar(t: PaneTweens, now: number): BarParams {
  const k = t.barMix.read(now)
  return {
    r: lerp(BAR_PARAMS.high.r, BAR_PARAMS.low.r, k),
    d: lerp(BAR_PARAMS.high.d, BAR_PARAMS.low.d, k),
  }
}

function draw(now: number): void {
  frameHandle = 0
  stepPlay(now)

  const visible: readonly (0 | 1)[] = state.comparing ? [0, 1] : [0]
  const bodies: SceneBody[] = []

  for (const i of visible) {
    const t = tweens[i]
    const input: PoseInput = {
      body: {
        mShank: t.mShank.read(now),
        mFemur: t.mFemur.read(now),
        mTorso: t.mTorso.read(now),
        foot: t.foot.read(now),
        romDeg: t.romDeg.read(now),
      },
      bar: currentBar(t, now),
      shoe: { h: t.shoeH.read(now) },
      // 足首の可動域は常に使い切る（Rev.9）。図は「その体格・その担ぎ位置での最小前傾」を示す。
      // θ_s = usage × (ROM + φ) なので、θ_s を減らした動きは足首の硬さスライダーで同一に再現できる
      shankUsage: 1,
      p: state.p,
    }
    bodies.push({
      pose: solvePose(input),
      // 立位ゴーストとバーの軌跡は Rev.10 で廃止（§4.9 / §8.2）。
      // どちらも本体以外の描き込みが「もう1人いる」等の誤読を生むため
      ghost: null,
      trail: [],
      color: i === 0 ? COLORS.bodyA : COLORS.bodyB,
      faded: false,
    })
  }

  const scene: Scene = {
    // 比較は「並べる」のみ（Rev.10 で「重ねる」トグルを削除。§8.5）。
    // ペインの並び（左=A/青、右=B/コーラル）と図の並びを一致させる
    layout: state.comparing ? 'side' : 'single',
    bodies,
    showIpfLine: true,
  }
  renderScene(svg, scene)

  const animating = tweens.some((t) => Object.values(t).some((tw: Tween) => tw.animating))
  if (animating || play) requestFrame()
}

// ---------------------------------------------------------------------------
// URL の書き出しは連打を潰す
// ---------------------------------------------------------------------------

let urlTimer = 0
function scheduleUrl(): void {
  clearTimeout(urlTimer)
  urlTimer = window.setTimeout(writeUrl, 250)
}

// ---------------------------------------------------------------------------
// 起動
// ---------------------------------------------------------------------------

function buildDepthRow(): void {
  playBtn = el('button', 'playbtn')
  playBtn.addEventListener('click', () => setPlaying(!play))
  depthRow.append(playBtn)
  syncPlayBtn()

  depthInput = buildSlider(depthRow, t().depth, RANGES.depth, state.p, (v) => {
    // 手でドラッグしたら自動再生は止める
    if (play) setPlaying(false)
    state.p = v
    requestFrame()
    scheduleUrl()
  })
}

function init(): void {
  readUrl()
  applyLang()

  langSeg.addEventListener('click', (ev) => {
    const v = asLang((ev.target as HTMLElement).closest('button')?.dataset['v'] ?? null)
    if (!v || v === getLang()) return
    setLang(v as Lang)
    applyLang()
    requestFrame()
    scheduleUrl()
  })

  compareBtn.addEventListener('click', () => {
    state.comparing = !state.comparing
    if (state.comparing) {
      // 比較開始時はペインBをペインAの完全なコピーとして始める（§8.5）。
      // 「同じ状態から片方だけ変える」という比較の起点を毎回そろえるため。
      // ペインUIの閉包が state.panes[1] を参照し続けるので、差し替えではなく上書きする
      const a = state.panes[0]
      Object.assign(state.panes[1], { ...a, body: { ...a.body } })
      pushPane(1, 0)
    }
    sync()
    requestFrame()
    scheduleUrl()
  })

  const toggleNotes = (show: boolean) => {
    notesPanel.hidden = !show
    notesBtn.setAttribute('aria-expanded', String(show))
  }
  notesBtn.addEventListener('click', () => toggleNotes(notesPanel.hidden))
  notesClose.addEventListener('click', () => toggleNotes(false))

  requestFrame()
}

init()

export type { Pose }
