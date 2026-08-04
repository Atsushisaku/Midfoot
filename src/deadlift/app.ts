/**
 * デッドリフト版の状態管理・UI・アニメーション。
 * 仕様 docs/deadlift-proto-spec.md §8。構造はスクワット版 `../app.ts` を踏襲。
 *
 * スクワット版から落としたもの: URL 共有（readUrl/writeUrl）。プロトタイプの範囲外
 * （仕様 §0）なので、状態は起動時の既定値から始まる。
 * 日英切替は Rev.8 で入れた（`./strings` がスクワット版 i18n と同じ API を持つ）。
 */

import '../style.css'
import { solveDlPose, type DlBody, type DlPoseInput } from './geometry'
import {
  ARM_LEVELS,
  DEFAULT_DL_PRESET,
  DL_PRESETS,
  DL_RANGES,
  FOOT,
  STANCES,
} from './presets'
import { COLORS, renderScene, type Scene, type SceneBody } from './render'
import { asLang, getLang, setLang, t, type Lang } from './strings'

/** 補間アニメーションの長さ（スクワット版 §8.1 と同じ） */
const DUR = 300

/**
 * バーセッティングは UI から外した（Rev.2-1）ので、常に標準プレート（22.5cm）を渡す。
 * ソルバ側の API とテストは温存されているので、必要になれば UI を戻すだけで復活する。
 */
const BAR = 'standard' as const

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
 * 1ペイン分の状態。比較モードでは2ペインが独立して体格・スタンス・腕・腰の高さを
 * 持つ。共有するのは挙上の進行度 lift だけ（仕様 §8）。
 */
interface PaneState {
  body: DlBody
  stanceDeg: number
  presetId: string | null
  /** 身体的特徴の表示モード。表示上の状態なので幾何には影響しない */
  bodyMode: 'simple' | 'detail'
  /** セッティングの表示モード（Rev.7）。身体的特徴側とは独立に切り替える */
  setupMode: 'simple' | 'detail'
}

interface State {
  panes: [PaneState, PaneState]
  comparing: boolean
  /** 挙上の進行度 0（床）〜1（ロックアウト）。solveDlPose の t に渡す */
  lift: number
}

const defaultPane = (): PaneState => ({
  body: { ...DEFAULT_DL_PRESET.body },
  // 既定は α=0（ナロー）。仕様 §4 の検算表が基準にしている状態と初期表示をそろえる
  stanceDeg: 0,
  presetId: DEFAULT_DL_PRESET.id,
  bodyMode: 'simple',
  setupMode: 'simple',
})

const state: State = {
  panes: [defaultPane(), defaultPane()],
  comparing: false,
  lift: 0,
}

interface PaneTweens {
  mShank: Tween
  mFemur: Tween
  mTorso: Tween
  mArm: Tween
  stanceDeg: Tween
}

const makeTweens = (s: PaneState): PaneTweens => ({
  mShank: new Tween(s.body.mShank),
  mFemur: new Tween(s.body.mFemur),
  mTorso: new Tween(s.body.mTorso),
  mArm: new Tween(s.body.mArm),
  stanceDeg: new Tween(s.stanceDeg),
})

const tweens: [PaneTweens, PaneTweens] = [makeTweens(state.panes[0]), makeTweens(state.panes[1])]

/** panes[i].body → tween。dur=0 でスライダー、DUR でプリセット */
function pushBody(i: 0 | 1, dur: number, now = performance.now()): void {
  const s = state.panes[i]
  const tw = tweens[i]
  tw.mShank.set(s.body.mShank, dur, now)
  tw.mFemur.set(s.body.mFemur, dur, now)
  tw.mTorso.set(s.body.mTorso, dur, now)
  tw.mArm.set(s.body.mArm, dur, now)
}

