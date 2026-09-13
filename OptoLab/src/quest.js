/* 課題と採点 ― すべて design 型。条件で固定する欄は check がその値かどうかも見る */
(function (global) {
  'use strict';
  var OP = global.OP || (global.OP = {});
  var O = OP.opto;

  function row(label, value, want, ok) { return { label: label, value: value, want: want, ok: !!ok }; }
  function f(v, d) { return (+v).toFixed(d === undefined ? 2 : d); }
  function near(a, b) { return Math.abs(a - b) <= Math.abs(b) * 1e-9 + 1e-12; }

  var CH = [
    { id: 1, name: '第1章　明るさの会計', lead: 'lx を W に、W を光子に。カメラ方程式と逆二乗。第4部の照度の根拠がここ。' },
    { id: 2, name: '第2章　結像と限界', lead: 'レンズの公式・エアリー径・0.61λ/NA。絞りと解像の綱引き。' },
    { id: 3, name: '第3章　ビームと膜と計測', lead: 'ガウスビームの集光、ファイバの窓、λ/4 コート、ロックイン。' },
    { id: 4, name: '第4章　偏光・分光・遠くへ', lead: '斜めの反射は偏光を選ぶ、格子で波長を場所に並べる、ファイバで 80 km 送る（第7部 09・11・12）。' }
  ];

  var LIST = [
    /* ===== 第1章 ===== */
    {
      id: 'lux', ch: 1, kind: 'design',
      name: 'カメラ方程式でセンサを照らす',
      desc: '被写体 **1000 lx・反射率 0.18・透過率 0.9** のまま、F値でセンサ面の照度を **5 lx 以上**にする。',
      why: 'センサ面の照度は E = ρ·E<sub>被写体</sub>·T/(4N²) ― F値の2乗で暗くなる。'
         + '第4部の「数字の根拠」にある**センサ面 0.52%** はこの式そのもの（ρ0.18・T0.9・F2.8）。'
         + '露出計もカメラの自動露出も、中身はこの1行の算数。',
      hint: '162/(4N²) ≥ 5 → N ≤ 2.85。F2.8 が「明るいレンズ」と呼ばれる理由。',
      check: function (ev, d) {
        var lock = d.lx === 1000 && near(d.rho, 0.18) && near(d.T, 0.9);
        return {
          ok: lock && ev.Eimg >= 5,
          rows: [
            row('センサ面の照度', f(ev.Eimg, 2) + ' lx（' + f(ev.phiUm, 0) + ' 光子/µm²/s @555nm）', '5.00 以上', ev.Eimg >= 5),
            row('F値', f(d.N, 2), '', true),
            row('条件固定', lock ? '守っている（1000lx・ρ0.18・T0.9）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'inv', ch: 1, kind: 'design',
      name: '逆二乗で照らす',
      desc: '距離 **2 m** のまま、点光源の光度で照度を **10 lx 以上**にする。',
      why: 'E = I/r²。距離を2倍にすると 1/4 ― 照明設計の最初の式で、'
         + '検出器の受ける光の見積もりはたいていここから始まる。立体角に広がった光束が'
         + 'r² の球面に薄まっていく、それだけの話。',
      hint: 'I ≥ 10 × 2² = 40 cd。',
      check: function (ev, d) {
        return {
          ok: d.rm === 2 && ev.Einv >= 10,
          rows: [
            row('照度 I/r²', f(ev.Einv, 2) + ' lx', '10.00 以上', ev.Einv >= 10),
            row('光度 / 距離', f(d.cd, 0) + ' cd / ' + f(d.rm, 1) + ' m', '距離は 2 のまま', d.rm === 2)
          ]
        };
      }
    },
    {
      id: 'lockin', ch: 1, kind: 'design',
      name: 'ロックインで床から引き上げる',
      desc: '信号の元の帯域 **1 kHz** のまま、ロックインの帯域を絞って SNR 改善 **100 倍以上**にする。',
      why: 'ノイズは帯域に√で比例する（第5部の W/√Hz の√）。信号を変調して狭い帯域に閉じ込めれば、'
         + '**SNR は √(B_in/B_lock) 倍**になる ― 微弱光計測の定石ロックイン検出の芯。'
         + '第6部のチョッパと同じ発想で、1/f の外へ引っ越す御利益も付いてくる。',
      hint: '√(1000/B) ≥ 100 → B ≤ 0.1 Hz。時定数にして数秒 ― 静けさは時間で買う。',
      check: function (ev, d) {
        return {
          ok: d.bin === 1000 && ev.snrGain >= 100,
          rows: [
            row('SNR 改善', f(ev.snrGain, 1) + ' 倍', '100.0 以上', ev.snrGain >= 100),
            row('帯域', f(d.bin, 0) + ' Hz → ' + f(d.blk, 2) + ' Hz', '元は 1000 のまま', d.bin === 1000),
            row('等価な時定数', '約 ' + f(1 / (2 * Math.PI * d.blk), 1) + ' s', '', true)
          ]
        };
      }
    },

    /* ===== 第2章 ===== */
    {
      id: 'lens', ch: 2, kind: 'design',
      name: '等倍で結ぶ',
      desc: '焦点距離 **50 mm** のまま、物体距離で倍率を **1.00 ± 0.05** にする。',
      why: '1/a + 1/b = 1/f と m = b/a。等倍は a = b = 2f のとき ― 「2f-2f」の配置。'
         + '検査光学やリレー光学の基本形で、倍率をどこに置くかが画素と分解能の配分を決める。',
      hint: 'a = 2f = 100 mm。',
      check: function (ev, d) {
        return {
          ok: d.fmm === 50 && isFinite(ev.mag) && Math.abs(ev.mag - 1) <= 0.05,
          rows: [
            row('倍率 b/a', isFinite(ev.mag) ? f(ev.mag, 3) : '（虚像。a > f にする）', '1.000 ± 0.050', isFinite(ev.mag) && Math.abs(ev.mag - 1) <= 0.05),
            row('物体距離 / 像距離', f(d.amm, 0) + ' mm / ' + (isFinite(ev.bmm) ? f(ev.bmm, 1) : '—') + ' mm', '', true),
            row('焦点距離', f(d.fmm, 0) + ' mm', '50 のまま', d.fmm === 50)
          ]
        };
      }
    },
    {
      id: 'airy', ch: 2, kind: 'design',
      name: '絞りすぎない',
      desc: '波長 **555 nm** のまま、エアリー径 2.44λN を **3.0 µm 以下**に収める（小さい画素のカメラ）。',
      why: '絞るほど深度は稼げるが、回折の点像 2.44λN が太る ― 第4部「解像の限界」の式。'
         + '画素 1.5µm 級のスマホカメラが F2 前後の明るい固定絞りなのは、**絞る余地が回折で消えている**から。',
      hint: 'N ≤ 3.0/(2.44×0.555) ≒ 2.2。',
      check: function (ev, d) {
        return {
          ok: d.nm === 555 && ev.airyUm <= 3,
          rows: [
            row('エアリー径', f(ev.airyUm, 2) + ' µm', '3.00 以下', ev.airyUm <= 3),
            row('F値', f(d.N, 2), '2.2 以下が目安', d.N <= 2.22),
            row('波長', d.nm + ' nm', '555 のまま', d.nm === 555)
          ]
        };
      }
    },
    {
      id: 'res', ch: 2, kind: 'design',
      name: '0.5 µm を見分ける',
      desc: '波長 **555 nm** のまま、対物の NA で分解能 0.61λ/NA を **0.50 µm 以下**にする。',
      why: '顕微鏡側の分解能はレイリーの 0.61λ/NA ― カメラの 2.44λN と同じ回折の物理を、'
         + 'NA の言葉で言い直したもの（N ≒ 1/2NA）。病理スキャナが高 NA 対物を使う理由で、'
         + 'これ以上は波長を短くする（青・UV・電子）しかない。',
      hint: 'NA ≥ 0.61×0.555/0.5 ≒ 0.68。乾燥系対物の上限（〜0.95）の内側。',
      check: function (ev, d) {
        return {
          ok: d.nm === 555 && ev.resUm <= 0.5,
          rows: [
            row('分解能 0.61λ/NA', f(ev.resUm, 3) + ' µm', '0.500 以下', ev.resUm <= 0.5),
            row('NA', f(d.naobj, 2), '0.68 以上が目安', d.naobj >= 0.677),
            row('波長', d.nm + ' nm', '555 のまま', d.nm === 555)
          ]
        };
      }
    },

    /* ===== 第3章 ===== */
    {
      id: 'gauss', ch: 3, kind: 'design',
      name: 'レーザーを 20 µm に絞る',
      desc: '波長 **1064 nm・f=50 mm・M²=1** のまま、入射ビーム半径で集光径 2w₀ を **20 µm 以下**にする。',
      why: 'ガウスビームの集光ウェストは w₀ = M²·λf/(πw) ― **太いビームほど小さく絞れる**。'
         + 'レーザー加工も顕微鏡の励起も、この逆比例が全部を決める。M² が悪いビームは'
         + 'その倍数だけ絞れない ― ビーム品質が金額になる理由。',
      hint: 'w ≥ λf/(π×10µm) ≒ 1.7 mm。ビームエキスパンダで太らせてから入れる。',
      check: function (ev, d) {
        var lock = d.nm === 1064 && d.fmm === 50 && near(d.m2, 1);
        return {
          ok: lock && ev.spotUm <= 20,
          rows: [
            row('集光径 2w₀', f(ev.spotUm, 1) + ' µm', '20.0 以下', ev.spotUm <= 20),
            row('入射ビーム半径', f(d.winmm, 2) + ' mm', '1.7 以上が目安', d.winmm >= 1.69),
            row('条件固定', lock ? '守っている（1064nm・f50・M²=1）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'fiber', ch: 3, kind: 'design',
      name: 'ファイバに入れる',
      desc: 'コア **10 µm・NA 0.14** のファイバ（1064nm・f=50mm・M²=1）へ: **スポット ≤ コア** かつ **ビームの NA ≤ ファイバの NA**。',
      why: '結合の条件は2つ同時 ― 場所（スポットがコアに入る）と角度（光線がNAの受け入れ角に入る）。'
         + '太いビームはスポットが小さくなるが**角度が開く**（NA_beam = w/f）ので、窓は両側から閉じる。'
         + '面積×立体角（エテンデュ）は光学系で減らせない、という会計原則の入口。',
      hint: 'スポット≤10µm は w ≥ 3.4 mm。NA≤0.14 は w ≤ 7 mm。窓は 3.4〜7 mm。',
      check: function (ev, d) {
        var lock = d.nm === 1064 && d.fmm === 50 && near(d.m2, 1) && d.coreu === 10 && near(d.naf, 0.14);
        return {
          ok: lock && ev.spotUm <= d.coreu && ev.naBeam <= d.naf,
          rows: [
            row('スポット / コア', f(ev.spotUm, 1) + ' / ' + f(d.coreu, 0) + ' µm', 'スポットが小さい', ev.spotUm <= d.coreu),
            row('ビームNA / ファイバNA', f(ev.naBeam, 3) + ' / ' + f(d.naf, 2), 'ビームが小さい', ev.naBeam <= d.naf),
            row('条件固定', lock ? '守っている' : '課題の条件（コア10・NA0.14・1064nm・f50・M²1）に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'ar', ch: 3, kind: 'design',
      name: 'λ/4 で反射を殺す',
      desc: '基板 **n=3.9（シリコン）**のまま、λ/4 単層コートの屈折率で残留反射を **2% 以下**にする（素の反射は35%）。',
      why: 'λ/4 膜の残留反射は R = ((n₁n₃−n₂²)/(n₁n₃+n₂²))² ― **n₂ = √(n₁n₃) でゼロ**。'
         + 'シリコンなら理想は n=1.97。SemiLab「反射を殺す」で膜厚を合わせたあの課題の、'
         + '屈折率側の設計がこれ。ガラス（理想1.22）に良い材料が無く MgF₂(1.38) で妥協する話も同じ式から読める。',
      hint: '√3.9 ≒ 1.97 を狙う。1.71〜2.28 の窓なら 2% 以下。',
      check: function (ev, d) {
        return {
          ok: near(d.nsub, 3.9) && ev.Rar <= 0.02,
          rows: [
            row('残留反射', f(ev.Rar * 100, 2) + ' %（素の反射 ' + f(ev.Rfres * 100, 1) + '%）', '2.00 以下', ev.Rar <= 0.02),
            row('コートの屈折率', f(d.ncoat, 2) + '（理想 √n₁n₃ = ' + f(ev.nIdeal, 2) + '）', '', true),
            row('基板', 'n = ' + f(d.nsub, 1), '3.9 のまま', near(d.nsub, 3.9))
          ]
        };
      }
    },
    {
      id: 'etd', ch: 3, kind: 'design',
      name: 'LED をファイバに入れる ― エテンデュの会計',
      desc: '面光源 **径 100 µm・NA 0.9**（LED）を固定したまま、ファイバの**コア径 ≤ 200 µm・NA ≤ 0.5** の範囲で、結合効率の上限を **50% 以上**にする。',
      why: 'レーザーと違い、面光源は「面積×立体角」＝エテンデュを持っていて、'
         + '**受動光学系はこれを絶対に減らせない**（レンズは形を変えるだけ）。だから結合の上限は'
         + '(コア径×NA / 光源径×NA)² で決まり、レンズをどれだけ足しても超えられない ―'
         + '「頑張ればもっと入るはず」を止める会計。コア10µm・NA0.14 のファイバなら上限 0.02% ― LED はシングルモードにほぼ入らない。',
      hint: 'コア径×NA ≥ 63.6 µm が条件。コア150µm・NA0.45 で (67.5/90)² = 56%。',
      check: function (ev, d) {
        var lock = near(d.srcum, 100) && near(d.srcna, 0.9);
        var lim = d.coreu <= 200 && d.naf <= 0.5;
        return {
          ok: lock && lim && ev.etaMax >= 0.5,
          rows: [
            row('結合効率の上限', f(ev.etaMax * 100, 1) + ' %', '50.0 以上', ev.etaMax >= 0.5),
            row('ファイバ（コア×NA）', f(d.coreu, 0) + ' µm × ' + f(d.naf, 2) + ' = ' + f(d.coreu * d.naf, 1), 'コア≤200・NA≤0.5', lim),
            row('エテンデュ 受け/光源', ev.gfib.toExponential(2) + ' / ' + ev.gsrc.toExponential(2) + ' µm²·sr', '', true),
            row('光源固定', lock ? '守っている（径100µm・NA0.9）' : '課題の光源に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'cos4', ch: 2, kind: 'design',
      name: '隅を暗くしすぎない ― cos⁴則',
      desc: 'フルサイズの隅（像高 **21.6 mm**）のまま、焦点距離 **60 mm 以下**で、隅の照度を中心の **70 % 以上**に保つ。',
      why: '軸外の照度は主光線角 θ の cos⁴ で落ちる ― 瞳から隅までの距離が 1/cosθ に伸びて逆二乗で cos²、隅から見た瞳が傾いて楕円に縮むぶん cos、センサ面に斜めに当たるぶん cos。'
         + '**tanθ = 像高/f なので、広角ほど隅が暗い**。標準 50mm でフルサイズの隅は 71%、広角 35mm では 52%。'
         + '第4部の現像が最初にやる「レンズシェーディング補正」の物理側の根拠で、補正はゲインで持ち上げる ― つまり**隅は SNR でも損**をしている。',
      hint: 'f ≥ 49 mm で 70% に乗る。50mm（θ=23.4°）が定番の答え。35mm は 52% で落ちる。',
      check: function (ev, d) {
        var lock = near(d.hmm, 21.6);
        return {
          ok: lock && d.fmm <= 60 && ev.cos4 >= 0.7,
          rows: [
            row('隅の照度（中心比）', f(ev.cos4 * 100, 1) + ' %（θ ' + f(ev.thetaDeg, 1) + '°）', '70.0 以上', ev.cos4 >= 0.7),
            row('焦点距離', f(d.fmm, 0) + ' mm', '60 以下（望遠に逃げない）', d.fmm <= 60),
            row('像高', f(d.hmm, 1) + ' mm', '21.6 のまま（フルサイズの隅）', lock)
          ]
        };
      }
    },
    {
      id: 'mode', ch: 3, kind: 'design',
      name: 'モードを合わせる ― SM 結合の仕上げ',
      desc: '**1064 nm・f=50 mm・M²=1・MFD 6.2 µm** のまま、入射ビーム半径でモード結合効率を **95 % 以上**にする。',
      why: '「コアに入って NA にも入る」（fiber の課題）は入場券にすぎない ― シングルモードの結合は'
         + '**ファイバのモード（ガウス形・半径 MFD/2）と集光スポットの重なり積分**で決まり、'
         + 'η = (2w₁w₂/(w₁²+w₂²))²。太すぎても細すぎても重なりが崩れる ― <strong>w₁ = w₂ でだけ100%</strong>。'
         + 'レーザーモジュールのファイバ結合工程が「当てる」ではなく「合わせる」作業である理由。',
      hint: 'w₀ = 16.9/w[mm] µm。MFD/2 = 3.1 µm に合わせるには w ≈ 5.5 mm（窓は 4.4〜6.8 mm）。',
      check: function (ev, d) {
        var lock = d.nm === 1064 && near(d.fmm, 50) && near(d.m2, 1) && near(d.mfdum, 6.2);
        return {
          ok: lock && ev.etaMode >= 0.95,
          rows: [
            row('モード結合効率', f(ev.etaMode * 100, 1) + ' %', '95.0 以上', ev.etaMode >= 0.95),
            row('スポット w₁ / モード w₂', f(ev.w0um, 2) + ' / ' + f(d.mfdum / 2, 2) + ' µm', 'w₁ ≈ w₂', true),
            row('条件固定', lock ? '守っている（1064nm・f50・M²1・MFD6.2）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },

    /* ===== 第4章 ===== */
    {
      id: 'brew', ch: 4, kind: 'design',
      name: 'ブルースター角で p を通す',
      desc: '基板を **ガラス n = 1.5** にして、入射角で **p 偏光の反射を 0.1% 以下**にする（s 偏光の反射はそのとき何% か見ておく）。',
      why: '斜めに当てると、反射は s 偏光と p 偏光で分かれる。p の反射は tanθ<sub>B</sub> = n₂/n₁ の<b>ブルースター角</b>でゼロになり、'
         + 'その角度の反射光は s 偏光だけ ― 偏光サングラスが照り返しを消せる理由で、レーザーの共振器の窓をこの角度に傾けると'
         + 'p 偏光だけが損失なしに往復する（第7部 09、第9部 04）。',
      hint: 'arctan 1.5 = 56.3°。窓はおよそ 53.1〜59.1°。45° では p が 0.85%、s が 9.2%。',
      check: function (ev, d) {
        var lock = near(d.nsub, 1.5);
        return {
          ok: lock && ev.Rp <= 0.001,
          rows: [
            row('p 偏光の反射', f(ev.Rp * 100, 3) + ' %', '0.100 以下', ev.Rp <= 0.001),
            row('s 偏光の反射', f(ev.Rs * 100, 2) + ' %（反射光は s に偏る）', '', true),
            row('入射角 / ブルースター角', f(d.incdeg, 1) + '° / ' + f(ev.brewDeg, 1) + '°', '', true),
            row('基板', 'n = ' + f(d.nsub, 2), '1.5（ガラス）にする', lock)
          ]
        };
      }
    },
    {
      id: 'grat', ch: 4, kind: 'design',
      name: '格子の本数を選ぶ ― 400〜1000 nm を 1 本のセンサに',
      desc: '焦点距離 **50 mm**・画素 **25 µm**・範囲 **400〜1000 nm** のまま、格子の本数とスリットで、範囲を **12.8 mm（512 画素）以内**に収め、分解能の目安を **2.5 nm 以下**にする。',
      why: '格子を細かくするほど波長が大きく広がり（逆線分散 dλ/dx = d/f が小さくなり）、分解能は良くなるが、範囲がセンサからはみ出す。'
         + '粗くすると範囲は収まるが、1 画素に入る波長が増えて分解能が落ちる ― <b>窓は両側から閉じる</b>。'
         + '分解能を決めるのは格子そのもの（R = mN）ではなく、スリットの像と画素の大きさ（第7部 11、第10部 08）。',
      hint: '範囲: 600/(d/50) ≤ 12.8 → 本数 ≤ 426。分解能: (d/50) × 0.05 ≤ 2.5 → 本数 ≥ 400。スリットは 2 画素（50 µm）以下に。',
      check: function (ev, d) {
        var lock = near(d.fsp, 50) && near(d.pxum, 25) && near(d.lamlo, 400) && near(d.lamhi, 1000);
        var okSpan = ev.spanMm <= 12.8, okBp = ev.bpNm <= 2.5 + 1e-9;
        return {
          ok: lock && okSpan && okBp,
          rows: [
            row('センサの上の長さ', f(ev.spanMm, 2) + ' mm', '12.80 以下', okSpan),
            row('分解能の目安', f(ev.bpNm, 2) + ' nm（逆線分散 ' + f(ev.rld, 1) + ' nm/mm）', '2.50 以下', okBp),
            row('格子 / スリット', f(d.glmm, 0) + ' 本/mm / ' + f(d.slitum, 0) + ' µm', '', true),
            row('条件固定', lock ? '守っている（f50・画素25µm・400〜1000nm）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    },
    {
      id: 'link', ch: 4, kind: 'design',
      name: '80 km を 10 Gb/s で送る',
      desc: '**80 km・0.2 dB/km・接続 1 dB・D = 17 ps/(nm·km)・10 Gb/s** のまま、送信の電力（**+3 dBm まで**）と光源の波長の幅で、受信を **−18 dBm 以上**（PIN の受信器）に、分散の広がりを **1 ビットの半分（50 ps）以下**にする。',
      why: '損失は dB で足し算（80 km で 16 dB）、分散は D·L·Δλ で掛け算。<b>電力は送信で取り返せるが、分散は光源の波長の幅でしか減らせない</b> ―'
         + '波長の幅が 0.1 nm の光源では 136 ps 広がって 1 ビット（100 ps）を超える。長距離の通信に DFB レーザー（第9部 07）が要る理由（第7部 12）。',
      hint: '受信 = 送信 − 17 dB ≥ −18 → 送信 ≥ −1 dBm。広がり 17 × 80 × Δλ ≤ 50 → Δλ ≤ 0.037 nm。',
      check: function (ev, d) {
        var lock = near(d.linkkm, 80) && near(d.dbkm, 0.2) && near(d.extdb, 1) && near(d.dps, 17) && near(d.gbps, 10);
        var okP = ev.rxdbm >= -18, okTx = d.pdbm <= 3, okD = ev.spreadPs <= ev.bitPs / 2;
        return {
          ok: lock && okP && okTx && okD,
          rows: [
            row('受信の電力', f(ev.rxdbm, 1) + ' dBm', '−18.0 以上', okP),
            row('送信の電力', f(d.pdbm, 1) + ' dBm', '+3.0 以下', okTx),
            row('分散の広がり', f(ev.spreadPs, 1) + ' ps（1 ビット ' + f(ev.bitPs, 0) + ' ps）', f(ev.bitPs / 2, 0) + ' 以下', okD),
            row('条件固定', lock ? '守っている（80km・0.2dB/km・接続1dB・D17・10Gb/s）' : '課題の条件に戻す', '', lock)
          ]
        };
      }
    }
  ];

  function byId(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return null; }
  function chapterOf(q) { for (var i = 0; i < CH.length; i++) if (CH[i].id === q.ch) return CH[i]; return null; }

  function grade(id, st) {
    var q = byId(id);
    if (!q) return { ok: false, rows: [], error: '課題が見つかりません' };
    try {
      var r = q.check(O.evaluate(st.design), st.design);
      r.quest = q;
      return r;
    } catch (e) {
      return { ok: false, quest: q, rows: [row('採点できませんでした', String(e && e.message || e), '', false)] };
    }
  }

  OP.quest = { LIST: LIST, CH: CH, byId: byId, chapterOf: chapterOf, grade: grade };
})(typeof window !== 'undefined' ? window : globalThis);
