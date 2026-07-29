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
  type Vec,
} from './geometry'
import { ANKLE_LEVELS, DEFAULT_PRESET, PRESETS, RANGES } from './presets'
import { COLORS, renderScene, type Layout, type Scene, type SceneBody } from './render'

/** 補間アニメーションの長さ（§8.1） */
const DUR = 300
/** バーの軌跡のサンプル数（§8.2） */
const TRAIL_N = 9

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

interface State {
  body: Body
  bar: BarPosition
  shoe: Shoe
  p: number
  presetId: string | null
  /** 身体の特徴の表示モード（§6 Rev.10）。URL には保存しない表示上の状態 */
  bodyMode: 'simple' | 'detail'
  /** 固定した体格（§8.5）。null なら単体表示 */
  frozen: Body | null
  layout: Exclude<Layout, 'single'>
}

const state: State = {
  body: { ...DEFAULT_PRESET.body },
  bar: 'high',
  shoe: 'flat',
  p: 1,
  presetId: DEFAULT_PRESET.id,
  bodyMode: 'simple',
  frozen: null,
  // 既定は「並べる」。重ねると2体の脛と足がほぼ完全に重なり、後ろの体は上体しか見えない
  layout: 'side',
}

const tw = {
  barMix: new Tween(0),
  shoeH: new Tween(SHOE_HEEL.flat),
  mShank: new Tween(state.body.mShank),
  mFemur: new Tween(state.body.mFemur),
  mTorso: new Tween(state.body.mTorso),
  foot: new Tween(state.body.foot),
  romDeg: new Tween(state.body.romDeg),
}