/** スタンス・腰の高さ・身体重心も含めてペイン全体を tween に反映する（比較開始時のコピー用） */
function pushPane(i: 0 | 1, dur: number, now = performance.now()): void {
  const s = state.panes[i]
  const tw = tweens[i]
  tw.stanceDeg.set(s.stanceDeg, dur, now)
  pushBody(i, dur, now)
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
const liftRow = $<HTMLDivElement>('#liftRow')
const compareBtn = $<HTMLButtonElement>('#compareBtn')
const notesPanel = $<HTMLElement>('#notes')
const notesBtn = $<HTMLButtonElement>('#notesBtn')
const notesList = $<HTMLUListElement>('#notesList')
const notesClose = $<HTMLButtonElement>('#notesClose')
const langSeg = $<HTMLDivElement>('#lang')
const navEl = $<HTMLElement>('#nav')
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

const errLink = $<HTMLAnchorElement>('#errLink')

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
  key: 'femur' | 'torso' | 'shank' | 'arm'
  range: { min: number; max: number; step: number }
  get: (b: DlBody) => number
  set: (b: DlBody, v: number) => DlBody
}

const PANE_SLIDERS: readonly PaneSliderSpec[] = [
  { key: 'femur', range: DL_RANGES.segment, get: (b) => b.mFemur, set: (b, v) => ({ ...b, mFemur: v }) },
  { key: 'torso', range: DL_RANGES.segment, get: (b) => b.mTorso, set: (b, v) => ({ ...b, mTorso: v }) },
  { key: 'shank', range: DL_RANGES.segment, get: (b) => b.mShank, set: (b, v) => ({ ...b, mShank: v }) },
  { key: 'arm', range: DL_RANGES.arm, get: (b) => b.mArm, set: (b, v) => ({ ...b, mArm: v }) },
]

/**
 * セグメント比のスライダー。動かすと体型プリセットの選択が外れる。
 * 腕は Rev.2-2 で独立入力になった（3択ボタンを持つ別の軸）ので、外さない。
 * スクワット版の「セグメント比 ⇔ 足首」の切り分けと同じ。
 */
const SEGMENT_SLIDERS = new Set(['femur', 'torso', 'shank'])

interface PaneUI {
  root: HTMLDivElement
  modeSeg: HTMLDivElement
  presetSeg: HTMLDivElement
  armSeg: HTMLDivElement
  stanceSeg: HTMLDivElement
  simpleRow: HTMLDivElement
  slidersRow: HTMLDivElement
  /** セッティングの簡易/詳細（Rev.7） */
  setupModeSeg: HTMLDivElement
  setupSimpleRow: HTMLDivElement
  setupSlidersRow: HTMLDivElement
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
  // ドラッグ中は補間せず即座に追従させる
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

  // --- 身体的特徴（簡易｜詳細）---
  const modeSeg = buildSeg('mode', t().aria.bodyMode, [
    { v: 'simple', label: t().simple },
    { v: 'detail', label: t().detail },
  ], (v) => {
    if (v !== 'simple' && v !== 'detail') return
    s.bodyMode = v
    sync()
  })

  const presetSeg = buildSeg('presets', t().aria.bodyPreset,
    DL_PRESETS.map((p) => ({ v: p.id, label: t().presets[p.id] ?? p.id })),
    (v) => {
      const preset = DL_PRESETS.find((p) => p.id === v)
      if (!preset) return
      // 腕は体型プリセットから独立した軸（Rev.2-2）なので、プリセットを選んでも
      // 今の腕の長さを保つ。プリセットが動かすのは脛・大腿・体幹の比だけ
      s.body = { ...preset.body, mArm: s.body.mArm }
      s.presetId = preset.id
      pushBody(i, DUR)
      sync()
      requestFrame()
    })

  // 腕は体型プリセットから独立した軸（Rev.2-2）。簡易では3択、詳細では mArm スライダー
  const armSeg = buildSeg('presets', t().aria.armLevel,
    ARM_LEVELS.map((m) => ({ v: String(m), label: t().armLevels[m] ?? String(m) })),
    (v) => {
      s.body = { ...s.body, mArm: Number(v) }
      pushBody(i, DUR)
      sync()
      requestFrame()
    })

