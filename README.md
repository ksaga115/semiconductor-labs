# 半導体 ― 工程から像まで、読んで、作って、確かめる

**入口は [`index.html`](index.html)（学びの地図）。** ブラウザで開くと、8部の目次と、章ごとに対応する
ラボの課題へのリンクが出る。この README はその Markdown 版（要点だけ）。

半導体を、製造工程 → 素子の物理 → 論理回路 → イメージセンサ → 光検出デバイス → アナログ回路 → 光学 → 信頼性と品質 の8部で通して学ぶための場所。
各部は **参考書**（読んで理解する）と **ラボ**（自分の手で作って、機械に採点させる）の二層になっている。

```
        第1部 工程   第2部 素子     第3部 論理   第4部 像      第5部 数える   第6部 アナログ  第7部 光学   第8部 信頼性
参考書  製造プロセス  デバイスの基礎  論理回路     イメージセンサ  光検出の系統   ラザビー       検出器の相手側 壊れ方を数える
ラボ    ProcessLab   SemiLab       NandLab     PixelLab      PhotonLab     AnalogLab     OptoLab      QALab

   工程 → 不純物 → pn接合 → MOSFET → インバータ → NAND → ALU
                     └→ フォトダイオード → 画素 → カメラ → 像
                              └→ PMT・APD・MPPC ―「数える」一族（第5部）
   光学（第7部）が光を届け、アナログ（第6部）が読み出し、信頼性と品質（第8部）が 10年・百万個の側から締める
```

---

## 並び

```
半導体\
  index.html                     学びの地図（入口）
  第1部_製造プロセス.html    第1部 参考書 ― ウェーハからチップまで
  第2部_デバイスの基礎.html          第2部 参考書 ― 不純物 → 接合 → MOSFET（5章＋付録。数値は SemiLab が解いた値）
  第3部_論理回路.html              第3部 参考書 ― スイッチ → NAND → 組合せ → 記憶 → ALU（5章＋付録）
  第4部_イメージセンサ.html         第4部 参考書 ― 光子 → 電子 → 電圧 → 数値 → 像
  第5部_光検出デバイス.html          第5部 参考書 ― 数える一族: PMT・APD・MPPC から EMMI・光る半導体まで（8章）
  第6部_アナログ回路.html           第6部 参考書 ― 坂に住む設計: gmとroから差動対・帰還・雑音・バンドギャップまで（8章）
  第7部_光学.html                 第7部 参考書 ― 検出器の相手側: 照度の会計・カメラ方程式・回折・ガウス・ファイバ・膜（8章）
  第8部_信頼性と品質.html           第8部 参考書 ― 壊れ方を数える: FIT・アレニウス・ワイブル・θとTj・TEC・Cpk・誤差伝播（8章）
  ProcessLab\                    第1部 ラボ ― 原始部品 ＝ 工程（4章 13問）
  SemiLab\                       第2部 ラボ ― 原始部品 ＝ 不純物（5章 22問）
  NandLab\                       第3部 ラボ ― 原始部品 ＝ NAND（5章 25問）
  PixelLab\                      第4部 ラボ ― 原始部品 ＝ 光子と電子を数えること（3章 12問）
  PhotonLab\                     第5部 ラボ ― 原始部品 ＝ 光子とη（3章 11問。R・NEP・D*・最適なM・MPPCの飽和・背景光・計数・走行×RC）
  AnalogLab\                     第6部 ラボ ― 原始部品 ＝ 二乗則のMOS 1個（3章 11問。Vov・gm・利得・GBW・TIA・kTC・SC・2段OTA）
  OptoLab\                       第7部 ラボ ― 原始部品 ＝ 光線とその会計（3章 11問。カメラ方程式・回折・ガウス・ファイバ・λ/4・エテンデュ・cos⁴）
  QALab\                         第8部 ラボ ― 原始部品 ＝ 故障率と分布（3章 10問。MTTF・加速3種・B10・Tj・TEC・Cpk・誤差の合成）
```

**ProcessLab と PixelLab は `../SemiLab/src/*.js` を読み込む。SemiLab と必ず兄弟に置く（PhotonLab の実行は単独で可、検査は SemiLab の道具を共用）。**

---

## 進み方

