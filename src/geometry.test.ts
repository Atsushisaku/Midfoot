import { describe, expect, it } from 'vitest'
import {
  BAR_PARAMS,
  DEG,
  FEMUR_BOTTOM_DEG,
  K_PIVOT,
  TORSO_MAX_DEG,
  TORSO_MIN_DEG,
  heelTiltDeg,
  normalize,
  solvePose,
  solveStanding,
  type Body,
  type PoseInput,
} from './geometry'
import { PRESETS } from './presets'

const STANDARD: Body = { mShank: 1.0, mFemur: 1.0, mTorso: 1.0, foot: 0.2, romDeg: 30 }

function input(over: Partial<PoseInput> = {}): PoseInput {
  return { body: STANDARD, bar: 'high', shoe: 'flat', shankUsage: 1, p: 1, ...over }
}

/** 可動域の使用率に直す。既定 ROM 30°・フラットなので θ_s = 度数がそのまま出る */
const usageFor = (deg: number, body: Body = STANDARD, phi = 0) => deg / (body.romDeg + phi)

const preset = (id: string): Body => PRESETS.find((x) => x.id === id)!.body

// ---------------------------------------------------------------------------

describe('normalize (§4.8)', () => {
  it('総長を常に 1.0 にする', () => {
    for (const m of [
      { mShank: 1, mFemur: 1, mTorso: 1 },
      { mShank: 0.8, mFemur: 1.25, mTorso: 0.9 },
      { mShank: 1.25, mFemur: 0.8, mTorso: 1.25 },
    ]) {
      const s = normalize({ ...STANDARD, ...m })
      expect(s.shank + s.femur + s.torso).toBeCloseTo(1, 12)
    }
  })

  it('倍率 1.0 で基準比 0.32 / 0.31 / 0.37 になる', () => {
    const s = normalize(STANDARD)
    expect(s.shank).toBeCloseTo(0.32, 12)
    expect(s.femur).toBeCloseTo(0.31, 12)
    expect(s.torso).toBeCloseTo(0.37, 12)
  })

  it('倍率を一律にスケールしても比は変わらない', () => {
    const a = normalize({ ...STANDARD, mShank: 1, mFemur: 1, mTorso: 1 })
    const b = normalize({ ...STANDARD, mShank: 2, mFemur: 2, mTorso: 2 })
    expect(b.shank).toBeCloseTo(a.shank, 12)
    expect(b.femur).toBeCloseTo(a.femur, 12)
    expect(b.torso).toBeCloseTo(a.torso, 12)
  })

  it('足長は正規化に含めず、そのまま通す', () => {
    expect(normalize({ ...STANDARD, foot: 0.23 }).foot).toBeCloseTo(0.23, 12)
  })
})

// ---------------------------------------------------------------------------

describe('heelTiltDeg (§4.4)', () => {
  it('フラットでは 0', () => {
    expect(heelTiltDeg('flat', 0.2)).toBe(0)
  })

  it('標準足長でスニーカー 3.01°、リフティング 7.51°', () => {
    expect(heelTiltDeg('running', 0.2)).toBeCloseTo(3.01, 2)
    expect(heelTiltDeg('lifting', 0.2)).toBeCloseTo(7.51, 2)
  })

  it('リフティング > ランニング > フラット', () => {
    expect(heelTiltDeg('lifting', 0.2)).toBeGreaterThan(heelTiltDeg('running', 0.2))
    expect(heelTiltDeg('running', 0.2)).toBeGreaterThan(heelTiltDeg('flat', 0.2))
  })

  it('足が大きいほど同じヒールでも φ が小さい（h を総長基準で持つ効果）', () => {
    expect(heelTiltDeg('lifting', 0.24)).toBeLessThan(heelTiltDeg('lifting', 0.16))
  })

  it('支点は k_pivot × 足長', () => {
    const foot = 0.2
    const expected = Math.asin(0.0183 / (K_PIVOT * foot)) / DEG
    expect(heelTiltDeg('lifting', foot)).toBeCloseTo(expected, 12)
  })
})