  const head = el('div', 'row row-buttons')
  head.append(el('span', 'section-label', t().bodySection), modeSeg)

  const armLabeled = el('div', 'labeled-seg')
  armLabeled.append(el('span', 'seg-label', t().arm), armSeg)

  const simpleRow = el('div', 'row row-buttons')
  simpleRow.append(presetSeg, armLabeled)

  const slidersRow = el('div', 'row sliders')
  slidersRow.hidden = true
  const inputs = new Map<string, HTMLInputElement>()
  for (const spec of PANE_SLIDERS) {
    const input = buildSlider(slidersRow, t()[spec.key], spec.range, spec.get(s.body), (v) => {
      s.body = spec.set(s.body, v)
      // 体型プリセットの選択を外すのはセグメント比を手で動かしたときだけ。腕は別軸
      if (SEGMENT_SLIDERS.has(spec.key)) s.presetId = null
      pushBody(i, 0)
      sync()
      requestFrame()
    })
    inputs.set(spec.key, input)
  }

  const bodySection = el('div', 'body-section')
  bodySection.append(head, simpleRow, slidersRow)

  // --- セッティング（簡易｜詳細）：スタンス ---
  // 開き角はスタンスそのものなので、身体的特徴ではなくこちらの詳細に置く（Rev.7）
  const setupModeSeg = buildSeg('mode', t().aria.setupMode, [
    { v: 'simple', label: t().simple },
    { v: 'detail', label: t().detail },
  ], (v) => {
    if (v !== 'simple' && v !== 'detail') return
    s.setupMode = v
    sync()
  })

  const stanceSeg = buildSeg('presets', t().aria.stance,
    STANCES.map((deg) => ({ v: String(deg), label: t().stances[deg] ?? String(deg) })),
    (v) => {
      s.stanceDeg = Number(v)
      tweens[i].stanceDeg.set(s.stanceDeg, DUR, performance.now())
      sync()
      requestFrame()
    })

  const toolHead = el('div', 'row row-buttons')
  toolHead.append(el('span', 'section-label', t().setupSection), setupModeSeg)

  const stanceLabeled = el('div', 'labeled-seg')
  stanceLabeled.append(el('span', 'seg-label', t().stance), stanceSeg)

  const setupSimpleRow = el('div', 'row row-buttons')
  setupSimpleRow.append(stanceLabeled)

  // 3択ボタンで代表値、このスライダーで微調整する
  // （スクワット版の「足首3段階と ROM スライダー」と同じ関係）
  const setupSlidersRow = el('div', 'row sliders')
  setupSlidersRow.hidden = true
  inputs.set(
    'stance',
    buildSlider(setupSlidersRow, t().stanceDeg, DL_RANGES.stance, s.stanceDeg, (v) => {
      s.stanceDeg = v
      tweens[i].stanceDeg.set(v, 0, performance.now())
      sync()
      requestFrame()
    }),
  )

  const toolSection = el('div', 'tool-section')
  toolSection.append(toolHead, setupSimpleRow, setupSlidersRow)

  root.append(bodySection, toolSection)
  panesHost.append(root)

  return {
    root,
    modeSeg,
    presetSeg,
    armSeg,
    stanceSeg,
    simpleRow,
    slidersRow,
    setupModeSeg,
    setupSimpleRow,
    setupSlidersRow,
    inputs,
  }
}

let panes: [PaneUI, PaneUI]
let liftInput: HTMLInputElement
let playBtn: HTMLButtonElement

// ---------------------------------------------------------------------------
// 自動再生：床↔ロックアウトを、両端で一瞬止めながら往復し続ける
// ---------------------------------------------------------------------------

/** 片道の所要時間（lift の全域ぶん。途中から始まる区間は距離に比例して短くなる） */
const PLAY_MOVE = 1200
/** 床・ロックアウトでの静止時間 */
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

