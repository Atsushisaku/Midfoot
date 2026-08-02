import { describe, expect, it } from 'vitest'
import { DEG } from '../geometry'
import {
  ARM_BASE,
  BAR_CLEARANCE,
  BAR_SETTING_Y,
  CM_PER_UNIT,
  COM_POS_DEFAULT,
  COM_RATIO,
  COM_TOP,
  KNEE_AHEAD_TOP,
  LOCK_BLEND_START,
  SEGMENT_MASS,
  TORSO_TOP_DEG,
  normalizeDl,
  solveDlPose,
  type BarSetting,
  type DlBody,
  type DlPose,
  type DlPoseInput,
} from './geometry'
import { ARM_LEVELS, DL_PRESETS, STANCES } from './presets'

const STANDARD: DlBody = { mShank: 1.0, mFemur: 1.0, mTorso: 1.0, mArm: 1.0, foot: 0.2 }

/** 既定は「標準体格・標準バー・α=0・hipHeight=0.5・comPos=0.3・t=0」＝ Rev.3 の基準条件 */
function input(over: Partial<DlPoseInput> = {}): DlPoseInput {
  return { body: STANDARD, bar: 'standard', stanceDeg: 0, hipHeight: 0.5, t: 0, ...over }
}

const preset = (id: string): DlBody => DL_PRESETS.find((x) => x.id === id)!.body

const BARS: readonly BarSetting[] = ['standard', 'block', 'deficit', 'small']

const pose = (over: Partial<DlPoseInput> = {}) => solveDlPose(input(over))
const backHoriz = (over: Partial<DlPoseInput> = {}) => pose(over).backHorizDeg
/** バー鉛直線から股関節までの水平距離（cm）。hips through が進むほど小さくなる */
const barToHipCm = (p: DlPose) => (p.midX - p.hip.x) * CM_PER_UNIT

/**
 * バー高における脚ラインの x（Rev.6）。
 * バーが膝より上なら膝そのもの、足首より下なら足首、間なら脛の内分点。
 */
const legXAtBarHeight = (p: DlPose): number => {
  if (p.bar.y >= p.knee.y) return p.knee.x
  if (p.bar.y <= p.ankle.y) return p.ankle.x
  return p.ankle.x + ((p.bar.y - p.ankle.y) / (p.knee.y - p.ankle.y)) * (p.knee.x - p.ankle.x)
}

/**
 * バー高の「沈み」の許容（Rev.10）。
 *
 * ロックアウトへの寄せが効く区間では、バー高は肩から腕長ぶん下ろして導出する
 * （バーは手にぶら下がっている、が本来の因果）。上体が後傾するぶん腕が前へ届く
 * 必要が出るので、腕の鉛直成分がわずかに縮み、トップの直前でバーが 0.01cm ほど沈む。
 * 実測の最大は 0.0088cm（全グリッド）。0.1cm 相当をここでの上限とする。
 */
const BAR_SETTLE = 0.1 / CM_PER_UNIT

/**
 * Rev.3 検算表の許容は角度 ±0.3°・長さ ±0.5cm。
 *
 * 角度に `toBeCloseTo(…, 1)` を使わないのは、あれが「差 < 0.05」を意味するから。
 * 表は小数1桁で書かれていて丸めだけで ±0.05 揺れるので、表の書式より厳しい判定に
 * なってしまう（実装は実際には全行 0.05 以内で一致している）。長さは ±0.5cm ＝
 * 精度 0 桁なので `toBeCloseTo(…, 0)` がそのまま許容と一致する。
 */
const expectDeg = (actual: number, expected: number, label: string) =>
  expect(
    Math.abs(actual - expected),
    `${label}: ${actual.toFixed(2)} vs ${expected}`,
  ).toBeLessThanOrEqual(0.3)

// ---------------------------------------------------------------------------