// ---------------------------------------------------------------------------

describe('検算値（仕様 §4.3 の注記）', () => {
  it('標準体型・θ_s=30°・最深でハイバー 36.2°', () => {
    expect(solvePose(input({ bar: 'high' })).torsoDeg).toBeCloseTo(36.2, 1)
  })

  it('標準体型・θ_s=30°・最深でローバー 45.7°', () => {
    expect(solvePose(input({ bar: 'low' })).torsoDeg).toBeCloseTo(45.7, 1)
  })

  it('ローバーはハイバーより必ず前傾が深い', () => {
    for (const id of PRESETS.map((x) => x.id)) {
      const body = preset(id)
      const high = solvePose(input({ body, bar: 'high' })).torsoDeg
      const low = solvePose(input({ body, bar: 'low' })).torsoDeg
      expect(low, id).toBeGreaterThan(high)
    }
  })

  it('大腿が長いほど前傾が深い', () => {
    const base = solvePose(input({ body: preset('standard') })).torsoDeg
    const long = solvePose(input({ body: preset('long-femur') })).torsoDeg
    expect(long).toBeGreaterThan(base)
  })

  it('上体が長いほど前傾が浅い', () => {
    const base = solvePose(input({ body: preset('standard') })).torsoDeg
    const long = solvePose(input({ body: preset('long-torso') })).torsoDeg
    expect(long).toBeLessThan(base)
  })
})

// ---------------------------------------------------------------------------

describe('制約の充足（§4.5 / §4.6）', () => {
  const cases: PoseInput[] = []
  for (const id of PRESETS.map((x) => x.id)) {
    for (const bar of ['high', 'low'] as const) {
      for (const shankUsage of [0.4, 0.6, 0.8, 1]) {
        for (const p of [0, 0.25, 0.5, 0.75, 1]) {
          cases.push(input({ body: preset(id), bar, shankUsage, p }))
        }
      }
    }
  }

  it('浮きが発生しないケースではバーが必ず中足部の真上に来る', () => {
    for (const c of cases) {
      const pose = solvePose(c)
      if (pose.lift !== 'none') continue
      expect(pose.bar.x).toBeCloseTo(pose.midX, 10)
    }
  })

  it('股関節は必ず膝より後ろにある', () => {
    for (const c of cases) {
      const pose = solvePose(c)
      expect(pose.hip.x).toBeLessThanOrEqual(pose.knee.x + 1e-12)
    }
  })

  it('セグメント長が常に保存される', () => {
    for (const c of cases) {
      const pose = solvePose(c)
      expect(Math.hypot(pose.knee.x - pose.ankle.x, pose.knee.y - pose.ankle.y)).toBeCloseTo(
        pose.seg.shank,
        10,
      )
      expect(Math.hypot(pose.hip.x - pose.knee.x, pose.hip.y - pose.knee.y)).toBeCloseTo(
        pose.seg.femur,
        10,
      )
      expect(Math.hypot(pose.shoulder.x - pose.hip.x, pose.shoulder.y - pose.hip.y)).toBeCloseTo(
        pose.seg.torso,
        10,
      )
    }
  })

  it('大腿角は 90°（立位）から FEMUR_BOTTOM_DEG（ボトム）の間に必ず収まる', () => {
    for (const c of cases) {
      const pose = solvePose(c)
      expect(pose.femurDeg).toBeLessThanOrEqual(90 + 1e-12)
      expect(pose.femurDeg).toBeGreaterThanOrEqual(FEMUR_BOTTOM_DEG - 1e-12)
    }
  })

  it('バーは上体軸より必ず後方にある（d > 0 の効果）', () => {
    for (const c of cases) {
      const pose = solvePose(c)
      // 股関節→バー のベクトルを上体法線に射影すると d になるはず
      const t = pose.torsoDeg * DEG
      const nx = -Math.cos(t)
      const ny = Math.sin(t)
      const proj = (pose.bar.x - pose.hip.x) * nx + (pose.bar.y - pose.hip.y) * ny
      const d = typeof c.bar === 'string' ? BAR_PARAMS[c.bar].d : c.bar.d
      expect(proj).toBeCloseTo(d * pose.seg.torso, 10)
      expect(proj).toBeGreaterThan(0)
    }
  })
})