章を読んだら、その章の課題を解く。`index.html` の目次に章と課題の対応が全部ある。
参考書の各節の末尾にも「手を動かす」の箱があり、そこから課題を選んだ状態でラボが開く
（`SemiLab/index.html?quest=photo` のように URL で課題を指定できる）。

| 目的 | 順 |
|---|---|
| はじめて（全部通す） | 第1部 参考書 → ProcessLab 1–3章 → SemiLab 1–3章 → ProcessLab 4章 → SemiLab 4–5章 → NandLab → 第4部 参考書 → PixelLab → 第5部 → PhotonLab → 第6部 → AnalogLab → 第7部 → OptoLab → 第8部 → QALab |
| 役割別の入り口 | `index.html` の「ROLE ― 役割別の入り口」参照。第4部以降の各参考書の冒頭にも役割別（営業・企画／設計・開発／研究・製造）の読み方ガイドがある |
| イメージセンサが目的 | SemiLab 1・2・4章 → 第4部 参考書 00–07 → PixelLab 1章 → 参考書 ノイズ／PTC／付録C → PixelLab 2–3章 |
| 作り方が知りたい | 第1部 参考書 → ProcessLab 1–3章 → SemiLab 1・2章 → ProcessLab 4章 → SemiLab 5章 |
| デジタル回路が目的 | NandLab → SemiLab 5章「NAND の中身へ」→ 第4部 付録B |

---

## 共通の約束

- **数字はどこから来たかを書く。** 参考書の数値は、材料の定数（Eg・ε・ni・α）以外は仮想の一台・一枚から計算で追える。ラボはその計算を本当にやる
- **原始部品はひとつだけ。** 接合は濃度の違う一片を隣に置いた結果として立ち、AND は NAND を2個繋いだ結果としてできる
- **採点は振る舞いだけを見る。** お手本と見比べない。「お手本を見る」で出るのは正解ではなく一例
- **モデルの外に出たら赤い帯で知らせる。** 各ラボの README に「どこまでが厳密で、どこからがモデルか」がある
- **ブラウザだけで動く。** 依存ゼロ・通信ゼロ。`*.vbs` は UTF-16LE(BOM)（UTF-8 にすると壊れる）
- **画面に触るのは `ui.js` だけ。** 検査は Node:

```
node ProcessLab\tests\all.js      332 件
node SemiLab\tests\all.js       1,074 件
node NandLab\tests\all.js         642 件
node PixelLab\tests\all.js        281 件
node PhotonLab\tests\all.js       234 件
node AnalogLab\tests\all.js       223 件
node OptoLab\tests\all.js         221 件
node QALab\tests\all.js           206 件
```

（件数は 2026-09-13 時点）

---

## これから

- ~~NandLab「電圧で見る」のしきい値 0.7V は決め打ち~~ → **SemiLab 第5章「NAND の中身へ」の採点を通すと、その nMOS の Vth が NandLab「電圧で見る」に渡る**ようになった（localStorage 経由・出どころを画面に明記）。渡るのは Vth だけ ― この素朴なモデルでは n と p の強さの比しか効かず比は 1 固定なので、Cox は坂の形を変えない。電源 3.3V は決め打ちのまま
- NandLab に「原始部品を NOR にする」モードを足すか検討（第3部 01 章で NOR の万能性を説明しているが、ラボでは NAND からしか組めない）
- 各ラボの「ここから先」（README）― BJT・降伏・反射防止膜の設計・pMOS（SemiLab。ただし dev.js の MOS 解は p 基板＋n+poly ゲート前提で、n 基板に対しては正しい Vth を返さないことを確認済み ― pMOS 課題はソルバの n 基板対応が先）、側壁と形状・TED（ProcessLab）、光学（PixelLab。HDR 合成は「長短合成で 100 dB」として課題化済み）、メモリ（NandLab。RAM16 を「実装部品」として追加済み ― 課題の採点では使えない）、モード結合・TCSPCパイルアップ（OptoLab/PhotonLab）、ゼロ打ち消し抵抗・スルーレート（AnalogLab。2段OTA・SC は課題化済み）、Norris-Landzberg・HAST・GR&R の分散分析（QALab）。さらに先の候補: デバイス特性ラボ（C-V/I-V の実測練習）、NandLab の NOR モード
