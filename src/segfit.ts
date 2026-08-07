/**
 * 選択肢のボタン群（`.seg.presets`）のうち、**その幅に収まらないものだけ**を
 * 折り返し表示へ切り替える（2026-08-07）。
 *
 * `.seg` は `overflow: hidden` の 1 本のバーなので、幅が足りないと右側が黙って切れる
 * （スマホでエラーの 5 択が「バー軌道…」までしか出ていなかった）。かといって狭い画面の
 * ボタン群を一律に折り返すと、収まっているものまでバーの見た目を失う。
 *
 * 収まるかどうかは**言語と画面幅の組み合わせ**で決まる（日本語の体格条件は 390px でも
 * 収まるが、英語の Long femur / Long torso は溢れる）ので、CSS の幅指定では判定できない。
 * そこで**実際に切れているかを測って**クラスを付け外しする。
 *
 * 測り方: いったんバーに戻して `scrollWidth > clientWidth` を見る。折り返した状態のまま
 * 測ると常に収まって見えるので、判定が振動してしまう。
 */

/** 折り返し表示。付いたときだけ `style.css` 側でボタンごとの枠に変わる */
const WRAPPED = 'is-wrapped'

export function fitSegs(): void {
  for (const seg of document.querySelectorAll<HTMLElement>('.seg.presets')) {
    // 隠れている段（簡易／詳細で畳まれている側）は幅が 0 になるので測らない
    if (seg.offsetParent === null) continue
    seg.classList.remove(WRAPPED)
    if (seg.scrollWidth > seg.clientWidth + 1) seg.classList.add(WRAPPED)
  }
}

/**
 * 画面幅の変化にも追従させる。`fitSegs` はレイアウトを読み書きするので、
 * resize のたびに走らせず次のフレームへまとめる。
 */
export function watchSegs(): void {
  let raf = 0
  const run = (): void => {
    raf = 0
    fitSegs()
  }
  window.addEventListener('resize', () => {
    if (!raf) raf = requestAnimationFrame(run)
  })
  fitSegs()
}