// ---------------------------------------------------------------------------

describe('深さ（§4.7）', () => {
  // asin は引数が ±1 に近いところで微分係数が発散するため、θ_f = 90° 付近では
  // 倍精度でも 1e-6 度オーダーの誤差が残る。描画に影響しないので許容する。
  it('p=0 で大腿が垂直（θ_f = 90°）', () => {
    for (const id of PRESETS.map((x) => x.id)) {
      const pose = solvePose(input({ body: preset(id), p: 0 }))
      expect(pose.femurDeg).toBeCloseTo(90, 4)
      expect(pose.hip.x).toBeCloseTo(pose.knee.x, 7)
    }
  })

  it('p=0 で脛が垂直（膝が足関節の真上）', () => {
    const pose = solvePose(input({ p: 0 }))
    expect(pose.shankDeg).toBeCloseTo(0, 12)
    expect(pose.knee.x).toBeCloseTo(pose.ankle.x, 12)
  })

  it('p=1 で股関節が IPF ラインより下（合格）', () => {
    for (const id of PRESETS.map((x) => x.id)) {
      const pose = solvePose(input({ body: preset(id), p: 1 }))
      expect(pose.hip.y).toBeLessThan(pose.ipfLineY)
    }
  })

  it('深くするほど股関節が下がる', () => {
    let prev = Infinity
    for (const p of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const y = solvePose(input({ p })).hip.y
      expect(y).toBeLessThan(prev)
      prev = y
    }
  })

  it('大腿角は p に対して線形に動く', () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      expect(solvePose(input({ p })).femurDeg).toBeCloseTo(90 + p * (FEMUR_BOTTOM_DEG - 90), 10)
    }
  })

  /**
   * ボトムの最後の数％では大腿が水平を過ぎ、股関節が膝の下に潜り込んで前に戻る。
   * これは幾何的に避けられないが、θ_f を線形に振ることで 0.5° 未満に抑えている。
   * （股関節「高さ」を線形に補間すると、ここが最大 8° まで膨らむ）
   * アニメーションで上体の起き上がりが見えるようになったら回帰。
   */
  it('降下中に上体が起き上がる量は 0.5° 以内に収まる', () => {
    for (const id of PRESETS.map((x) => x.id)) {
      for (const bar of ['high', 'low'] as const) {
        for (const shankUsage of [0.4, 0.6, 0.8, 1]) {
          let peak = -Infinity
          let worst = 0
          for (let p = 0; p <= 1.0001; p += 0.01) {
            const t = solvePose(input({ body: preset(id), bar, shankUsage, p })).torsoDeg
            peak = Math.max(peak, t)
            worst = Math.max(worst, peak - t)
          }
          expect(worst, `${id}/${bar}/${shankUsage}`).toBeLessThan(0.5)
        }
      }
    }
  })

  it('立位よりボトムの方が必ず前傾している', () => {
    for (const id of PRESETS.map((x) => x.id)) {
      for (const bar of ['high', 'low'] as const) {
        const stand = solvePose(input({ body: preset(id), bar, p: 0 })).torsoDeg
        const bottom = solvePose(input({ body: preset(id), bar, p: 1 })).torsoDeg
        expect(bottom, `${id}/${bar}`).toBeGreaterThan(stand + 15)
      }
    }
  })

  it('p は 0..1 にクランプされる', () => {
    expect(solvePose(input({ p: -5 })).hip.y).toBeCloseTo(solvePose(input({ p: 0 })).hip.y, 12)
    expect(solvePose(input({ p: 9 })).hip.y).toBeCloseTo(solvePose(input({ p: 1 })).hip.y, 12)
  })

  it('IPF ラインは脛角度に応じて動く', () => {
    const shallow = solvePose(input({ shankUsage: usageFor(10) }))
    const deep = solvePose(input({ shankUsage: usageFor(30) }))
    expect(deep.ipfLineY).toBeLessThan(shallow.ipfLineY)
  })
})

