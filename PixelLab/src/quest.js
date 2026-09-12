/* 課題と採点
 *
 * 3種類ある:
 *   measure … 謎のカメラを撮って、数字を当てる。答えは真の値と比べる（許容つき）
 *   choice  … 謎のカメラについて、どちらかを選ぶ
 *   design  … 自分の画素を設計して、仕様を満たす。採点は pixel.evaluate の値だけを見る
 *
 * 【測る課題の許容】差分法と直線の当てはめで、真の値から数 % ずれる（画素 4096 個ぶんの統計）。
 * 許容はその「測り方の誤差」より広く、でも当て推量では入らない幅にしてある。
 * tests/quest.js が「お手本の測り方で許容に入る」ことを確かめている。
 */
(function (global) {
  'use strict';
  var PX = global.PX || (global.PX = {});
  var PIX = PX.pixel, CAM = PX.camera;

  function row(label, value, want, ok) { return { label: label, value: value, want: want, ok: !!ok }; }
  function f(v, d) { return (+v).toFixed(d === undefined ? 2 : d); }

  var CH = [
    { id: 1, name: '第1章　撮って測る（PTC）', lead: 'ばらつきを測ると、画面の数字が何電子かが分かる。中身の伏せられたカメラで試す。' },
    { id: 2, name: '第2章　画素を設計する', lead: '面積・容量・温度・AD の桁。どれかを良くすると、どれかが悪くなる。' },
    { id: 3, name: '第3章　SemiLab とつなぐ', lead: '量子効率は SemiLab のフォトダイオードで解いている。赤外は層の厚みで決まる。' }
  ];

  var LIST = [
    /* ===== 第1章 測る ===== */
    {
      id: 'k', ch: 1, kind: 'measure', cam: 'A', unit: 'e⁻/DN', tol: 0.05,
      name: '変換係数 K を当てる',
      desc: '**謎のカメラ A** の変換係数 K（1 DN が何電子か）を当てる。誤差 **5% 以内**。',
      why: '光子はポアソン分布なので、電子で数えれば「分散 ＝ 平均」。DN で測ると分散は 1/K² 倍、平均は 1/K 倍になる。'
         + 'だから **分散を平均に対して描いた直線の傾きが 1/K**。これが電子の目盛りを決めるほとんど唯一の方法。',
      hint: '「掃く」で露光を変えながら撮る。下の左の図（分散 − 暗い分散 と 平均）が直線になっている範囲の傾きの逆数。',
      truth: function (c) { return c.K; }
    },
    {
      id: 'read', ch: 1, kind: 'measure', cam: 'A', unit: 'e⁻ rms', tol: 0.10,
      name: '読み出し雑音を当てる',
      desc: '**謎のカメラ A** の読み出し雑音を、電子の数で当てる。誤差 **10% 以内**。',
      why: '光の無い、一番短い露光では、ゆらぎは読み出し回路のものだけ。DN で測ったゆらぎに K を掛ければ電子になる ― '
         + 'K を先に測っておかないと、雑音は「DN」でしか言えない。',
      hint: '一番短い露光の「暗い分散」の平方根 × K。',
      truth: function (c) { return c.read; }
    },
    {
      id: 'fw', ch: 1, kind: 'measure', cam: 'B', unit: 'e⁻', tol: 0.08,
      name: '飽和電荷を当てる',
      desc: '**謎のカメラ B** の飽和電荷（井戸に溜められる電子の数）を当てる。誤差 **8% 以内**。',
      why: '井戸が満杯になると、どの画素も同じ値に張り付く。明るくしても平均がもう増えず、'
         + '**ばらつきは読み出し雑音だけに戻る**（PTC が頂点を作って落ちる）。張り付いた平均 × K が飽和電荷。'
         + '頂点の点の平均で測ると、露光の刻み方しだいで飽和の手前を拾ってしまう（作者が一度やった）。',
      hint: 'カメラ B の K も自分で測る。明るくしても増えなくなった平均（点の表の「信号」の最大）に K を掛ける。',
      truth: function (c) { return c.fw; }
    },
    {
      id: 'dark', ch: 1, kind: 'measure', cam: 'B', unit: 'e⁻/s', tol: 0.12,
      name: '暗電流を当てる',
      desc: '**謎のカメラ B** の暗電流（光が無くても溜まる電子の速さ）を当てる。誤差 **12% 以内**。',
      why: '暗い画像の平均は、露光を伸ばすと少しずつ上がる。その傾き（DN/s）× K が暗電流。'
         + 'オフセットは露光に依らないので、傾きを取れば消える。',
      hint: '光を消して（または「掃く」の暗い画像で）、露光と暗い平均の関係を見る（下の右の図）。',
      truth: function (c) { return c.dark; }
    },
    {
      id: 'prnu', ch: 1, kind: 'measure', cam: 'C', unit: '%', tol: 0.15,
      name: '感度のむらを当てる（PRNU）',
      desc: '**謎のカメラ C** の画素ごとの感度のばらつき（PRNU、信号に対する %）を当てる。誤差 **15% 以内**。',
      why: '2枚の平均の分散には、時間でゆらぐ雑音と、画素ごとに決まった「むら」が両方入っている。'
         + '差を取った分散（時間の雑音だけ）を引けば、むらだけが残る。むらは信号に比例するので % で言える。',
      hint: '飽和の手前で、固定パターンの標準偏差 ÷ 信号。',
      truth: function (c) { return c.prnu * 100; }
    },
    {
      id: 'limit', ch: 1, kind: 'choice', cam: 'C',
      options: [['well', '井戸（フォトダイオード）があふれる'], ['adc', 'AD 変換の上限に届く']],
      name: '飽和を決めているのはどちらか',
      desc: '**謎のカメラ C** は、明るくすると頭打ちになる。頭打ちを決めているのは、井戸か、AD の上限か。',
      why: '井戸の電子を DN に直した値（FW/K）が AD の上限を超えていると、**井戸があふれる前に AD が振り切れる**。'
         + 'そのとき PTC の頂点は井戸ではなく AD の上限を示している ― ここで作者（Claude）自身が一度だまされた。',
      hint: '生の平均（オフセット込み）が、2 の何乗から 1 引いた数に張り付いていないか。',
      truth: function () { return 'adc'; }
    },

    /* ===== 第2章 設計 ===== */
    {
      id: 'dr', ch: 2, kind: 'design',
      name: 'ダイナミックレンジを広げる',
      desc: '画素ピッチ **3.0 µm** のまま、ダイナミックレンジ（飽和電荷 ÷ 雑音の底）を **75 dB 以上**にする。',
      why: 'ダイナミックレンジは「一番明るいもの ÷ 一番暗く見えるもの」。井戸を大きくするか、雑音の底を下げる。'
         + '浮遊拡散の容量を小さくすると 1 電子が大きな電圧になって読み出し雑音が減る ―'
         + 'でも小さくしすぎると浮遊拡散が井戸を受け止めきれず、飽和電荷が減る。',
      hint: '浮遊拡散の容量を少し下げる。下げすぎると「井戸を決めたのは 浮遊拡散」に変わる。',
      check: function (ev, d) {
        return {
          ok: Math.abs(d.pitch - 3) < 1e-9 && ev.dr >= 75,
          rows: [
            row('ダイナミックレンジ', f(ev.dr, 1) + ' dB', '75.0 以上', ev.dr >= 75),
            row('画素ピッチ', f(d.pitch, 2) + ' µm', '3.00 のまま', Math.abs(d.pitch - 3) < 1e-9),
            row('飽和電荷 / 雑音の底', f(ev.fw, 0) + ' e⁻ / ' + f(ev.floor, 2) + ' e⁻（井戸を決めたのは ' + ev.limit + '）', '', true)
          ]
        };
      }
    },
    {
      id: 'dim', ch: 2, kind: 'design', flux: 200, t: 1 / 30,
      name: '暗い所で撮る',
      desc: '光子束 **200 光子/µm²/s**、露光 **1/30 秒**で S/N **5.5 以上**。ただし画素ピッチは **2.5 µm 以下**。',
      why: '暗いと、光子そのものが少ない（ショットノイズ）。そこへ読み出し雑音が足される。'
         + '小さい画素は光が少ないぶん不利 ― 残るのは量子効率を上げるか、読み出し雑音を削るか。',
      hint: '信号は 30 電子くらい。ショットノイズだけで S/N ≒ 5.5 なので、読み出し雑音を 1 電子近くまで下げる。',
      check: function (ev, d) {
        var q = LIST.filter(function (x) { return x.id === 'dim'; })[0];
        var S = PIX.signal(ev, q.flux, q.t), s = PIX.snr(ev, S, q.t);
        return {
          ok: s >= 5.5 && d.pitch <= 2.5 + 1e-9,
          rows: [
            row('S/N', f(s, 2), '5.50 以上', s >= 5.5),
            row('画素ピッチ', f(d.pitch, 2) + ' µm', '2.50 以下', d.pitch <= 2.5 + 1e-9),
            row('信号 / 読み出し雑音', f(S, 1) + ' e⁻ / ' + f(ev.read, 2) + ' e⁻', '', true)
          ]
        };
      }
    },
    {
      id: 'cool', ch: 2, kind: 'design', t: 60,
      name: '冷やして長く撮る',
      desc: '露光 **60 秒**で、暗電流のショットノイズ（√(暗電流×時間)）を**読み出し雑音以下**にする。温度は −40℃ まで。',
      why: '暗電流は空乏層の中で熱で生まれる電子で、ni に比例する。ni は温度に指数で効くので、'
         + '**約 9℃ 下げるごとに半分**になる。天体用のカメラが冷やしてあるのはこのため。',
      hint: '温度を下げる。何℃ 必要かは「倍になる温度幅」から逆算できる。',
      check: function (ev, d) {
        var q = LIST.filter(function (x) { return x.id === 'cool'; })[0];
        var ds = Math.sqrt(ev.dark * q.t);
        return {
          ok: ds <= ev.read && d.T >= -40,
          rows: [
            row('暗電流のショット（60 秒）', f(ds, 2) + ' e⁻', '読み出し雑音 ' + f(ev.read, 2) + ' e⁻ 以下', ds <= ev.read),
            row('温度', f(d.T, 1) + ' ℃', '−40℃ 以上', d.T >= -40),
            row('暗電流', f(ev.dark, 4) + ' e⁻/s（倍になる温度幅 ' + f(PIX.doublingK(d.T), 1) + ' K）', '', true)
          ]
        };
      }
    },
    {
      id: 'adc', ch: 2, kind: 'design',
      name: 'AD の桁を決める',
      desc: '量子化雑音（K/√12）を**読み出し雑音の 1/3 以下**にする。ただし桁は **16 bit まで**。',
      why: 'AD は井戸を満杯にしたとき上限に届くように割り当てる。桁が足りないと 1 DN が何電子にもなり、'
         + '階段の刻み（量子化）が雑音として見えてくる。刻みの雑音は K/√12 ― 一様分布の標準偏差。',
      hint: '既定の 12 bit だとわずかに足りない。1 桁ずつ上げてみる。',
      check: function (ev, d) {
        return {
          ok: ev.quant <= ev.read / 3 && d.bits <= 16,
          rows: [
            row('量子化雑音', f(ev.quant, 3) + ' e⁻', '読み出し雑音 ' + f(ev.read, 2) + ' e⁻ の 1/3 = ' + f(ev.read / 3, 3) + ' 以下', ev.quant <= ev.read / 3),
            row('AD の桁', d.bits + ' bit', '16 以下', d.bits <= 16),
            row('K', f(ev.K, 3) + ' e⁻/DN', '', true)
          ]
        };
      }
    },

    {
      id: 'hdr', ch: 2, kind: 'design',
      name: '長短合成で 100 dB',
      desc: '長短2枚の合成（露光比は **16:1 まで**）で、合成のダイナミックレンジを **100 dB 以上**にする。画素ピッチは **3.0 µm** のまま。',
      why: '合成は**天井を上げる技術**で、床は動かない ― 伸びは露光比のぶん 20log₁₀R だけ。16:1 でも +24.1 dB なので、'
         + '**単発の DR を 76 dB 近くまで作っておかないと届かない**。第4部「ダイナミックレンジを広げる」の①を、数字で踏む課題。',
      hint: 'まず浮遊拡散を下げて単発の DR を伸ばし（「ダイナミックレンジを広げる」と同じ手）、そのうえで露光比を 16 にする。',
      check: function (ev, d) {
        return {
          ok: ev.drH >= 100 && ev.hdrR <= 16 + 1e-9 && Math.abs(d.pitch - 3) < 1e-9,
          rows: [
            row('合成のダイナミックレンジ', f(ev.drH, 1) + ' dB', '100.0 以上', ev.drH >= 100),
            row('露光比', f(ev.hdrR, 0) + ':1（+' + f(20 * Math.log10(ev.hdrR), 1) + ' dB）', '16:1 以下', ev.hdrR <= 16 + 1e-9),
            row('単発の DR / 床', f(ev.dr, 1) + ' dB / ' + f(ev.floor, 2) + ' e⁻（床は合成では動かない）', '', true),
            row('画素ピッチ', f(d.pitch, 2) + ' µm', '3.00 のまま', Math.abs(d.pitch - 3) < 1e-9)
          ]
        };
      }
    },

    /* ===== 第3章 ===== */
    {
      id: 'nir', ch: 3, kind: 'design',
      name: '赤外に強い画素',
      desc: '波長 **850 nm** で、画素としての量子効率を **25% 以上**にする（マイクロレンズあり、ピッチ 3.0 µm）。',
      why: 'シリコンの 850nm の吸収長は約 19µm。光を集める層が 3µm しかないと、ほとんど素通りする。'
         + '量子効率は SemiLab のフォトダイオードをその厚みで作って解いている ― SemiLab 第4章「赤を拾う」と同じ物理。',
      hint: '波長を 850 にして、光を集める層（エピ）を厚くする。',
      check: function (ev, d) {
        return {
          ok: d.nm === 850 && ev.qe >= 0.25 && d.ml && Math.abs(d.pitch - 3) < 1e-9,
          rows: [
            row('波長', d.nm + ' nm', '850', d.nm === 850),
            row('画素の量子効率', f(ev.qe * 100, 1) + ' %', '25.0 以上', ev.qe >= 0.25),
            row('シリコンの量子効率（SemiLab）', f(ev.qeSi * 100, 1) + ' %（エピ ' + d.epi + ' µm）', '', true),
            row('マイクロレンズ / ピッチ', (d.ml ? 'あり' : 'なし') + ' / ' + f(d.pitch, 2) + ' µm', 'あり / 3.00', d.ml && Math.abs(d.pitch - 3) < 1e-9)
          ]
        };
      }
    }
  ];

  function byId(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return null; }
  function chapterOf(q) { for (var i = 0; i < CH.length; i++) if (CH[i].id === q.ch) return CH[i]; return null; }

  /**
   * 採点する。st = { answers: { 課題id: 値 }, design }
   */
  function grade(id, st) {
    var q = byId(id);
    if (!q) return { ok: false, rows: [], error: '課題が見つかりません' };
    try {
      if (q.kind === 'design') {
        var r = q.check(PIX.evaluate(st.design), st.design);
        r.quest = q;
        return r;
      }
      var cam = CAM.MYSTERY[q.cam], truth = q.truth(cam), ans = st.answers ? st.answers[id] : undefined;
      if (q.kind === 'choice') {
        var okc = ans === truth;
        return {
          ok: okc, quest: q,
          rows: [row('答え', ans === undefined ? '（まだ選んでいない）' : labelOf(q, ans), okc ? '正しい' : 'もう一度 PTC を見る', okc)]
        };
      }
      var v = +ans;
      if (!(v > 0)) return { ok: false, quest: q, rows: [row('答え', '（まだ入っていない）', '数を入れる', false)] };
      var err = v / truth - 1;
      var okm = Math.abs(err) <= q.tol;
      return {
        ok: okm, quest: q,
        rows: [
          row('答え', f(v, 3) + ' ' + q.unit, '誤差 ' + (q.tol * 100) + '% 以内', okm),
          /* 通ったときだけ真の値を見せる（外れたときに見せると測る意味がなくなる） */
          row(okm ? '真の値' : 'ずれ', okm ? f(truth, 3) + ' ' + q.unit + '（ずれ ' + f(err * 100, 1) + '%）' : (err > 0 ? '大きすぎる' : '小さすぎる'), '', true)
        ]
      };
    } catch (e) {
      return { ok: false, quest: q, rows: [row('採点できませんでした', String(e && e.message || e), '', false)] };
    }
  }

  function labelOf(q, v) {
    for (var i = 0; i < (q.options || []).length; i++) if (q.options[i][0] === v) return q.options[i][1];
    return String(v);
  }

  PX.quest = { LIST: LIST, CH: CH, byId: byId, chapterOf: chapterOf, grade: grade };
})(typeof window !== 'undefined' ? window : globalThis);