/** スクワット版と違い bottom = 床 = lift 0、top = ロックアウト = lift 1 */
const playTarget = (seg: PlaySeg): number => (seg === 'down' || seg === 'holdBottom' ? 0 : 1)

function makeSeg(seg: PlaySeg, from: number, start: number): Play {
  const dur = seg === 'down' ? PLAY_MOVE * from : seg === 'up' ? PLAY_MOVE * (1 - from) : PLAY_HOLD
  return { seg, from, start, dur }
}

/** 再生中は毎フレーム lift を進める。区間の継ぎ目は start を積み上げてリズムを保つ */
function stepPlay(now: number): void {
  if (!play) return
  while (now - play.start >= play.dur) {
    play = makeSeg(PLAY_NEXT[play.seg], playTarget(play.seg), play.start + play.dur)
  }
  const to = playTarget(play.seg)
  const k = play.dur > 0 ? Math.min(1, (now - play.start) / play.dur) : 1
  state.lift = play.from + (to - play.from) * easeInOutQuad(k)
  liftInput.value = String(state.lift)
}

function syncPlayBtn(): void {
  const on = play !== null
  playBtn.textContent = on ? t().stop : t().play
  playBtn.dataset['on'] = String(on)
  playBtn.setAttribute('aria-pressed', String(on))
}

function setPlaying(on: boolean): void {
  // 現在の高さから連続的に動き出す（床寄りなら引き上げから、上寄りなら下ろしから）
  play = on ? makeSeg(state.lift > 0.5 ? 'down' : 'up', state.lift, performance.now()) : null
  syncPlayBtn()
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
    press(ui.presetSeg, s.presetId)
    // 3択のどれとも一致しない値（詳細スライダーで設定）のときは、どれも点灯しない
    press(ui.armSeg, String(s.body.mArm))
    press(ui.stanceSeg, String(s.stanceDeg))
    press(ui.modeSeg, s.bodyMode)
    ui.simpleRow.hidden = s.bodyMode !== 'simple'
    ui.slidersRow.hidden = s.bodyMode !== 'detail'
    press(ui.setupModeSeg, s.setupMode)
    ui.setupSimpleRow.hidden = s.setupMode !== 'simple'
    ui.setupSlidersRow.hidden = s.setupMode !== 'detail'
    for (const spec of PANE_SLIDERS) {
      const input = ui.inputs.get(spec.key)
      if (input) input.value = String(spec.get(s.body))
    }
    const stanceInput = ui.inputs.get('stance')
    if (stanceInput) stanceInput.value = String(s.stanceDeg)
  }
  panes[1].root.hidden = !state.comparing
  compareBtn.setAttribute('aria-pressed', String(state.comparing))
  compareBtn.dataset['on'] = String(state.comparing)
  liftInput.value = String(state.lift)
  press(langSeg, getLang())
}

/**
 * 言語切替（Rev.8。スクワット版 `../app.ts` の applyLang と同じ作り）。
 * 文言は DOM 生成時に埋め込まれるので、ペインと挙上行は作り直す。
 * 状態（state）と補間（tweens）は DOM と独立なので、作り直しても
 * 選択内容も動きかけのアニメーションも保たれる。
 */