// ---------------------------------------------------------------------------

describe('立位ゴースト（§4.9）', () => {
  it('標準体型で 11° 前後の軽い前傾になる', () => {
    expect(solveStanding(input()).torsoDeg).toBeCloseTo(11, 0)
  })

  it('立位でもバーは中足部の真上にある', () => {
    const pose = solveStanding(input())
    expect(pose.bar.x).toBeCloseTo(pose.midX, 10)
  })

  it('solveStanding は p を無視する', () => {
    expect(solveStanding(input({ p: 1 })).hip.y).toBeCloseTo(solvePose(input({ p: 0 })).hip.y, 12)
  })
})

// ---------------------------------------------------------------------------

describe('脛前傾角＝可動域 × 使用率（§4.5）', () => {
  it('使用率 100% で θ_s が ROM + φ に一致する', () => {
    const flat = solvePose(input({ shankUsage: 1, shoe: 'flat' }))
    expect(flat.shankDeg).toBeCloseTo(30, 12)
    expect(flat.shankMaxDeg).toBeCloseTo(30, 12)

    const ls = solvePose(input({ shankUsage: 1, shoe: 'lifting' }))
    expect(ls.shankMaxDeg).toBeCloseTo(30 + heelTiltDeg('lifting', 0.2), 12)
    expect(ls.shankDeg).toBeCloseTo(ls.shankMaxDeg, 12)
  })

  it('θ_s は使用率に比例する', () => {
    for (const u of [0.3, 0.5, 0.75, 1]) {
      expect(solvePose(input({ shankUsage: u })).shankDeg).toBeCloseTo(30 * u, 12)
    }
  })

  it('使用率は 0〜1 にクランプされ、可動域を超える状態は作れない', () => {
    for (const u of [1.5, 3, 100]) {
      const pose = solvePose(input({ shankUsage: u }))
      expect(pose.shankDeg).toBeCloseTo(pose.shankMaxDeg, 12)
      expect(pose.shankUsage).toBe(1)
    }
    expect(solvePose(input({ shankUsage: -1 })).shankDeg).toBeCloseTo(0, 12)
  })

  it('靴を変えると天井が上がり、脛が実際に前に出る', () => {
    const flat = solvePose(input({ shoe: 'flat' }))
    const running = solvePose(input({ shoe: 'running' }))
    const lifting = solvePose(input({ shoe: 'lifting' }))
    expect(running.shankDeg).toBeGreaterThan(flat.shankDeg)
    expect(lifting.shankDeg).toBeGreaterThan(running.shankDeg)
  })

  /**
   * 度数入力＋クランプだった頃は、可動域を使い切っていないと靴を変えても図が
   * 一切動かなかった。比率で持つようにしたので、どの使用率でも靴が効く。
   */
  it('使用率が 100% 未満でも靴が姿勢を変える', () => {
    for (const u of [0.5, 0.7, 0.9, 1]) {
      const flat = solvePose(input({ shankUsage: u, shoe: 'flat' }))
      const lifting = solvePose(input({ shankUsage: u, shoe: 'lifting' }))
      expect(lifting.shankDeg, `usage=${u}`).toBeGreaterThan(flat.shankDeg)
      expect(lifting.torsoDeg, `usage=${u}`).toBeLessThan(flat.torsoDeg)
    }
  })

  it('靴は足関節の位置と中足部の基準線を動かさない（§4.4）', () => {
    const flat = solvePose(input({ shoe: 'flat' }))
    const lifting = solvePose(input({ shoe: 'lifting' }))
    expect(lifting.ankle.x).toBeCloseTo(flat.ankle.x, 12)
    expect(lifting.ankle.y).toBeCloseTo(flat.ankle.y, 12)
    expect(lifting.midX).toBeCloseTo(flat.midX, 12)
  })

  it('足首が硬いほど前傾が深くなる', () => {
    const stiff = solvePose(input({ body: { ...STANDARD, romDeg: 12 } }))
    const mobile = solvePose(input({ body: { ...STANDARD, romDeg: 40 } }))
    expect(stiff.torsoDeg).toBeGreaterThan(mobile.torsoDeg)
  })

  it('膝を後ろに座らせるほど前傾が深くなる', () => {
    let prev = Infinity
    for (const u of [0.4, 0.6, 0.8, 1]) {
      const t = solvePose(input({ shankUsage: u, bar: 'low' })).torsoDeg
      expect(t).toBeLessThan(prev)
      prev = t
    }
  })
})