describe('normalizeDl (§3-1)', () => {
  it('総長を常に 1.0 にする', () => {
    for (const m of [
      { mShank: 1, mFemur: 1, mTorso: 1 },
      { mShank: 0.8, mFemur: 1.25, mTorso: 0.9 },
      { mShank: 1.25, mFemur: 0.8, mTorso: 1.25 },
    ]) {
      const s = normalizeDl({ ...STANDARD, ...m })
      expect(s.shank + s.femur + s.torso).toBeCloseTo(1, 12)
    }
  })

  it('倍率 1.0 で基準比 0.32 / 0.31 / 0.37 になる（スクワット版と同じ基準値）', () => {
    const s = normalizeDl(STANDARD)
    expect(s.shank).toBeCloseTo(0.32, 12)
    expect(s.femur).toBeCloseTo(0.31, 12)
    expect(s.torso).toBeCloseTo(0.37, 12)
  })

  it('腕と足長は正規化に含めない', () => {
    expect(normalizeDl({ ...STANDARD, mArm: 1.25 }).shank).toBeCloseTo(0.32, 12)
    expect(normalizeDl({ ...STANDARD, foot: 0.23 }).foot).toBeCloseTo(0.23, 12)
    expect(pose({ body: { ...STANDARD, mArm: 1.1 } }).armLen).toBeCloseTo(ARM_BASE * 1.1, 12)
  })

  it('足長は 0.05 を下回らない（§3-8）', () => {
    expect(normalizeDl({ ...STANDARD, foot: 0 }).foot).toBeCloseTo(0.05, 12)
  })

  it('Winter の質量比は合計 1.0（Rev.3）', () => {
    const sum = Object.values(SEGMENT_MASS).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 12)
  })
})

// ---------------------------------------------------------------------------

describe('検算値（Rev.5 の表）', () => {
  /** [条件名, 上書き, 背角, 腰高cm, 腕傾き, バー→股cm] */
  const rows: readonly [string, Partial<DlPoseInput>, number, number, number, number][] = [
    ['基準', {}, 32.1, 60.8, 5.8, 35.0],
    ['α=12（ミドル）', { stanceDeg: 12 }, 34.1, 59.4, 5.4, 34.5],
    ['α=35（スモウ）', { stanceDeg: 35 }, 49.0, 50.1, 2.0, 29.9],
    ['大腿長プリセット', { body: preset('long-femur') }, 19.0, 72.5, 5.8, 35.0],
    // Rev.6 で差し替え（脛が相対的に短く急なため、開始からクリアランス・キャップが効く）
    ['体幹長プリセット', { body: preset('long-torso') }, 44.7, 47.6, 5.1, 33.9],
    ['腕 短 0.90', { body: { ...STANDARD, mArm: 0.9 } }, 27.5, 57.6, 7.3, 36.0],
    ['腕 長 1.10', { body: { ...STANDARD, mArm: 1.1 } }, 37.1, 63.8, 4.4, 33.7],
    ['comPos=0（かかと）', { comPos: 0 }, 43.6, 53.3, -1.4, 37.0],
    ['comPos=1（中足部）', { comPos: 1 }, 10.2, 74.6, 19.9, 26.2],
    // Rev.6 で差し替え（キャップで膝が Rev.5 のスケジュール値より後ろに来る）
    ['t=0.5', { t: 0.5 }, 41.5, 79.4, 7.2, 28.5],
    // Rev.10 で差し替え（ロックアウトを規定姿勢に切り替えた。背角 94° ＝ 肩が股の後ろ）
    ['t=1（ロックアウト）', { t: 1 }, 94.0, 88.6, -6.5, 3.9],
    ['t=1 スモウ', { t: 1, stanceDeg: 35 }, 94.0, 80.5, -6.7, 4.1],
  ]

  for (const [label, over, deg, cm, arm, barHip] of rows) {
    it(`${label} → 背角 ${deg}° / 腰高 ${cm}cm / 腕 ${arm}° / バー→股 ${barHip}cm`, () => {
      const p = pose(over)
      expectDeg(p.backHorizDeg, deg, `${label} 背角`)
      expect(p.hip.y * CM_PER_UNIT, `${label} 腰高`).toBeCloseTo(cm, 0)
      expectDeg(p.armDeg, arm, `${label} 腕傾き`)
      expect(barToHipCm(p), `${label} バー→股`).toBeCloseTo(barHip, 0)
    })
  }

  /** Rev.5-2 の眼目。ロックアウトで骨盤がバーの下に入る（hips through） */
  it('挙上とともにバー→股の距離が縮む（hips through）', () => {
    let prev = Infinity
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const v = barToHipCm(pose({ t }))
      expect(v, `t=${t}`).toBeLessThan(prev)
      prev = v
    }
    expect(barToHipCm(pose({ t: 1 }))).toBeLessThan(10)
  })

  it('足首は足長の 20%（Rev.5-1。スクワット版の 25% とは別値）', () => {
    const p = pose()
    expect(p.ankle.x).toBeCloseTo(0.2 * p.seg.foot, 12)
    expect(p.ankle.y).toBeCloseTo(0.2 * p.seg.foot, 12)
  })

  it('既定の comPos は 0.3（省略しても指定しても同じ）', () => {
    expect(COM_POS_DEFAULT).toBe(0.3)
    const omitted = pose()
    const explicit = pose({ comPos: 0.3 })
    expect(omitted.hip.x).toBe(explicit.hip.x)
    expect(omitted.hip.y).toBe(explicit.hip.y)
  })

  it('backHorizDeg は 90 − torsoDeg（§3-7）', () => {
    const p = pose()
    expect(p.backHorizDeg).toBeCloseTo(90 - p.torsoDeg, 12)
  })

  it('プリセットは 3 つで、すべて mArm=1.0（腕は独立入力）', () => {
    expect(DL_PRESETS.map((p) => p.id)).toEqual(['standard', 'long-femur', 'long-torso'])
    for (const p of DL_PRESETS) expect(p.body.mArm, p.id).toBe(1.0)
  })
})