/** state.body → tween。dur=0 でスライダー、DUR でプリセット／URL 復元 */
function pushBody(dur: number, now = performance.now()): void {
  tw.mShank.set(state.body.mShank, dur, now)
  tw.mFemur.set(state.body.mFemur, dur, now)
  tw.mTorso.set(state.body.mTorso, dur, now)
  tw.foot.set(state.body.foot, dur, now)
  tw.romDeg.set(state.body.romDeg, dur, now)
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

/**
 * file:// で開いたときは origin が null になり、replaceState が SecurityError を投げる。
 * 単一 HTML をダブルクリックで開く使い方（§10）を壊さないよう、その場合は黙って諦める。
 */
const canWriteUrl = location.protocol !== 'file:'

function writeUrl(): void {
  if (!canWriteUrl) return
  const q = new URLSearchParams()
  q.set('b', state.bar)
  q.set('s', state.shoe)
  q.set('d', String(Math.round(state.p * 100)))
  q.set('m', encodeBody(state.body))
  if (state.frozen) {
    q.set('f', encodeBody(state.frozen))
    q.set('l', state.layout)
  }
  try {
    history.replaceState(null, '', `${location.pathname}?${q}`)
  } catch {
    // 共有 URL が作れないだけで、アプリ本体の動作には影響しない
  }
}

function readUrl(): void {
  const q = new URLSearchParams(location.search)
  if (![...q.keys()].length) return

  const bar = q.get('b')
  if (bar === 'high' || bar === 'low') state.bar = bar

  const shoe = q.get('s')
  if (shoe === 'flat' || shoe === 'running' || shoe === 'lifting') state.shoe = shoe

  // Rev.9 まで存在した「膝の前送り」の u= パラメータは無視する（古い共有リンク互換）

  const d = Number(q.get('d'))
  if (Number.isFinite(d)) state.p = Math.min(1, Math.max(0, d / 100))

  const m = q.get('m')
  const body = m ? decodeBody(m) : null
  if (body) {
    state.body = body
    state.presetId = presetIdFor(body)
  }

  const f = q.get('f')
  const frozen = f ? decodeBody(f) : null
  if (frozen) state.frozen = frozen

  const l = q.get('l')
  if (l === 'overlay' || l === 'side') state.layout = l

  tw.barMix.set(state.bar === 'low' ? 1 : 0, 0, 0)
  tw.shoeH.set(SHOE_HEEL[state.shoe], 0, 0)
  pushBody(0, 0)
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
const readout = $<HTMLDivElement>('#readout')
const bodySimple = $<HTMLDivElement>('#bodySimple')
const bodySliders = $<HTMLDivElement>('#bodySliders')
const freezeBtn = $<HTMLButtonElement>('#freeze')
const layoutSeg = $<HTMLDivElement>('#layout')
const notesPanel = $<HTMLElement>('#notes')
const notesBtn = $<HTMLButtonElement>('#notesBtn')

interface SliderSpec {
  key: string
  label: string
  range: { min: number; max: number; step: number }
  get: () => number
  set: (v: number) => void
}

/**
 * 常時表示は「深さ」だけ（§6 Rev.10）。深さは動作の変数で、身体の特徴ではない。
 * 足首の硬さは身体側へ移した：簡易設定では3段階トグル、詳細設定ではスライダー。
 */
const MAIN_SLIDERS = new Set(['depth'])

/** セグメント比のスライダー。動かすとプリセット選択が外れる（足首は別軸なので外さない） */
const SEGMENT_SLIDERS = new Set(['femur', 'torso', 'shank'])

const SLIDERS: readonly SliderSpec[] = [
  {
    key: 'depth',
    label: '深さ',
    range: RANGES.depth,
    get: () => state.p,
    set: (v) => {
      state.p = v
    },
  },
  {
    key: 'femur',
    label: '大腿',
    range: RANGES.segment,
    get: () => state.body.mFemur,
    set: (v) => {
      state.body = { ...state.body, mFemur: v }
    },
  },
  {
    key: 'torso',
    label: '上体',
    range: RANGES.segment,
    get: () => state.body.mTorso,
    set: (v) => {
      state.body = { ...state.body, mTorso: v }
    },
  },
  {
    key: 'shank',
    label: 'すね',
    range: RANGES.segment,
    get: () => state.body.mShank,
    set: (v) => {
      state.body = { ...state.body, mShank: v }
    },
  },
  {
    key: 'rom',
    label: '足首の硬さ',
    range: RANGES.rom,
    get: () => state.body.romDeg,
    set: (v) => {
      state.body = { ...state.body, romDeg: v }
    },
  },
]

const inputs = new Map<string, HTMLInputElement>()

function buildSliders(): void {
  for (const spec of SLIDERS) {
    const wrap = document.createElement('label')
    wrap.className = 'slider'

    const name = document.createElement('span')
    name.textContent = spec.label

    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(spec.range.min)
    input.max = String(spec.range.max)
    input.step = String(spec.range.step)
    input.value = String(spec.get())
    // ドラッグ中は補間せず即座に追従させる（§8.2）
    input.addEventListener('input', () => {
      spec.set(Number(input.value))
      // セグメント比を手で動かしたときだけプリセット選択を外す。
      // 深さは「使い方」、足首は体型とは独立した軸なので、どちらも選択を維持する
      if (SEGMENT_SLIDERS.has(spec.key)) state.presetId = null
      pushBody(0)
      syncButtons()
      requestFrame()
      scheduleUrl()
    })

    wrap.append(name, input)
    inputs.set(spec.key, input)
    $(MAIN_SLIDERS.has(spec.key) ? '#mainSliders' : '#bodySliders').append(wrap)
  }
}

function buildPresets(): void {
  const host = $<HTMLDivElement>('#presets')
  for (const preset of PRESETS) {
    const btn = document.createElement('button')
    btn.textContent = preset.label
    btn.dataset['v'] = preset.id
    btn.addEventListener('click', () => {
      // プリセットが設定するのはセグメント比だけ。足首は独立したトグルなので保持する（Rev.10）
      state.body = { ...preset.body, romDeg: state.body.romDeg }
      state.presetId = preset.id
      pushBody(DUR)
      syncInputs()
      syncButtons()
      requestFrame()
      scheduleUrl()
    })
    host.append(btn)
  }
}

function buildAnkle(): void {
  const host = $<HTMLDivElement>('#ankle')
  for (const level of ANKLE_LEVELS) {
    const btn = document.createElement('button')
    btn.textContent = level.label
    btn.dataset['v'] = String(level.deg)
    btn.addEventListener('click', () => {
      state.body = { ...state.body, romDeg: level.deg }
      pushBody(DUR)
      syncInputs()
      syncButtons()
      requestFrame()
      scheduleUrl()
    })
    host.append(btn)
  }
}

function wireSegment(sel: string, onPick: (value: string) => void): void {
  $(sel).addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest('button')
    const v = btn?.dataset['v']
    if (v) onPick(v)
  })
}

function syncInputs(): void {
  for (const spec of SLIDERS) {
    const input = inputs.get(spec.key)
    if (input) input.value = String(spec.get())
  }
}

