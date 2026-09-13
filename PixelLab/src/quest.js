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
    { id: 3, name: '第3章　SemiLab とつなぐ', lead: '量子効率は SemiLab のフォトダイオードで解いている。赤外は層の厚みで決まる。' },
    { id: 4, name: '第4章　動き・細かさ・時間', lead: 'ローリングシャッタの歪み、グローバルシャッタの寄生感度、画素を細かくする限界、TDI の段数。第4部の読み出し・回折の節と同じ式。' },
    { id: 5, name: '第5章　つなぎ目・冷却の残り・数える画素', lead: 'HDR のつなぎ目の SN 比、欠陥の成分が残る冷却、SPAD の数え落としと距離のばらつき。第4部の例題（ダイナミックレンジを広げる・付録 C・SPAD）と同じ式。' }
  ];

  function near(a, b) { return Math.abs(a - b) <= Math.abs(b) * 1e-9 + 1e-12; }
  function lockRow(ok, text) { return row('条件固定', ok ? '守っている（' + text + '）' : '課題の条件に戻す', '', ok); }
  var PLS_THRESH = 1.5;             /* 寄生の電子の目安: 既定の設計の読み出し雑音（1.50 e⁻） */

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
         + '**約 9℃（300 K 付近で 8.6 K）下げるごとに半分**になる。天体用のカメラが冷やしてあるのはこのため。',
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
    },

    /* ===== 第4章 ===== */
    {
      id: 'roll', ch: 4, kind: 'design',
      name: 'ローリングシャッタの歪みを抑える',
      desc: '**3000 行**・AD のクロック **1 GHz**（単一傾斜）のセンサで、**600 画素/s** で横に動く物体の上端と下端の横ずれを **2.5 画素以下**にする。'
          + 'AD は **12 bit 以上**のまま、同時に読む行（列回路の組）は **4 組まで**。',
      why: '行を 1 本ずつ順に読むので、上端と下端では 行数 × 1 行の時間 だけ撮った時刻がずれ、そのあいだに動いた分だけ像が斜めに歪む（第4部 ローリングシャッターの正体）。'
         + '単一傾斜の AD は 2^bits 回数えるので、**桁を増やすほど 1 行が遅くなる** ― 12 bit・1 GHz で 4.1 µs、3000 行で 12.3 ms、600 画素/s なら 7.4 画素ずれる。'
         + '桁を落とさずに速くするには、列回路を増やして何行も同時に読むしかない。',
      hint: '同時に読む行を 3 にすると 4.1 ms で 2.46 画素、4 にすると 3.1 ms で 1.84 画素。2 では 3.7 画素で足りない。',
      check: function (ev, d) {
        var lock = near(d.rows, 3000) && near(d.fclk, 1000) && near(d.vpx, 600);
        var okS = ev.skew <= 2.5, okB = d.bits >= 12, okC = d.colpar <= 4;
        return {
          ok: lock && okS && okB && okC,
          rows: [
            row('上端と下端の横ずれ', f(ev.skew, 2) + ' 画素（時間差 ' + f(ev.tRead * 1e3, 2) + ' ms）', '2.50 以下', okS),
            row('1 行の時間', f(ev.tRow * 1e6, 3) + ' µs（AD の変換 ' + f(ev.tAdc * 1e6, 3) + ' µs）', '', true),
            row('AD の桁 / 同時に読む行', d.bits + ' bit / ' + f(d.colpar, 0), '12 bit 以上・4 以下', okB && okC),
            lockRow(lock, '3000 行・1 GHz・600 画素/s')
          ]
        };
      }
    },
    {
      id: 'gs', ch: 4, kind: 'design', flux: 1e6,
      name: 'グローバルシャッタの寄生感度',
      desc: 'グローバルシャッタにした 3.0 µm 画素（既定の画素・550 nm・12 bit・3000 行・1 GHz）で、画面に **10⁶ 光子/µm²/s** の明るい光源があるとき、'
          + '最後に読まれる行の退避した電荷に混ざる偽の信号を **1.5 e⁻（既定の読み出し雑音）以下**にする。分離比は **100 dB まで**、同時に読む行は **4 組まで**。',
      why: 'グローバルシャッタは全画素の電荷を同時に画素の中へ退避させ、あとで順に読む。**退避しているあいだにも光が漏れ込む** ― その割合が寄生感度で、分離比 10⁻⁴ なら 80 dB（第4部）。'
         + '最後の行は読み出しの全時間を待つので、漏れ込む量は 分離比 × 光 × 待ち時間。遮光を良くするか、読み出しを速くして待ち時間を縮める。',
      hint: '既定（80 dB・12.3 ms）で 8.4 e⁻。同時に読む行 1 のままなら 95 dB 以上、4 にすれば（3.1 ms）83 dB 以上で届く。',
      check: function (ev, d) {
        var q = byId('gs');
        var lock = near(d.pitch, 3) && near(d.pdFrac, 0.5) && d.ml && near(d.epi, 3) && near(d.nm, 550)
          && d.bits === 12 && near(d.rows, 3000) && near(d.fclk, 1000);
        var e = PIX.parasitic(ev, q.flux);
        var okE = e <= PLS_THRESH, okP = d.pls <= 100, okC = d.colpar <= 4;
        return {
          ok: lock && okE && okP && okC,
          rows: [
            row('最後の行に混ざる偽の信号', f(e, 3) + ' e⁻', '1.500 以下', okE),
            row('分離比', f(d.pls, 1) + ' dB（' + ev.plsRatio.toExponential(2) + '）', '100 以下', okP),
            row('待ち時間（読み出しの全時間）', f(ev.tRead * 1e3, 2) + ' ms（同時に読む行 ' + f(d.colpar, 0) + '）', '4 組以下', okC),
            lockRow(lock, '3.0 µm・550 nm・12 bit・3000 行・1 GHz')
          ]
        };
      }
    },
    {
      id: 'pitch', ch: 4, kind: 'design', flux: 20000, t: 0.01, width: 6.0,
      name: '画素を細かくする限界',
      desc: '幅 **6.0 mm** のセンサに横 **2400 画素以上**を並べ、**F8**・**550 nm** のレンズで回折の限界（λN/2）より細かくしない。'
          + 'さらに光子束 **2×10⁴ 光子/µm²/s**・露光 **10 ms** で S/N **25 以上**（既定の画素の作り）。',
      why: '画素を細かくすると解像の目盛りは増えるが、光も井戸も面積に比例して減る ― 小さい画素は S/N で損をする。'
         + 'さらに回折の遮断周波数 1/(λN) がナイキスト 1/(2p) より低くなると、**それより細かい画素は何も新しく写さない**（第4部: 3.0 µm なら F10.9 から先）。'
         + '画素数（上限）と、S/N と回折（下限）の窓の中にしか答えはない。',
      hint: '2400 画素には 2.5 µm 以下。F8・550 nm の λN/2 は 2.2 µm。S/N 25 は約 2.1 µm から。窓は 2.2〜2.5 µm。',
      check: function (ev, d) {
        var q = byId('pitch');
        var lock = near(d.fnum, 8) && near(d.nm, 550) && near(d.pdFrac, 0.5) && d.ml && near(d.epi, 3)
          && near(d.cfd, 2) && near(d.sf, 120) && d.cds && near(d.fwd, 1500);
        var count = q.width * 1000 / d.pitch;
        var S = PIX.signal(ev, q.flux, q.t), s = PIX.snr(ev, S, q.t);
        var okN = count >= 2400 - 1e-9, okD = d.pitch >= ev.pDiff - 1e-9, okS = s >= 25;
        return {
          ok: lock && okN && okD && okS,
          rows: [
            row('横の画素数', f(count, 0) + '（ピッチ ' + f(d.pitch, 2) + ' µm）', '2400 以上', okN),
            row('回折の限界 λN/2', f(ev.pDiff, 3) + ' µm（エアリー円板 ' + f(ev.airy, 2) + ' µm）', 'ピッチがこれ以上', okD),
            row('S/N', f(s, 2) + '（信号 ' + f(S, 0) + ' e⁻）', '25.00 以上', okS),
            lockRow(lock, 'F8・550 nm・既定の画素の作り')
          ]
        };
      }
    },
    {
      id: 'tdi', ch: 4, kind: 'design',
      name: 'TDI の段数を決める',
      desc: '1 段で **5 e⁻** しか溜まらない暗いライン撮像で、段を重ねて S/N を **20 以上**にする。物体の速さと行の送りは **1%** ずれているので、'
          + '段数ぶんのにじみを **1 画素以下**に抑える。読み出し雑音は既定の画素（1.50 e⁻）。',
      why: 'TDI は、物体の動きに合わせて電荷を行から行へ送り、同じ点を N 回撮って足す。信号は N 倍、ショット雑音は √N 倍。'
         + '**CCD のように電荷で足せば読み出し雑音は最後に 1 回**、CMOS のようにデジタルで足すと **N 回ぶん**乗る（第10部 03 の EM-CCD と sCMOS の違いと同じ構図）。'
         + 'だが段を増やすほど、速さのずれが N 倍に積もってにじむ ― 窓。',
      hint: '電荷で足す（TDI の足し方 1）なら 81 段から S/N 20。1% のずれで 100 段までなら 1 画素。デジタル（0）では 100 段でも 18.6 で届かない。',
      check: function (ev, d) {
        var lock = near(d.tdiS1, 5) && near(d.tdiSync, 1) && near(d.cfd, 2) && near(d.sf, 120) && d.cds;
        var okS = ev.tdiSnr >= 20, okM = ev.tdiSmear <= 1 + 1e-9;
        return {
          ok: lock && okS && okM,
          rows: [
            row('S/N', f(ev.tdiSnr, 2) + '（' + f(d.tdiN, 0) + ' 段・' + (d.tdiMode ? '電荷で足す' : 'デジタルで足す') + '）', '20.00 以上', okS),
            row('にじみ', f(ev.tdiSmear, 2) + ' 画素', '1.00 以下', okM),
            row('信号 / 読み出し雑音の分散', f(ev.tdiSig, 0) + ' e⁻ / ' + f((d.tdiMode ? 1 : d.tdiN) * ev.read * ev.read, 1) + ' e⁻²', '', true),
            lockRow(lock, '1 段 5 e⁻・ずれ 1%・既定の読み出し回路')
          ]
        };
      }
    },

    /* ===== 第5章 ===== */
    {
      id: 'seam', ch: 5, kind: 'design',
      name: 'HDR の露光比の窓',
      desc: '既定の画素（3.0 µm・浮遊拡散 2 fF・12 bit）のまま、長短合成の露光比で、合成のダイナミックレンジを **88 dB 以上**にし、'
          + 'つなぎ目の短い露光側の SN 比を **30 以上**に保つ。',
      why: '合成は天井を 20log₁₀R だけ上げる。だが長い露光が飽和する直前から短い露光に切り替えると、同じ明るさが 1/R の電子で表されるので、'
         + 'SN 比がそこで √R 近く落ちる（第4部「ダイナミックレンジを広げる」の例題: 1:16 で 109.5 → 27.3）。'
         + '**比を大きくするほど天井は上がり、つなぎ目の段差は深くなる** ― 窓。',
      hint: '単発は 72.6 dB。88 dB には R ≥ 5.9、つなぎ目の SN 比 30 には R ≤ 7.5（長い側は 82.1）。',
      check: function (ev, d) {
        var lock = near(d.pitch, 3) && near(d.pdFrac, 0.5) && near(d.fwd, 1500) && near(d.cfd, 2) && near(d.sf, 120)
          && d.cds && d.bits === 12 && near(d.offset, 64);
        var okD = ev.drH >= 88, okS = ev.seamShort >= 30, lim = ev.hdrR <= 16 + 1e-9;
        return {
          ok: lock && okD && okS && lim,
          rows: [
            row('合成のダイナミックレンジ', f(ev.drH, 2) + ' dB（単発 ' + f(ev.dr, 1) + ' + ' + f(20 * Math.log10(ev.hdrR), 1) + '）', '88.00 以上', okD),
            row('つなぎ目の SN 比（短い側）', f(ev.seamShort, 2) + '（長い側 ' + f(ev.seamLong, 1) + '、' + f(ev.seamDb, 1) + ' dB）', '30.00 以上', okS),
            row('露光比', f(ev.hdrR, 2) + ':1', '16:1 以下', lim),
            lockRow(lock, '既定の画素・12 bit')
          ]
        };
      }
    },
    {
      id: 'defect', ch: 5, kind: 'design', t: 60,
      name: '冷やしても残る暗電流',
      desc: '既定の画素に、欠陥の準位を通る暗電流 **10 pA/cm²**（60℃、見かけの E<sub>a</sub> 0.35 eV・仮定）が加わった。'
          + '露光 **60 秒**で、暗電流のショットノイズを**読み出し雑音以下**にする。冷却は **−40℃ まで**。',
      why: '空乏層の生成電流（∝ ni、見かけの E<sub>a</sub> ≈ 0.6 eV）は冷やせば約 9℃（300 K 付近で 8.6 K）ごとに半分になるが、E<sub>a</sub> の小さい欠陥の成分は、'
         + '同じだけ冷やしても減り方が鈍い（第4部 付録C の例題: 27 → −5℃ で生成は 1/16、欠陥は 1/5）。'
         + '冷やすほど**欠陥の成分が支配項に入れ替わり**、必要な冷却が一気に深くなる ― 白キズが冷却で消え切らないのと同じ理由。',
      hint: '欠陥の成分が無ければ約 −10℃ で足りる（「冷やして長く撮る」と同じ）。10 pA/cm² があると約 −29℃ まで要る。窓は −40〜−29℃。',
      check: function (ev, d) {
        var q = byId('defect');
        var lock = near(d.jd, 50) && near(d.jdDef, 10) && near(d.pitch, 3) && near(d.pdFrac, 0.5)
          && near(d.cfd, 2) && near(d.sf, 120) && d.cds;
        var ds = Math.sqrt(ev.dark * q.t);
        var okD = ds <= ev.read, okT = d.T >= -40;
        return {
          ok: lock && okD && okT,
          rows: [
            row('暗電流のショット（60 秒）', f(ds, 3) + ' e⁻', '読み出し雑音 ' + f(ev.read, 3) + ' e⁻ 以下', okD),
            row('温度', f(d.T, 1) + ' ℃', '−40℃ 以上', okT),
            row('内訳 生成 / 欠陥', ev.darkGen.toPrecision(3) + ' / ' + ev.darkDef.toPrecision(3) + ' e⁻/s', '', true),
            lockRow(lock, '生成 50・欠陥 10 pA/cm²・既定の読み出し回路')
          ]
        };
      }
    },
    {
      id: 'spad', ch: 5, kind: 'design',
      name: 'SPAD の不感時間と積む光子',
      desc: '**10⁷ 光子/s** が来る SPAD（時刻の揺らぎ **100 ps**）で、数え落としを **10% 以下**、距離のばらつきを **2 mm 以下**にする。'
          + '不感時間は **5 ns 以上**（アフターパルスを抑えるため・仮定）、積む光子は **100 個まで**（1 点に使える時間の上限・仮定）。',
      why: '不感時間の間に来た光子を無視する型では、数えられるのは r/(1 + rτ<sub>d</sub>)。20 ns なら 16.7% を数え落とす（第4部 SPAD の例題）。'
         + '短くすれば数え落としは減るが、アフターパルスが増える。距離のばらつきは c·σ/2 = 1.5 cm で、N 光子の重心なら 1/√N ― '
         + '**不感時間と光子数の 2 つの窓**を同時に選ぶ。',
      hint: '10% には τ<sub>d</sub> ≤ 11.1 ns。2 mm には N ≥ 57（56 では 2.003 mm）。',
      check: function (ev, d) {
        var lock = near(d.spadRate, 1e7) && near(d.spadJit, 100);
        var okL = ev.spadLoss <= 0.10, okT = d.spadTd >= 5, okS = ev.spadSigN <= 0.2, okN = d.spadN <= 100;
        return {
          ok: lock && okL && okT && okS && okN,
          rows: [
            row('数え落とし', f(ev.spadLoss * 100, 2) + ' %（rτ = ' + f(ev.spadRtd, 3) + '）', '10.00 以下', okL),
            row('不感時間', f(d.spadTd, 2) + ' ns', '5.00 以上', okT),
            row('距離のばらつき', f(ev.spadSigN * 10, 3) + ' mm（1 光子で ' + f(ev.spadSig1, 2) + ' cm）', '2.000 以下', okS),
            row('積む光子', f(d.spadN, 0) + ' 個', '100 以下', okN),
            lockRow(lock, '10⁷ 光子/s・揺らぎ 100 ps')
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
