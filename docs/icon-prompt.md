# アイコン生成プロンプト（nano banana 用）

## 決めたこと

| 項目 | 決定 | 備考 |
|---|---|---|
| モチーフ | しゃがんだ人型（横から） | 簡素化可。指導者判断 2026-07 |
| スタイル | 塗りなしの線画（スカイブルー #3b9de8 の輪郭） | アプリ本体と同じ表現 |
| 外形 | 角丸四角の地あり | ホーム画面で他アプリと形がそろう |
| 地の色 | **白** | 上2つを両立させるための判断。青い地に青い線は沈むため |

## 描く姿勢（モデルの実値）

アプリの「標準」体型・ハイバー・フラット・最深時と同じ角度にする。
デタラメな角度で描くと、アプリを開いたときの図と印象がずれる。

| 部位 | 角度 |
|---|---|
| すね | 鉛直から **約30°** 前傾（膝が前に出る） |
| 大腿 | **ほぼ水平**（股関節が膝よりわずかに低い、約2°） |
| 上体 | 鉛直から **約35°** 前傾 |

## 簡素化の方針（アイコン用）

アプリの描画から落とすもの：**鼻・関節の白丸・靴のシルエット・深さの破線**。
残すもの：**頭の円・上体・大腿・すね・足・中足部の垂直線・バーの円**。

中足部の垂直線はアプリ名（Midfoot）の由来であり、バーの円があることで
「この線の上にバーが載る」という意味が成立する。ただし 16px のファビコンでは
バーの円が頭とくっついて潰れるので、**極小サイズ版ではバーの円を省く**。

---

## プロンプト（主案：白いタイル＋青い線画）

```
A minimalist app icon, flat vector line art, square 1024x1024.

TILE: a rounded-square tile filling the whole canvas, solid white (#FFFFFF),
corner radius about 22% of the icon width, with a very thin light gray-blue
border (#DDE3EA). No shadow, no gradient, no bevel.

SUBJECT: a highly simplified human figure seen from the side (profile, facing
right) at the bottom position of a barbell squat, drawn as an open line drawing
with no fill.

GEOMETRY (follow these angles exactly):
- Shin: from the ankle up to the knee, tilted about 30 degrees forward of
  vertical, so the knee sits clearly in front of the ankle.
- Thigh: from the knee back to the hip, essentially horizontal, with the hip
  just barely lower than the knee.
- Torso: a single straight segment from the hip up to the head, leaning about
  35 degrees forward of vertical.
- Head: an open circle at the top of the torso, its outline only, empty inside.
- Foot: a simple flat horizontal shape at the ankle, pointing right.
- A small open circle sits on the back of the torso near the top, representing
  the barbell.
- One thin straight vertical line runs from above the figure down to the floor,
  passing through the middle of the foot and through the barbell circle.
- A short horizontal line under the foot represents the floor.

STROKE: every element drawn in a single uniform stroke weight, roughly 7% of
the icon width, sky blue (#3B9DE8), with round caps and round joins. The
interiors of the head circle and all limbs are empty (white), never filled.
The vertical line and the floor line are thinner, about 2.5% of the icon width,
in a muted gray-blue (#9AA5AE).

COMPOSITION: the figure is centered with generous, even margins inside the
tile. It must stay legible when the whole icon is scaled down to 32x32 pixels.

DO NOT INCLUDE: any text, letters or numbers, facial features, a nose, hands,
fingers, hair, clothing, muscles, gym equipment other than the small barbell
circle, joint dots, shading, gradients, drop shadows, 3D effects, perspective,
textures, or background scenery.
```

## 差し替え（反転案：青いタイル＋白い線画）

`TILE` と `STROKE` の段落を次に置き換える。

```
TILE: a rounded-square tile filling the whole canvas, solid sky blue (#3B9DE8),
corner radius about 22% of the icon width. No shadow, no gradient, no bevel.

STROKE: every element drawn in a single uniform stroke weight, roughly 7% of
the icon width, pure white (#FFFFFF), with round caps and round joins. The
interiors of the head circle and all limbs are empty (showing the blue tile
through), never filled. The vertical line and the floor line are thinner, about
2.5% of the icon width, in white at 60% opacity.
```

## 使うときの注意

- **画像生成モデルは幾何が正確に出ない。** 角度・線幅・余白は指示どおりにならないことが
  多いので、出てきた候補は「構図案」として扱い、気に入った1枚を選んでから
  SVG に描き起こす方が、どのサイズでも崩れない仕上がりになる
  （このアプリは既にモデルから正確な座標を出せるので、SVG 化は機械的にできる）
- 生成後に確認する点：**すねが前に出ているか**（膝が足首より前）、
  **大腿が水平か**、**垂直線が足の真ん中を通っているか**。
  この3つが崩れると、アプリの主張と食い違う絵になる
- 極小サイズ（16px）用は別途、バーの円と垂直線を省いた版を用意する

---

## 付記：デモ動画の作り方（2026-07）

SNS 用の短いデモは `docs/midfoot-demo.mp4`（横）と `docs/midfoot-demo-vertical.mp4`（縦）。

手順と注意点：

1. **公開中のライブ版**をブラウザ自動操作で録画する（GIF 出力のみ）
2. **深さスライダーは JS で値を変えず、トラック上を実際にクリックする。**
   録画ツールはクリック等の操作しかフレームに残さないので、JS で値を変えても
   フレームが増えない
3. 操作は**1回のバッチにまとめる**。バッチをまたぐとその待ち時間がフレーム間隔になる
4. 録画ツールはフレーム間隔を指定できず、**操作の実時間がそのまま間隔になる**
   （そのままだと 47 フレームで約3分の紙芝居）。`scripts/retime-gif.mjs` で
   GIF の delay を一定値に書き換える：`node scripts/retime-gif.mjs in.gif out.gif 10 200`
5. MP4 化（ffmpeg）：
   - 横：`-c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart -vf fps=25`
   - 縦：図の部分を切り出して拡大し、操作パネルを下に積む。
     `crop=760:430:420:0` と `crop=1568:316:0:430` を `vstack` して 1080×1920 に pad。
     全体をそのまま縮小すると図が小さすぎて読めない
