/**
 * 図の左下のボタン（体格比較・エラー比較）が**床線の上に乗ってしまう**のを避ける
 * （2026-08-07）。
 *
 * この隅は「図は横方向に中央寄せなので床線の左端が通るだけ」という前提で選んだ場所だが、
 * **ウィンドウの縦横比が図（1000:620）に近いとき**は図が枠いっぱいに描かれ、床線が
 * ボタンの帯まで降りてくる。ボタンは不透明なので、床線がそこだけ途切れて見える
 * （820×1000 や 900×900 で再現）。
 *
 * 縦横比の条件は CSS のメディアクエリでは書けない（`.stage` の比であってビューポートの
 * 比ではない）ので、**実際に重なっているかを測って**帯を空けるクラスを付け外しする。
 * 帯を空けるのは重なるときだけなので、広い画面で図が縮むことはない。
 */

/** 空ける帯の高さ。ボタン（42px）＋下の余白（10px）＋逃げ */
const BAND = 'reserve-bottom'

export function watchCorner(): void {
  const stage = document.querySelector<HTMLElement>('.stage')
  const corner = document.querySelector<HTMLElement>('.corner.bottomleft')
  if (!stage || !corner) return

  const fit = (): void => {
    // 必ず「帯なし」に戻してから測る。空けた状態のまま測ると重なりが消えて判定が振動する
    stage.classList.remove(BAND)
    const floor = stage.querySelector<SVGElement>('.floor')
    if (!floor) return
    const f = floor.getBoundingClientRect()
    const c = corner.getBoundingClientRect()
    // 床線は水平なので、縦は近ければ重なりとみなす（線幅が細く、接触寸前でも見苦しい）
    const near = f.bottom >= c.top - 6 && f.top <= c.bottom + 6
    if (near && f.left <= c.right && f.right >= c.left) stage.classList.add(BAND)
  }

  // 図の再描画では床線の位置は変わらない（変わるのは `.stage` の大きさだけ）ので、
  // 毎フレームではなく大きさが変わったときだけ測る
  new ResizeObserver(fit).observe(stage)
  fit()
}