// ---------------------------------------------------------------------------

describe('つま先浮き（§5）', () => {
  it('通常の設定では浮かない', () => {
    for (const id of PRESETS.map((x) => x.id)) {
      for (const bar of ['high', 'low'] as const) {
        expect(solvePose(input({ body: preset(id), bar })).lift, `${id}/${bar}`).toBe('none')
      }
    }
  })

  it('上体が極端に短いと股関節が後ろに残り、つま先が浮く', () => {
    const pose = solvePose(
      input({
        body: { mShank: 0.8, mFemur: 1.25, mTorso: 0.2, foot: 0.2, romDeg: 30 },
        bar: 'low',
      }),
    )
    expect(pose.lift).toBe('toe')
    expect(pose.torsoDeg).toBeCloseTo(TORSO_MAX_DEG, 12)
    expect(pose.footRotDeg).toBeGreaterThan(0)
  })

  it('つま先浮きはかかとを支点に回り、かかとが床に残る', () => {
    const pose = solvePose(
      input({
        body: { mShank: 0.8, mFemur: 1.25, mTorso: 0.2, foot: 0.2, romDeg: 30 },
        bar: 'low',
      }),
    )
    expect(pose.heel.y).toBeCloseTo(0, 12)
    expect(pose.toe.y).toBeGreaterThan(0)
  })

  /**
   * かかと浮きは扱わない（§5）。股関節が中足部より前に出る状態だが、
   * バーベルスクワットではほぼ起きず、モデル上も構造的に到達不能。
   * その方向に振り切れても、姿勢としては描かず角度を丸めるだけにしてある。
   */
  it('かかと浮き方向に振り切れても足部は水平のまま角度が丸められる', () => {
    const pose = solvePose(
      input({
        body: { mShank: 2.0, mFemur: 0.3, mTorso: 0.5, foot: 0.05, romDeg: 60 },
        shankUsage: 1,
        p: 0.25,
      }),
    )
    expect(pose.lift).toBe('none')
    expect(pose.torsoDeg).toBeCloseTo(TORSO_MIN_DEG, 12)
    expect(pose.footRotDeg).toBe(0)
    expect(pose.heel.y).toBe(0)
    expect(pose.toe.y).toBe(0)
  })

  it('足部の点が床下に潜ることはない', () => {
    for (const [body, shankUsage, p] of [
      [{ mShank: 2.0, mFemur: 0.3, mTorso: 0.5, foot: 0.05, romDeg: 60 }, 1, 0.25],
      [{ mShank: 0.8, mFemur: 1.25, mTorso: 0.2, foot: 0.2, romDeg: 30 }, 1, 1],
      [STANDARD, 1, 1],
      [STANDARD, 0.3, 1],
    ] as const) {
      const pose = solvePose(input({ body, shankUsage, p, bar: 'low' }))
      for (const pt of [pose.heel, pose.ball, pose.mid, pose.toe]) {
        expect(pt.y).toBeGreaterThanOrEqual(-1e-12)
      }
    }
  })

  it('足部の回転量は上限 15° を超えない', () => {
    const pose = solvePose(
      input({
        body: { mShank: 0.8, mFemur: 1.25, mTorso: 0.2, foot: 0.2, romDeg: 30 },
        bar: 'low',
      }),
    )
    expect(Math.abs(pose.footRotDeg)).toBeLessThanOrEqual(15)
  })

  it('浮いていなければ足部は水平のまま', () => {
    const pose = solvePose(input())
    expect(pose.footRotDeg).toBe(0)
    expect(pose.heel.y).toBe(0)
    expect(pose.ball.y).toBe(0)
    expect(pose.toe.y).toBe(0)
    expect(pose.mid.y).toBe(0)
  })

  it('中足部の基準線 midX は足部が回っても動かない', () => {
    const normal = solvePose(input())
    const tipped = solvePose(
      input({
        body: { mShank: 0.8, mFemur: 1.25, mTorso: 0.2, foot: 0.2, romDeg: 30 },
        bar: 'low',
      }),
    )
    expect(normal.midX).toBeCloseTo(0.5 * normal.seg.foot, 12)
    expect(tipped.midX).toBeCloseTo(0.5 * tipped.seg.foot, 12)
  })

  it('θ_t は必ず許容範囲に収まる', () => {
    for (const mTorso of [0.2, 0.5, 0.8, 1.0, 1.25]) {
      for (const mFemur of [0.8, 1.0, 1.25]) {
        for (const bar of ['high', 'low'] as const) {
          const pose = solvePose(
            input({ body: { ...STANDARD, mTorso, mFemur }, bar, shankUsage: 1}),
          )
          expect(pose.torsoDeg).toBeGreaterThanOrEqual(TORSO_MIN_DEG - 1e-9)
          expect(pose.torsoDeg).toBeLessThanOrEqual(TORSO_MAX_DEG + 1e-9)
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------

describe('注意表示（§5）', () => {
  it('通常の設定では 70° 警告が出ない', () => {
    for (const id of PRESETS.map((x) => x.id)) {
      expect(solvePose(input({ body: preset(id), bar: 'low' })).torsoWarn, id).toBe(false)
    }
  })

  it('極端な体格では 70° 警告が出る', () => {
    const pose = solvePose(input({ body: { ...STANDARD, mTorso: 0.4, mFemur: 1.25 }, bar: 'low' }))
    expect(pose.torsoDeg).toBeGreaterThan(70)
    expect(pose.torsoWarn).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('数値の健全性', () => {
  it('スライダー範囲の全域で NaN を出さない', () => {
    for (const mShank of [0.8, 1.0, 1.25]) {
      for (const mFemur of [0.8, 1.0, 1.25]) {
        for (const mTorso of [0.8, 1.0, 1.25]) {
          for (const foot of [0.16, 0.2, 0.24]) {
            for (const romDeg of [10, 30, 45]) {
              for (const shoe of ['flat', 'running', 'lifting'] as const) {
                for (const bar of ['high', 'low'] as const) {
                  for (const shankUsage of [0.3, 0.65, 1]) {
                    for (const p of [0, 0.5, 1]) {
                      const pose = solvePose({
                        body: { mShank, mFemur, mTorso, foot, romDeg },
                        bar,
                        shoe,
                        shankUsage,
                        p,
                      })
                      for (const v of [
                        pose.ankle.x, pose.ankle.y,
                        pose.knee.x, pose.knee.y,
                        pose.hip.x, pose.hip.y,
                        pose.shoulder.x, pose.shoulder.y,
                        pose.bar.x, pose.bar.y,
                        pose.heel.x, pose.heel.y,
                        pose.toe.x, pose.toe.y,
                        pose.torsoDeg, pose.femurDeg, pose.shankDeg,
                        pose.ipfLineY, pose.footRotDeg,
                      ]) {
                        expect(Number.isFinite(v)).toBe(true)
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  })

  it('足長 0 を渡しても破綻しない', () => {
    const pose = solvePose(input({ body: { ...STANDARD, foot: 0 } }))
    expect(Number.isFinite(pose.torsoDeg)).toBe(true)
    expect(pose.seg.foot).toBeGreaterThan(0)
  })
})