function applyLang(): void {
  const s = t()
  document.documentElement.lang = getLang()
  document.title = s.title
  compareBtn.textContent = s.compare
  notesBtn.textContent = s.notes
  notesClose.setAttribute('aria-label', s.close)
  langSeg.setAttribute('aria-label', s.aria.lang)
  applyNav('deadlift', { squat: s.navSquat, deadlift: s.navDeadlift })

  // エラー例のページも日英対応したので、言語を引き継いで渡す（?lang= の規約は exLink と同じ）
  errLink.textContent = s.errLink
  errLink.href =
    getLang() === 'ja' ? 'deadlift-errors.html' : `deadlift-errors.html?lang=${getLang()}`

  notesList.replaceChildren(
    ...s.notesList.map((html) => {
      const li = document.createElement('li')
      // <strong> を効かせるため。文言は自前の定数で、外部入力は混ざらない
      li.innerHTML = html
      return li
    }),
  )

  panesHost.replaceChildren()
  liftRow.replaceChildren()
  panes = [buildPane(0), buildPane(1)]
  buildLiftRow()
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

function draw(now: number): void {
  frameHandle = 0
  stepPlay(now)

  const visible: readonly (0 | 1)[] = state.comparing ? [0, 1] : [0]
  const bodies: SceneBody[] = []

  for (const i of visible) {
    const tw = tweens[i]
    // 描画側もスタンスの生値を使う（つま先の向き・腕の前後。Rev.7）ので、
    // ソルバに渡す値と同じ 1 回の読み取りを共有する
    const stanceDeg = tw.stanceDeg.read(now)
    const input: DlPoseInput = {
      body: {
        mShank: tw.mShank.read(now),
        mFemur: tw.mFemur.read(now),
        mTorso: tw.mTorso.read(now),
        mArm: tw.mArm.read(now),
        // 足長は定数（`../presets` の FOOT を参照）。DL でも動かさない
        foot: FOOT,
      },
      bar: BAR,
      stanceDeg,
      // 模範フォーム提示なので残り自由度は標準キューで固定する（Rev.4）:
      // 膝位置 = シャフトが脛に触れる（hipHeight 0.5）、身体重心 = 標準値
      // （comPos 省略 → COM_POS_DEFAULT）。腰の高さは体格から決まる「出力」になる
      hipHeight: 0.5,
      t: state.lift,
    }
    bodies.push({
      pose: solveDlPose(input),
      color: i === 0 ? COLORS.bodyA : COLORS.bodyB,
      stanceDeg,
    })
  }

  const scene: Scene = {
    // ペインの並び（左=A/青、右=B/コーラル）と図の並びを一致させる
    layout: state.comparing ? 'side' : 'single',
    bodies,
  }
  renderScene(svg, scene)

  const animating = tweens.some((tw) => Object.values(tw).some((x: Tween) => x.animating))
  if (animating || play) requestFrame()
}

// ---------------------------------------------------------------------------
// 起動
// ---------------------------------------------------------------------------

function buildLiftRow(): void {
  playBtn = el('button', 'playbtn')
  playBtn.addEventListener('click', () => setPlaying(!play))
  liftRow.append(playBtn)
  syncPlayBtn()

  liftInput = buildSlider(liftRow, t().lift, DL_RANGES.lift, state.lift, (v) => {
    // 手でドラッグしたら自動再生は止める
    if (play) setPlaying(false)
    state.lift = v
    requestFrame()
  })
}

function init(): void {
  // URL 共有は持たないが、種目間リンクが付ける ?lang= だけは読む（スクワット版と同じ規約）
  const lang = asLang(new URLSearchParams(location.search).get('lang'))
  if (lang) setLang(lang)

  // 文言に依存する DOM の生成はすべて applyLang に集約する（切替時に同じ経路を通る）
  applyLang()

  langSeg.addEventListener('click', (ev) => {
    const v = asLang((ev.target as HTMLElement).closest('button')?.dataset['v'] ?? null)
    if (!v || v === getLang()) return
    setLang(v as Lang)
    applyLang()
    requestFrame()
  })

  compareBtn.addEventListener('click', () => {
    state.comparing = !state.comparing
    if (state.comparing) {
      // 比較開始時はペインBをペインAの完全なコピーとして始める。
      // ペインUIの閉包が state.panes[1] を参照し続けるので、差し替えではなく上書きする
      const a = state.panes[0]
      Object.assign(state.panes[1], { ...a, body: { ...a.body } })
      pushPane(1, 0)
    }
    sync()
    requestFrame()
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
