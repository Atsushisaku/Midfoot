/**
 * GIF のフレーム間隔を一定に書き換える。
 *
 * 画面録画ツールは「操作と操作の実時間」をそのままフレーム間隔にするため、
 * 自動操作で撮ると 1 フレーム数秒の紙芝居になる。フレームの中身は正しいので、
 * Graphic Control Extension の delay（1/100 秒単位）だけを差し替える。
 *
 *   node scripts/retime-gif.mjs <in.gif> <out.gif> [delay=10] [lastDelay=200]
 */
import { readFileSync, writeFileSync } from 'node:fs'

const [, , inPath, outPath, delayArg, lastArg] = process.argv
if (!inPath || !outPath) {
  console.error('usage: node scripts/retime-gif.mjs <in.gif> <out.gif> [delay] [lastDelay]')
  process.exit(1)
}
const DELAY = Number(delayArg ?? 10)
const LAST = Number(lastArg ?? 200)

const buf = readFileSync(inPath)
if (buf.toString('latin1', 0, 3) !== 'GIF') throw new Error('not a GIF')

let p = 6 // header
const flags = buf[p + 4]
p += 7 // logical screen descriptor
if (flags & 0x80) p += 3 * (1 << ((flags & 0x07) + 1)) // global color table

/** サブブロック列（長さ+データの繰り返し、0 で終端）を読み飛ばす */
const skipSubBlocks = () => {
  while (buf[p] !== 0) p += 1 + buf[p]
  p += 1
}

const gceOffsets = []
while (p < buf.length) {
  const b = buf[p]
  if (b === 0x3b) break // trailer
  if (b === 0x21) {
    // extension
    const label = buf[p + 1]
    p += 2
    // GCE のサブブロックは [size=4][packed][delay lo][delay hi][transparent idx]。
    // p はいま size バイトを指しているので、delay は p+2。
    // p+1（packed）に書くと廃棄方法まで壊れる
    if (label === 0xf9) gceOffsets.push(p + 2)
    skipSubBlocks()
  } else if (b === 0x2c) {
    // image descriptor
    const lf = buf[p + 9]
    p += 10
    if (lf & 0x80) p += 3 * (1 << ((lf & 0x07) + 1)) // local color table
    p += 1 // LZW minimum code size
    skipSubBlocks()
  } else {
    throw new Error(`unexpected block 0x${b.toString(16)} at ${p}`)
  }
}

gceOffsets.forEach((off, i) => {
  const d = i === gceOffsets.length - 1 ? LAST : DELAY
  buf.writeUInt16LE(d, off)
})

writeFileSync(outPath, buf)
const total = (DELAY * (gceOffsets.length - 1) + LAST) / 100
console.log(`frames=${gceOffsets.length} delay=${DELAY} last=${LAST} → ${total.toFixed(1)}s`)