// ---------------------------------------------------------------------------

describe('不変条件の総当たり（Rev.3 の現実グリッド）', () => {
  const cases: DlPoseInput[] = []
  for (const p of DL_PRESETS) {
    for (const stanceDeg of STANCES) {
      for (const hipHeight of [0, 0.5, 1]) {
        for (const comPos of [0, 0.3, 1]) {
          for (const mArm of ARM_LEVELS) {
            for (const t of [0, 0.5, 1]) {
              cases.push(input({ body: { ...p.body, mArm }, stanceDeg, hipHeight, comPos, t }))
            }
          }
        }
      }
    }
  }
  const solved = cases.map((c) => ({ c, p: solveDlPose(c) }))

  const label = (c: DlPoseInput) =>
    `mArm=${c.body.mArm} α=${c.stanceDeg} hh=${c.hipHeight} com=${c.comPos} t=${c.t}`

  /** 射影後のセグメント長（§3-2）。ソルバは返さないのでテスト側で組み直す */
  const eff = (c: DlPoseInput) => {
    const seg = normalizeDl(c.body)
    return {
      femur: seg.femur * Math.cos(c.stanceDeg * DEG),
      shank: seg.shank * Math.cos(0.3 * c.stanceDeg * DEG),
      torso: seg.torso,
    }
  }

  it('バーは常に中足部の真上', () => {
    for (const { c, p } of solved) expect(p.bar.x, label(c)).toBeCloseTo(p.midX, 12)
  })

  // 許容 1e-10。閉形式＋二分法 50 回なので誤差は倍精度の丸め（1e-16 オーダー）しか出ない。
  it('腕長が保存される（|肩 − バー| = 腕長）', () => {
    for (const { c, p } of solved) {
      expect(Math.hypot(p.shoulder.x - p.bar.x, p.shoulder.y - p.bar.y), label(c)).toBeCloseTo(
        p.armLen,
        10,
      )
    }
  })

  it('セグメント長が保存される（射影後の長さで）', () => {
    for (const { c, p } of solved) {
      const e = eff(c)
      expect(Math.hypot(p.knee.x - p.ankle.x, p.knee.y - p.ankle.y), label(c)).toBeCloseTo(e.shank, 10)
      expect(Math.hypot(p.hip.x - p.knee.x, p.hip.y - p.knee.y), label(c)).toBeCloseTo(e.femur, 10)
      expect(Math.hypot(p.shoulder.x - p.hip.x, p.shoulder.y - p.hip.y), label(c)).toBeCloseTo(e.torso, 10)
    }
  })

  /**
   * 重心拘束の達成度。warn が none なら目標に載っているはず（要求 1e-6・実測 1e-16）。
   * comPos=1（中足部）は到達範囲の端なので、体格や t によっては 'reach' になる
   * （特に t=1 のロックアウトでは、身体だけの重心を中足部まで前に出せない）。
   * その場合は「一番近い端にクランプした」状態なので一致は求めない。
   *
   * Rev.10: t > LOCK_BLEND_START はロックアウトの規定姿勢へ寄せている区間なので、
   * 姿勢はそもそも重心目標に合わせていない。ここは対象外（ずれの上限は別テストで固定）。
   */
  it('警告が出ていなければ身体重心が目標に載る', () => {
    let checked = 0
    for (const { c, p } of solved) {
      if (p.warn !== 'none' || c.t > LOCK_BLEND_START) continue
      // Rev.5-2: 目標は t とともに COM_TOP へ動く（comPos は開始時の値）
      const start = (c.comPos ?? COM_POS_DEFAULT) * p.midX
      const comT = start + (COM_TOP - start) * c.t
      expect(Math.abs(p.comX - comT), label(c)).toBeLessThan(1e-6)
      checked++
    }
    expect(checked).toBeGreaterThan(cases.length / 2)
  })

  it('身体重心は Winter の質量比どおりに合成されている', () => {
    for (const { c, p } of solved) {
      const expected =
        SEGMENT_MASS.foot * 0.5 * p.seg.foot +
        SEGMENT_MASS.shank * (p.knee.x + COM_RATIO.shank * (p.ankle.x - p.knee.x)) +
        SEGMENT_MASS.femur * (p.hip.x + COM_RATIO.femur * (p.knee.x - p.hip.x)) +
        SEGMENT_MASS.torso * (p.hip.x + COM_RATIO.torso * (p.shoulder.x - p.hip.x)) +
        SEGMENT_MASS.arm * (p.shoulder.x + COM_RATIO.arm * (p.bar.x - p.shoulder.x))
      expect(p.comX, label(c)).toBeCloseTo(expected, 12)
    }
  })

  it('全出力が有限', () => {
    for (const { c, p } of solved) {
      for (const v of [
        p.ankle.x, p.ankle.y,
        p.knee.x, p.knee.y,
        p.hip.x, p.hip.y,
        p.shoulder.x, p.shoulder.y,
        p.bar.x, p.bar.y,
        p.comX, p.midX, p.armLen, p.plateR,
        p.torsoDeg, p.backHorizDeg, p.shinDeg, p.armDeg,
      ]) {
        expect(Number.isFinite(v), label(c)).toBe(true)
      }
    }
  })

  it('肩は股関節より上にある（物理枝の条件）', () => {
    for (const { c, p } of solved) expect(p.shoulder.y, label(c)).toBeGreaterThan(p.hip.y)
  })

  it('背角は 105° を超えない（非物理枝の除外・Rev.5-3）', () => {
    for (const { c, p } of solved) expect(p.backHorizDeg, label(c)).toBeLessThanOrEqual(105)
  })

  /**
   * 股関節は常にバー鉛直線より後ろ。
   *
   * Rev.3 まで置いていた「股関節は肩より後ろ」は Rev.5 では不変条件にならない。
   * ロックアウトは上体がわずかに後傾して釣り合うので肩が股のほぼ真上〜わずかに
   * 後ろに来るし、comPos=0（かかと荷重）× スモウ × 短い腕では t=0 でも
   * 「深く後ろに座って上体がほぼ鉛直」の枝が選ばれて順序が入れ替わる。
   * 全域で成り立つのはこちら（＝バーより前に股が出ることはない）。
   */
  it('股関節は常にバーより後ろ', () => {
    for (const { c, p } of solved) expect(p.hip.x, label(c)).toBeLessThan(p.midX)
  })

  /**
   * バーが脛・膝に食い込まない（Rev.6）。
   *
   * バー高における脚ラインの x（バーが膝より上なら膝そのもの）が
   * 「midX − BAR_CLEARANCE」を超えないこと。ソルバ側のキャップは開始閉じの膝高で
   * ratio を近似しているが、膝が後退すると実際の膝高は上がり ratio は小さくなるので、
   * 実測のクリアランスは常に規定値以上になる（実測の最小は 2.913cm ＝ 規定 2.913cm）。
   * 1e-9 は倍精度の丸め分の逃げ。
   */
  it('バーが脛・膝に食い込まない', () => {
    for (const p of DL_PRESETS) {
      for (const stanceDeg of STANCES) {
        for (const hipHeight of [0, 0.5, 1]) {
          for (const comPos of [0, 0.3, 1]) {
            for (const mArm of ARM_LEVELS) {
              for (let i = 0; i <= 20; i++) {
                const t = i / 20
                const q = solveDlPose(
                  input({ body: { ...p.body, mArm }, stanceDeg, hipHeight, comPos, t }),
                )
                expect(
                  legXAtBarHeight(q),
                  `${p.id}/α=${stanceDeg}/hh=${hipHeight}/com=${comPos}/arm=${mArm}/t=${t.toFixed(2)}`,
                ).toBeLessThanOrEqual(q.midX - BAR_CLEARANCE + 1e-9)
              }
            }
          }
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------

describe('単調性（Rev.3）', () => {
  it('身体重心を前に置くほど背中は起き、腕は前に倒れる', () => {
    let prevBack = Infinity
    let prevArm = -Infinity
    for (const comPos of [0, 0.25, 0.5, 0.75, 1]) {
      const p = pose({ comPos })
      expect(p.backHorizDeg, `comPos=${comPos}`).toBeLessThan(prevBack)
      expect(p.armDeg, `comPos=${comPos}`).toBeGreaterThan(prevArm)
      prevBack = p.backHorizDeg
      prevArm = p.armDeg
    }
  })

  it('スタンスを開くほど背中は立ち、腕は鉛直に近づく', () => {
    let prevBack = -Infinity
    let prevArm = Infinity
    for (const stanceDeg of [0, 12, 24, 35, 45]) {
      const p = pose({ stanceDeg })
      expect(p.backHorizDeg, `α=${stanceDeg}`).toBeGreaterThan(prevBack)
      expect(p.armDeg, `α=${stanceDeg}`).toBeLessThan(prevArm)
      prevBack = p.backHorizDeg
      prevArm = p.armDeg
    }
  })

  it('大腿が長いほど背中は寝る', () => {
    let prev = Infinity
    for (const mFemur of [0.85, 1.0, 1.18, 1.25]) {
      const v = backHoriz({ body: { ...STANDARD, mFemur } })
      expect(v, `mFemur=${mFemur}`).toBeLessThan(prev)
      prev = v
    }
  })

  /**
   * Rev.1 とは逆向きになった点。重心拘束の下では、腕が長いほど同じ重心位置を
   * 保ったまま上体を起こせる（腕が短いと肩を前に出して釣り合わせるしかない）。
   */
  it('腕が長いほど背中は立つ（Rev.1 と逆向き）', () => {
    let prev = -Infinity
    for (const mArm of [0.8, 0.9, 1.0, 1.1, 1.25]) {
      const v = backHoriz({ body: { ...STANDARD, mArm } })
      expect(v, `mArm=${mArm}`).toBeGreaterThan(prev)
      prev = v
    }
  })

  /**
   * 腰を高く構えるほど背中は寝る。
   *
   * ただし成立するのは膝の前方量が t スケジュールで決まる範囲（hipHeight ≧ 0.5）だけ。
   * それより低い設定では Rev.6 のクリアランス・キャップが先に効き、
   * 「腰を下げるほど膝が前に出る → 膝が高くならない → キャップが厳しくなる」ので
   * 逆に膝が押し戻され、向きが反転する（次のテストで固定）。
   * UI は Rev.4 で hipHeight=0.5 固定なので、表示上は影響しない。
   */
  it('腰を高く構えるほど背中は寝る（キャップが効かない範囲）', () => {
    for (const p of DL_PRESETS) {
      let prev = Infinity
      for (const hipHeight of [0.5, 0.75, 1]) {
        const v = backHoriz({ body: p.body, hipHeight })
        expect(v, `${p.id}/hipHeight=${hipHeight}`).toBeLessThan(prev)
        prev = v
      }
    }
  })

  /** キャップ領域（腰が低い側）での向きの反転は 0.5° 以内に収まる（Rev.6 の副作用） */
  it('キャップ領域での反転はごく小さい', () => {
    const low = [0, 0.1, 0.2, 0.3, 0.4].map((hipHeight) => backHoriz({ hipHeight }))
    expect(Math.max(...low) - Math.min(...low)).toBeLessThan(0.5)
  })
})

// ---------------------------------------------------------------------------

describe('挙上（§3-3 / §3-5）', () => {
  /**
   * 既定の重心設定（comPos=0.3）での挙上中は、背角がおおむね上がり続ける。
   *
   * 許容が −1.0° なのは Rev.6 のクリアランス・キャップの効果（実測の逐次沈みは
   * 標準体格で −0.89°）。バーが脛を這い上がる区間は膝が先に伸びていくので、
   * 背角はほぼ一定〜わずかに沈んでから起き上がる。これは実際の引き出しの挙動と一致する。
   *
   * 体幹長プリセットだけは沈みがこれより大きいので、次のテストで別に固定している。
   *
   * comPos を端（0 や 1）に振ったり α・腕を同時に振ったりすると、φ の解が別の枝へ
   * 飛んで背角が不連続に動くケースが残っている（返却物の懸念に記載）。
   */
  it('t を上げるとバーは単調に上がり、背角も（ほぼ）単調に上がる', () => {
    for (const p of DL_PRESETS) {
      if (p.id === 'long-torso') continue
      let prevBar = -Infinity
      let prevBack = -Infinity
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const q = solveDlPose(input({ body: p.body, t }))
        const label = `${p.id}/t=${t.toFixed(2)}`
        expect(q.bar.y, label).toBeGreaterThan(prevBar - BAR_SETTLE)
        expect(q.backHorizDeg, label).toBeGreaterThan(prevBack - 1.0)
        expect(Number.isFinite(q.torsoDeg), label).toBe(true)
        expect(Number.isFinite(q.hip.y), label).toBe(true)
        prevBar = q.bar.y
        prevBack = q.backHorizDeg
      }
    }
  })

  /**
   * 体幹長プリセットは開始からキャップが効いているぶん、序盤の沈みが大きい。
   * ピークからの累積で 5.6°（仕様 Rev.6 の「最大 0.93°」は標準体格の逐次値で、
   * このプリセットは含んでいない）。値そのものを回帰として固定しておく。
   */
  it('体幹長プリセットの序盤の沈みは 6° 以内で、その後は起き上がる', () => {
    const body = DL_PRESETS.find((p) => p.id === 'long-torso')!.body
    let peak = -Infinity
    let sag = 0
    for (let i = 0; i <= 100; i++) {
      const q = solveDlPose(input({ body, t: i / 100 }))
      peak = Math.max(peak, q.backHorizDeg)
      sag = Math.max(sag, peak - q.backHorizDeg)
    }
    expect(sag).toBeGreaterThan(4)
    expect(sag).toBeLessThan(6)
    expect(solveDlPose(input({ body, t: 1 })).backHorizDeg).toBeGreaterThan(
      solveDlPose(input({ body, t: 0 })).backHorizDeg,
    )
  })

  it('重心設定を端に振ってもバー高は単調で、全 t で有限', () => {
    for (const p of DL_PRESETS) {
      for (const comPos of [0, 1]) {
        let prevBar = -Infinity
        for (let t = 0; t <= 1.0001; t += 0.02) {
          const q = solveDlPose(input({ body: p.body, comPos, t }))
          const label = `${p.id}/com=${comPos}/t=${t.toFixed(2)}`
          expect(q.bar.y, label).toBeGreaterThan(prevBar - BAR_SETTLE)
          expect(Number.isFinite(q.torsoDeg), label).toBe(true)
          expect(Number.isFinite(q.hip.y), label).toBe(true)
          expect(Number.isFinite(q.armDeg), label).toBe(true)
          prevBar = q.bar.y
        }
      }
    }
  })

  it('t=0 のバー高はセッティングの高さそのもの', () => {
    for (const bar of BARS) {
      expect(pose({ bar, t: 0 }).bar.y).toBeCloseTo(BAR_SETTING_Y[bar], 12)
    }
  })

  /**
   * Rev.10 の眼目。ロックアウトは「鉛直をわずかに越えて後傾し、肩峰が大転子の後ろに来る」。
   * 体格・スタンス・腕長・腰の構え・重心設定のどれを振っても t=1 は規定姿勢なので、
   * 上体角はちょうど TORSO_TOP_DEG になる。
   */
  it('t=1（ロックアウト）で肩は股関節より後ろ', () => {
    for (const p of DL_PRESETS) {
      for (const stanceDeg of STANCES) {
        for (const mArm of ARM_LEVELS) {
          for (const hipHeight of [0, 0.5, 1]) {
            for (const comPos of [0, 0.3, 1]) {
              const q = solveDlPose(
                input({ body: { ...p.body, mArm }, stanceDeg, hipHeight, comPos, t: 1 }),
              )
              const l = `${p.id}/α=${stanceDeg}/arm=${mArm}/hh=${hipHeight}/com=${comPos}`
              expect(q.torsoDeg, l).toBeCloseTo(TORSO_TOP_DEG, 9)
              expect(q.shoulder.x, l).toBeLessThan(q.hip.x)
              // 後傾は「わずか」であって反り返りではない。3〜4cm に収まること
              expect((q.hip.x - q.shoulder.x) * CM_PER_UNIT, l).toBeGreaterThan(2)
              expect((q.hip.x - q.shoulder.x) * CM_PER_UNIT, l).toBeLessThan(5)
            }
          }
        }
      }
    }
  })

  /**
   * Rev.5-2 で終端が 0（脛鉛直）から 0.02 に変わった。トップでも脚全体がわずかに
   * 前傾していて、それが骨盤をバーの下へ入れる（hips through）。
   */
  it('t≥0.75 で膝の前方量が KNEE_AHEAD_TOP に落ち着く', () => {
    for (const t of [0.75, 0.9, 1]) {
      const q = pose({ t })
      expect(q.knee.x - q.ankle.x, `t=${t}`).toBeCloseTo(KNEE_AHEAD_TOP, 12)
      expect(q.shinDeg, `t=${t}`).toBeGreaterThan(0)
    }
  })

  /**
   * Rev.10 で定義が変わった。
   *
   * Rev.6 まではロックアウト高＝直立チェーン − 腕長（＝理論上の最大高）だったが、
   * それだと股・肩・バーが厳密に一直線に並ぶ特異配置になり、上体を傾ける余地が
   * ゼロになる。今は「規定のロックアウト姿勢の肩から腕長ぶん下」が定義。
   *
   * 旧式との差は 1cm 以内（標準体格で +0.2cm）。旧式は「肩がバーの真上にある」
   * 前提の概算で、実際には腕が中足部まで前へ届くぶん鉛直成分が縮むので、
   * どちら向きにもずれうる。ここでは大きさだけ押さえておく。
   */
  it('ロックアウト高は規定姿勢の肩から腕長ぶん下（セッティングに依らない）', () => {
    const ys = BARS.map((bar) => pose({ bar, t: 1 }).bar.y)
    for (const y of ys) expect(y).toBeCloseTo(ys[0]!, 12)
    const q = pose({ t: 1 })
    expect(Math.hypot(q.shoulder.x - q.bar.x, q.shoulder.y - q.bar.y)).toBeCloseTo(q.armLen, 12)
    const straight = q.ankle.y + q.seg.shank + q.seg.femur + q.seg.torso - q.armLen
    expect(Math.abs(q.bar.y - straight) * CM_PER_UNIT).toBeLessThan(1)
    // ロックアウトのバーは大腿の途中（膝より上・股関節より下）に来る
    expect(q.bar.y).toBeGreaterThan(q.knee.y)
    expect(q.bar.y).toBeLessThan(q.hip.y)
  })
})

// ---------------------------------------------------------------------------

describe('クランプと数値の健全性（§3-8 / Rev.3）', () => {
  it('入力は範囲外でも端の値と同じ姿勢になる', () => {
    const same = (a: DlPoseInput, b: DlPoseInput) => {
      const x = solveDlPose(a)
      const y = solveDlPose(b)
      expect(x.hip.x).toBeCloseTo(y.hip.x, 12)
      expect(x.hip.y).toBeCloseTo(y.hip.y, 12)
      expect(x.bar.y).toBeCloseTo(y.bar.y, 12)
    }
    same(input({ stanceDeg: -10 }), input({ stanceDeg: 0 }))
    same(input({ stanceDeg: 90 }), input({ stanceDeg: 45 }))
    same(input({ hipHeight: -1 }), input({ hipHeight: 0 }))
    same(input({ hipHeight: 2 }), input({ hipHeight: 1 }))
    same(input({ t: -0.5 }), input({ t: 0 }))
    same(input({ t: 1.5 }), input({ t: 1 }))
    same(input({ comPos: -0.5 }), input({ comPos: 0 }))
    same(input({ comPos: 1.5 }), input({ comPos: 1 }))
  })

  /**
   * 2 万 4 千ケースあるので、値ごとに expect を呼ぶと assertion 回数が支配的になる。
   * 破綻したケースだけを集めて最後に 1 回だけ突き合わせる。
   */
  it('スライダー範囲の全域（＋範囲外）で NaN を出さない', () => {
    const failures: string[] = []
    let cases = 0
    for (const mShank of [0.8, 1.0, 1.25]) {
      for (const mFemur of [0.8, 1.0, 1.25]) {
        for (const mTorso of [0.8, 1.0, 1.25]) {
          for (const mArm of [0.8, 1.0, 1.25]) {
            for (const stanceDeg of [-10, 0, 45, 90]) {
              for (const hipHeight of [-1, 0.5, 2]) {
                for (const comPos of [-0.5, 0, 0.3, 1, 1.5]) {
                  for (const t of [-0.5, 0, 0.5, 1, 1.5]) {
                    const p = solveDlPose({
                      body: { mShank, mFemur, mTorso, mArm, foot: 0.2 },
                      bar: 'standard',
                      stanceDeg,
                      hipHeight,
                      comPos,
                      t,
                    })
                    cases++
                    const vs = [
                      p.ankle.x, p.ankle.y,
                      p.knee.x, p.knee.y,
                      p.hip.x, p.hip.y,
                      p.shoulder.x, p.shoulder.y,
                      p.bar.x, p.bar.y,
                      p.heel.x, p.heel.y,
                      p.ball.x, p.ball.y,
                      p.toe.x, p.toe.y,
                      p.mid.x, p.mid.y,
                      p.midX, p.armLen, p.plateR, p.comX,
                      p.torsoDeg, p.backHorizDeg, p.shinDeg, p.armDeg,
                    ]
                    if (!vs.every((v) => Number.isFinite(v))) {
                      failures.push(
                        `${mShank}/${mFemur}/${mTorso}/${mArm} α=${stanceDeg} hh=${hipHeight} com=${comPos} t=${t}`,
                      )
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    expect(failures).toEqual([])
    expect(cases).toBe(3 ** 4 * 4 * 3 * 5 * 5)
  })

  /**
   * Rev.5 では comPos の端（中足部）× 挙上の序盤だけがクランプ領域になる
   * （t=1 は目標が COM_TOP に寄るので comPos に依らず解ける）。
   * 大腿が長く腕が短いと、床の時点で重心を中足部まで前に出しきれない。
   */
  it('目標が到達範囲外なら警告を出し、それでも姿勢は有限', () => {
    const p = solveDlPose(
      input({ body: { ...preset('long-femur'), mArm: 0.9 }, comPos: 1, t: 0 }),
    )
    expect(p.warn).toBe('reach')
    expect(Number.isFinite(p.comX)).toBe(true)
    expect(Number.isFinite(p.torsoDeg)).toBe(true)
    expect(p.comX).toBeLessThan(p.midX)
  })

  /**
   * Rev.10: t=1 の姿勢は規定値なので comPos に一切依存しない（完全一致する）。
   * そのうえで、規定姿勢が実際に持つ重心が t<1 の目標 COM_TOP の近傍にあること
   * ＝「規定した姿勢が力学的にも成り立っている」ことを 0.5cm 以内で固定しておく。
   * ここがずれると、寄せの区間で重心マーカーが床を横滑りする。
   */
  it('t=1 は comPos に依らず一意で、その重心は COM_TOP の近傍にある', () => {
    for (const pr of DL_PRESETS) {
      const ref = solveDlPose(input({ body: pr.body, comPos: 0.3, t: 1 }))
      for (const comPos of [0, 0.3, 1]) {
        const p = solveDlPose(input({ body: pr.body, comPos, t: 1 }))
        expect(p.warn, `${pr.id}/com=${comPos}`).toBe('none')
        expect(p.hip.x, `${pr.id}/com=${comPos}`).toBeCloseTo(ref.hip.x, 12)
        expect(p.shoulder.x, `${pr.id}/com=${comPos}`).toBeCloseTo(ref.shoulder.x, 12)
      }
      expect(Math.abs(ref.comX - COM_TOP) * CM_PER_UNIT, pr.id).toBeLessThan(0.5)
    }
  })

  it('足長 0 を渡しても破綻しない', () => {
    const p = pose({ body: { ...STANDARD, foot: 0 } })
    expect(Number.isFinite(p.torsoDeg)).toBe(true)
    expect(p.seg.foot).toBeGreaterThan(0)
  })

  it('生値のバー高（補間中の中間値）も受け付ける', () => {
    const mid = pose({ bar: { y: 0.19 } })
    expect(mid.bar.y).toBeCloseTo(0.19, 12)
    expect(mid.plateR).toBeCloseTo(0.19, 12)
  })
})