function syncButtons(): void {
  const press = (sel: string, value: string | null) => {
    for (const b of $(sel).querySelectorAll('button')) {
      b.setAttribute('aria-pressed', String(b.dataset['v'] === value))
    }
  }
  press('#bar', state.bar)
  press('#shoe', state.shoe)
  press('#presets', state.presetId)
  // 3段階のどれとも一致しない値（詳細スライダーで設定）のときは、どれも点灯しない
  press('#ankle', String(state.body.romDeg))
  press('#bodyMode', state.bodyMode)
  press('#layout', state.layout)

  bodySimple.hidden = state.bodyMode !== 'simple'
  bodySliders.hidden = state.bodyMode !== 'detail'

  freezeBtn.textContent = state.frozen ? '固定を解除' : '体格を固定'
  freezeBtn.dataset['on'] = String(state.frozen !== null)
  layoutSeg.hidden = state.frozen === null
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

function currentBar(now: number): BarParams {
  const k = tw.barMix.read(now)
  return {
    r: lerp(BAR_PARAMS.high.r, BAR_PARAMS.low.r, k),
    d: lerp(BAR_PARAMS.high.d, BAR_PARAMS.low.d, k),
  }
}

function buildTrail(input: PoseInput): Vec[] {
  const out: Vec[] = []
  for (let i = 0; i < TRAIL_N; i++) {
    const p = (input.p * i) / (TRAIL_N - 1)
    out.push(solvePose({ ...input, p }).bar)
  }
  return out
}

function draw(now: number): void {
  frameHandle = 0

  const shared = {
    bar: currentBar(now),
    shoe: { h: tw.shoeH.read(now) },
    // 足首の可動域は常に使い切る（Rev.9）。図は「その体格・その担ぎ位置での最小前傾」を示す。
    // θ_s = usage × (ROM + φ) なので、θ_s を減らした動きは足首の硬さスライダーで同一に再現できる
    shankUsage: 1,
    p: state.p,
  }

  const liveBody: Body = {
    mShank: tw.mShank.read(now),
    mFemur: tw.mFemur.read(now),
    mTorso: tw.mTorso.read(now),
    foot: tw.foot.read(now),
    romDeg: tw.romDeg.read(now),
  }

  const comparing = state.frozen !== null
  const liveInput: PoseInput = { body: liveBody, ...shared }
  const livePose = solvePose(liveInput)

  const bodies: SceneBody[] = []

  if (state.frozen) {
    // 固定した体格。深さ・背屈・担ぎ位置・靴は共有する（§8.5）
    const frozenInput: PoseInput = { body: state.frozen, ...shared }
    bodies.push({
      pose: solvePose(frozenInput),
      ghost: null,
      trail: [],
      color: COLORS.bodyB,
      label: '固定した体',
      faded: true,
    })
  }

  bodies.push({
    pose: livePose,
    // 立位ゴーストは Rev.10 で廃止（§4.9）。灰色の第2の身体が「比較中」と誤読されるため。
    // バーの軌跡は比較中だけ省く（線が増えすぎる）
    ghost: null,
    trail: comparing ? [] : buildTrail(liveInput),
    color: COLORS.bodyA,
    label: comparing ? '操作中の体' : '',
    faded: false,
  })

  const scene: Scene = {
    layout: comparing ? state.layout : 'single',
    bodies,
    showIpfLine: true,
  }
  renderScene(svg, scene)
  updateReadout(bodies)

  if (Object.values(tw).some((t) => t.animating)) requestFrame()
}

function updateReadout(bodies: readonly SceneBody[]): void {
  readout.replaceChildren(
    ...bodies.map((b) => {
      const item = document.createElement('div')
      item.className = 'item'

      const cap = document.createElement('span')
      cap.className = 'cap'
      cap.textContent = b.label || '上体角度'
      cap.style.color = b.label ? b.color : ''

      const val = document.createElement('span')
      val.className = 'val'
      val.style.color = b.color
      val.textContent = String(Math.round(b.pose.torsoDeg))

      const deg = document.createElement('span')
      deg.className = 'deg'
      deg.textContent = '°'
      val.append(deg)

      item.append(cap, val)
      return item
    }),
  )
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

function init(): void {
  readUrl()
  buildSliders()
  buildPresets()
  buildAnkle()

  wireSegment('#bodyMode', (v) => {
    if (v !== 'simple' && v !== 'detail') return
    state.bodyMode = v
    syncButtons()
  })

  wireSegment('#bar', (v) => {
    if (v !== 'high' && v !== 'low') return
    state.bar = v
    tw.barMix.set(v === 'low' ? 1 : 0, DUR, performance.now())
    syncButtons()
    requestFrame()
    scheduleUrl()
  })

  wireSegment('#shoe', (v) => {
    if (v !== 'flat' && v !== 'running' && v !== 'lifting') return
    state.shoe = v
    tw.shoeH.set(SHOE_HEEL[v], DUR, performance.now())
    syncButtons()
    requestFrame()
    scheduleUrl()
  })

  wireSegment('#layout', (v) => {
    if (v !== 'overlay' && v !== 'side') return
    state.layout = v
    syncButtons()
    requestFrame()
    scheduleUrl()
  })

  freezeBtn.addEventListener('click', () => {
    // 固定するのは体格パラメータだけ（§8.5）
    state.frozen = state.frozen ? null : { ...state.body }
    syncButtons()
    requestFrame()
    scheduleUrl()
  })

  const toggleNotes = (show: boolean) => {
    notesPanel.hidden = !show
    notesBtn.setAttribute('aria-expanded', String(show))
  }
  notesBtn.addEventListener('click', () => toggleNotes(notesPanel.hidden))
  $('#notesClose').addEventListener('click', () => toggleNotes(false))

  syncInputs()
  syncButtons()
  requestFrame()
}

init()

export type { Pose }
