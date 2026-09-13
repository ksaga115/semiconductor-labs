/* 課題と採点 ― すべて design 型。条件で固定する欄は check がその値かどうかも見る
 * 窓は両側から閉じるように作ってある（片側だけの課題は「上げれば通る」になって設計にならない） */
(function (global) {
  'use strict';
  var DG = global.DG || (global.DG = {});
  var M = DG.sys;

  function row(label, value, want, ok) { return { label: label, value: value, want: want, ok: !!ok }; }
  function f(v, d) { return isFinite(v) ? (+v).toFixed(d === undefined ? 2 : d) : '—'; }
  function e(v, d) { return isFinite(v) ? (+v).toExponential(d === undefined ? 2 : d) : '—'; }
  function near(a, b) { return Math.abs(a - b) <= Math.abs(b) * 1e-9 + 1e-12; }
  function locks(d, spec) {
    for (var k in spec) if (!near(d[k], spec[k])) return false;
    return true;
  }
  function lockRow(ok, text) { return row('条件固定', ok ? '守っている（' + text + '）' : '課題の条件に戻す', '', ok); }

  var CAM = { phot: 2e5, na: 1.4, nimm: 1.518, npix: 9, sigr: 1.6, bgr: 500, dark25: 10, dtc: 40 };
  var LID = { ppk: 20, pw: 5, lnm: 940, rho: 0.1, topt2: 0.8, pde: 0.2 };

  var CH = [
    { id: 1, name: '第1章　微弱光カメラ', lead: '光の予算・sCMOS と EM-CCD・AD 変換と伝送・冷却。第10部 02〜04。' },
    { id: 2, name: '第2章　LiDAR', lead: '戻る光子・昼の背景と SPAD の飽和・距離の精度と速さ。第10部 05〜07。' },
    { id: 3, name: '第3章　分光器', lead: '格子と範囲・スリットと明るさ・吸光度の雑音と校正。第10部 08・09。' }
  ];

  var LIST = [
    /* ===== 第1章 カメラ ===== */
    {
      id: 'fast', ch: 1, kind: 'design',
      name: '5 ms で SN 比 10',
      desc: '分子の光 **2×10⁵ /s**・NA 1.4 の油浸・背景 **500 e⁻/画素/s**・読み出し雑音 **1.6 e⁻**・輝点 **9 画素**の sCMOS のまま、'
          + '露光を **5 ms 以下**にして（速い動きを写すため）SN 比を **10 以上**にする。光学系の透過は **0.7 まで**、量子効率は **0.95 まで**。',
      why: '露光を半分にすると信号も背景も半分になり、基準の設計（10 ms で 13.9）は 5 ms で 9.46 に落ちる（第10部 02・03）。'
         + '光の予算は掛け算なので、透過と量子効率のどちらを上げても同じだけ効く ― <b>いちばん安く 2 倍を買える段から手をつける</b>。'
         + '読み出し雑音は露光を縮めても減らないので、暗くなるほど効いてくる。',
      hint: '5 ms で SN 比 10 には信号 ≈ 134 e⁻ が要る。量子効率 0.95 なら透過 ≥ 0.46、透過 0.7 なら量子効率 ≥ 0.62。',
      check: function (ev, d) {
        var c = ev.cam, lock = locks(d, CAM) && d.emccd === 0;
        var okT = d.texp <= 5, okS = c.snr >= 10, lim = d.topt <= 0.7 && d.qe <= 0.95;
        return {
          ok: lock && okT && okS && lim,
          rows: [
            row('SN 比', f(c.snr, 2) + '（信号 ' + f(c.S, 1) + ' e⁻・背景 ' + f(c.B, 1) + '・読み出し ' + f(c.rn2, 1) + '）', '10.00 以上', okS),
            row('露光', f(d.texp, 2) + ' ms', '5.00 以下', okT),
            row('透過 / 量子効率', f(d.topt, 2) + ' / ' + f(d.qe, 2), '0.70・0.95 まで', lim),
            lockRow(lock, 'sCMOS・2×10⁵ /s・NA 1.4・背景 500・σr 1.6・9 画素')
          ]
        };
      }
    },
    {
      id: 'dark', ch: 1, kind: 'design',
      name: '暗い輝点は EM-CCD',
      desc: '10 倍暗い色素（**5×10³ /s**）・背景 **0**・NA 1.4・透過 **0.5**・量子効率 **0.8**・読み出し雑音 **1.6 e⁻**・**9 画素**のまま、'
          + 'センサの種類と露光（**15 ms 以下**）を選んで SN 比を **2 以上**にする。',
      why: 'sCMOS の SN 比 S/√(S + B + 9σ<sub>r</sub>²) と EM-CCD の S/√(2(S + B)) は、S + B = 9σ<sub>r</sub>² ≈ 23 e⁻ で入れ替わる（第10部 03）。'
         + 'この輝点は 15 ms でも 9 e⁻ 程度で交差点より暗いので、<b>読み出し雑音の床を消せる EM-CCD が勝つ</b>。'
         + '同じ露光で sCMOS は 1.6 までしか届かない ― 部品の選定は、信号の大きさで入れ替わる。',
      hint: 'EM-CCD（センサの種類 1）なら S ≥ 8 e⁻ で SN 比 2、約 13.1 ms から。sCMOS は 19.3 ms 要るので窓の外。',
      check: function (ev, d) {
        var c = ev.cam;
        var lock = locks(d, { phot: 5e3, bgr: 0, na: 1.4, nimm: 1.518, topt: 0.5, qe: 0.8, npix: 9, sigr: 1.6, dark25: 10, dtc: 40 });
        var okT = d.texp <= 15, okS = c.snr >= 2;
        return {
          ok: lock && okT && okS,
          rows: [
            row('SN 比', f(c.snr, 3) + '（' + (d.emccd ? 'EM-CCD' : 'sCMOS') + '・信号 ' + f(c.S, 2) + ' e⁻）', '2.000 以上', okS),
            row('比べると', 'sCMOS ' + f(c.snrS, 3) + ' ／ EM-CCD ' + f(c.snrE, 3) + '（交差点 S + B = ' + f(c.cross, 1) + ' e⁻）', '', true),
            row('露光', f(d.texp, 2) + ' ms', '15.00 以下', okT),
            lockRow(lock, '5×10³ /s・背景 0・透過 0.5・QE 0.8・σr 1.6・9 画素')
          ]
        };
      }
    },
    {
      id: 'data', ch: 1, kind: 'design',
      name: '180 枚/秒を 1 本の線で',
      desc: '**2048 × 2048 画素**・飽和 **30,000 e⁻**・読み出し雑音 **1.6 e⁻** のセンサを、1 LSB を読み出し雑音の **半分以下**の細かさで AD 変換し、'
          + '**180 枚/秒以上**を CoaXPress **CXP-12 1 本（12.5 Gb/s）**で送る。',
      why: 'ビット数は雑音の床で決める ― 1 LSB を読み出し雑音より小さくすれば、量子化の雑音 LSB/√12 は床に埋もれる（第10部 04・第6部 09）。'
         + 'だがビットを増やすほどデータは増える。2048² × 16 ビット × 100 枚で 6.7 Gb/s、180 枚なら 12.1 Gb/s ― '
         + '<b>速いカメラの限界は、しばしばセンサではなく伝送</b>。',
      hint: '15 ビットでは 1 LSB = 0.92 e⁻ で細かさが足りない。16 ビットなら 0.46 e⁻。16 ビットで 12.5 Gb/s に収まるのは 186 枚/秒まで。',
      check: function (ev, d) {
        var c = ev.cam, lock = locks(d, { pxw: 2048, pxh: 2048, fwc: 30000, sigr: 1.6, link: 12.5 });
        var okL = c.lsb <= d.sigr / 2, okF = d.fps >= 180, okB = c.gbps <= d.link;
        return {
          ok: lock && okL && okF && okB,
          rows: [
            row('1 LSB', f(c.lsb, 3) + ' e⁻（' + f(d.nbit, 0) + ' ビット・量子化の雑音 ' + f(c.qnoise, 3) + ' e⁻）', '0.800 以下', okL),
            row('枚/秒', f(d.fps, 1), '180 以上', okF),
            row('データ', f(c.gbps, 2) + ' Gb/s（1 分で ' + f(c.gbPerMin, 0) + ' GB）', '12.50 以下', okB),
            lockRow(lock, '2048²・30,000 e⁻・σr 1.6・CXP-12 1 本')
          ]
        };
      }
    },
    {
      id: 'tec', ch: 1, kind: 'design',
      name: '10 秒の露光で暗電流を床の下へ',
      desc: '**10 秒**の露光で、1 画素の暗電流を読み出し雑音の二乗（**2.56 e⁻**）以下にする。暗電流は冷やす前 **10 e⁻/画素/s**（仮定）で、'
          + '**約 9 ℃ ごとに 2 倍**。TEC は Q<sub>max</sub> **10 W**・ΔT<sub>max</sub> **70 K** で、熱負荷 **1.5 W** を吸えなければならない。',
      why: '暗電流は露光の長さに比例するので、短い露光では無視できても長い露光で支配項になる（第10部 04）。冷やすほど暗電流は指数関数的に減るが、'
         + 'TEC が吸える熱は Q<sub>max</sub>(1 − ΔT/ΔT<sub>max</sub>) で、温度差を広げるほど減る（第8部 05）― <b>窓は両側から閉じる</b>。'
         + '冷却の目標温度は、露光の長さから決まる。',
      hint: '10 秒で 2.56 e⁻ には 0.256 e⁻/s、10 × 2^(−ΔT/9) ≤ 0.256 から ΔT ≥ 47.6 K。熱負荷 1.5 W には ΔT ≤ 59.5 K。',
      check: function (ev, d) {
        var c = ev.cam, lock = locks(d, { texp: 10000, dark25: 10, sigr: 1.6, qmax: 10, dtmax: 70, qload: 1.5 });
        var okD = c.darkExp <= d.sigr * d.sigr + 1e-12, okQ = c.qc >= d.qload;
        return {
          ok: lock && okD && okQ,
          rows: [
            row('10 秒の暗電流', f(c.darkExp, 3) + ' e⁻/画素（' + f(c.darkRate, 4) + ' e⁻/s）', '2.560 以下', okD),
            row('TEC が吸える熱', f(c.qc, 2) + ' W（ΔT ' + f(d.dtc, 1) + ' K）', '1.50 以上', okQ),
            lockRow(lock, '10 s・10 e⁻/s・σr 1.6・10 W / 70 K・1.5 W')
          ]
        };
      }
    },

    /* ===== 第2章 LiDAR ===== */
    {
      id: 'range', ch: 2, kind: 'design',
      name: '300 m で 1 パルス 30 個',
      desc: '尖頭値 **20 W**・幅 **5 ns**・**940 nm**・反射率 **10%**・受光の透過 **0.8**・検出効率 **0.2** のまま、'
          + '受光口の直径（**50 mm まで**）で、**300 m** 先の物体から 1 パルスあたり **30 個以上**を検出する。',
      why: '戻る割合は ρ/π · A/R² ― 距離が 1.5 倍で 1/2.25 になる（第10部 05）。パルスを強くすれば取り戻せるが、'
         + 'パルスのエネルギーと平均の出力は目の安全のクラスで上限が決まる（第8部 12）。<b>距離を延ばす方法は「強く出す」より「大きく受ける」が先</b>。',
      hint: '200 m・25 mm で 29.6 個。300 m では同じ口径で 13.1 個 ― 面積を 2.28 倍、直径を 1.51 倍の 37.8 mm 以上に。',
      check: function (ev, d) {
        var l = ev.lid, lock = locks(d, LID) && near(d.rng, 300);
        var okN = l.nsig >= 30, lim = d.dap <= 50;
        return {
          ok: lock && okN && lim,
          rows: [
            row('1 パルスの検出数', f(l.nsig, 2) + ' 個（戻る割合 ' + e(l.geo) + '）', '30.00 以上', okN),
            row('受光口', f(d.dap, 1) + ' mm（' + f(l.areaCm2, 2) + ' cm²）', '50.0 以下', lim),
            lockRow(lock, '20 W・5 ns・940 nm・ρ 0.1・300 m・0.8・0.2')
          ]
        };
      }
    },
    {
      id: 'sun', ch: 2, kind: 'design',
      name: '昼の背景で SPAD を飽和させない',
      desc: '太陽 **0.3 W/(m²·nm)**・反射率 **10%**・受光口 **25 mm**・不感時間 **10 ns** の SPAD のまま、フィルタの幅と瞬時視野で、'
          + 'r·τ<sub>d</sub> を **0.3 以下**にする。フィルタは **5 nm 以上**（VCSEL の波長が温度で動くぶんの余裕）、視野は **0.03° 以上**（ビームとの位置合わせ）。',
      why: '最初の設計（20 nm・0.1°）では背景が 2.16×10⁸ /s、r·τ<sub>d</sub> = 2.16 で、SPAD は時間の 2/3 以上を不感時間として過ごし、'
         + '遠くの反射に応えられない（第10部 06）。背景は Δλ と Ω（視野の二乗）に比例し、<b>信号は受光口の面積だけで決まるので変わらない</b>。'
         + 'だが狭くしすぎると、温度で動く波長や、ずれたビームを取り逃す ― 窓。',
      hint: 'フィルタ 10 nm（÷2）・視野 0.05°（÷4）で 1/8 の 2.7×10⁷ /s、r·τ<sub>d</sub> = 0.27。5 nm なら視野 0.074° まで。',
      check: function (ev, d) {
        var l = ev.lid, lock = locks(d, LID) && locks(d, { dap: 25, esun: 0.3, taud: 10 });
        var okR = l.rtd <= 0.3, lim = d.dlf >= 5 && d.ifov >= 0.03;
        return {
          ok: lock && okR && lim,
          rows: [
            row('r·τd', f(l.rtd, 3) + '（背景 ' + e(l.rbg) + ' /s・数えられるのは ' + e(l.counted) + '）', '0.300 以下', okR),
            row('フィルタ / 視野', f(d.dlf, 1) + ' nm / ' + f(d.ifov, 3) + '°', '5 nm 以上・0.03° 以上', lim),
            row('1 パルスの信号（変わらない）', f(l.nsig, 1) + ' 個', '', true),
            lockRow(lock, '0.3 W/(m²·nm)・ρ 0.1・25 mm・10 ns')
          ]
        };
      }
    },
    {
      id: 'dead', ch: 2, kind: 'design',
      name: '不感時間を選ぶ',
      desc: '改善後の設計（フィルタ **10 nm**・視野 **0.05°**、背景 2.7×10⁷ /s）のまま、SPAD の不感時間で r·τ<sub>d</sub> を **0.3 以下**にする。'
          + 'ただし不感時間は **5 ns 以上**（それより短いとアフターパルスが増える、と仮定）。',
      why: '不感時間を延ばすとアフターパルス（増倍のあとに捕まった電荷が遅れて出す偽の信号）は減るが、背景で埋まりやすくなる（第10部 06 の例題: 40 ns で r·τ<sub>d</sub> = 1.08）。'
         + '<b>同じ SPAD が、昼に失格で夜に合格する</b> ― 性能表に照度の条件が書かれる理由。',
      hint: '0.3 / 2.7×10⁷ = 11.1 ns。窓は 5〜11.1 ns。',
      check: function (ev, d) {
        var l = ev.lid, lock = locks(d, LID) && locks(d, { dap: 25, esun: 0.3, dlf: 10, ifov: 0.05 });
        var okR = l.rtd <= 0.3, lim = d.taud >= 5;
        return {
          ok: lock && okR && lim,
          rows: [
            row('r·τd', f(l.rtd, 3), '0.300 以下', okR),
            row('不感時間', f(d.taud, 2) + ' ns', '5.00 以上', lim),
            lockRow(lock, '10 nm・0.05°・25 mm・ρ 0.1')
          ]
        };
      }
    },
    {
      id: 'prec', ch: 2, kind: 'design',
      name: '200 m で 2 cm を 0.1 ms で',
      desc: '基準の装置（200 m・反射率 10%・25 mm・20 W・5 ns・揺らぎ 0.1 ns）のまま、積むパルスの数と繰り返しで、距離のばらつきを **2 cm 以下**、'
          + '1 点にかかる時間を **0.1 ms 以下**にする。あいまいさのない距離 c/(2f) は **300 m 以上**（繰り返しは 499.6 kHz まで）。',
      why: '1 個の光子の到着時刻のばらつきは √((5/2.355)² + 0.1²) = 2.13 ns、距離で 32 cm。重心を N 個で求めると 1/√N で縮む（第10部 07・第0部 02）。'
         + 'パルスを増やせば細かくなるが時間がかかり、繰り返しを上げれば速くなるが、次のパルスとの取り違え（c/2f）が近づく ― <b>精度・速さ・距離の三すくみ</b>。',
      hint: '(32/2)² ≈ 256 個、1 パルス 29.6 個なので 9 パルス。100 kHz なら 0.09 ms。',
      check: function (ev, d) {
        var l = ev.lid;
        var lock = locks(d, LID) && locks(d, { rng: 200, dap: 25, jit: 0.1 });
        var okP = l.sigNcm <= 2, okT = l.tptMs <= 0.1, okA = l.runambM >= 300;
        return {
          ok: lock && okP && okT && okA,
          rows: [
            row('距離のばらつき', f(l.sigNcm, 3) + ' cm（' + f(l.ntot, 0) + ' 光子・1 光子で ' + f(l.sig1cm, 1) + ' cm）', '2.000 以下', okP),
            row('1 点の時間', f(l.tptMs, 4) + ' ms（' + f(d.npulse, 0) + ' パルス・' + f(d.frep, 1) + ' kHz）', '0.1000 以下', okT),
            row('あいまいさのない距離', f(l.runambM, 0) + ' m', '300 以上', okA),
            lockRow(lock, '200 m・ρ 0.1・25 mm・20 W・5 ns・0.1 ns')
          ]
        };
      }
    },

    /* ===== 第3章 分光器 ===== */
    {
      id: 'grat', ch: 3, kind: 'design',
      name: '格子の本数で範囲と分解能を両立',
      desc: '**400〜1,000 nm** を **512 画素 × 25 µm（12.8 mm）** のセンサに全部収めたまま、分解能の目安を **2.45 nm 以下**にする。'
          + '入射角 **15°**・焦点距離 **50 mm**・スリット **25 µm** は固定。',
      why: '本数を増やすと逆線分散が小さくなって分解能は良くなるが、同じ範囲がセンサの上で長く伸び、端がはみ出す（第10部 08・第7部 11）。'
         + '位置は x = f·tan(β − β<sub>中心</sub>) で、格子方程式の sin とこの tan のために等間隔ではない ― 端の余裕は式で確かめる。'
         + '<b>範囲と分解能は、同じセンサの長さを取り合う</b>。',
      hint: '400 本/mm で全長 12.09 mm・2.50 nm。約 408 本/mm から 2.45 nm 以下、約 421 本/mm を超えると 1,000 nm がはみ出す。',
      check: function (ev, d) {
        var p = ev.sp, lock = locks(d, { lamlo: 400, lamhi: 1000, npx: 512, pxum: 25, alpha: 15, fmm: 50, slitum: 25 });
        var okF = p.fits, okR = p.res <= 2.45;
        return {
          ok: lock && okF && okR,
          rows: [
            row('分解能の目安', f(p.res, 3) + ' nm（逆線分散 ' + f(p.recip, 2) + ' nm/mm）', '2.450 以下', okR),
            row('センサの上の位置', f(p.xlo, 2) + ' 〜 ' + f(p.xhi, 2) + ' mm（全長 ' + f(p.span, 2) + '）', '±6.40 の中', okF),
            row('次数の重なり', p.overlap ? '2 次が重なる → 次数カットフィルタが要る' : '重ならない', '', true),
            lockRow(lock, '400〜1,000 nm・512 × 25 µm・15°・50 mm・25 µm')
          ]
        };
      }
    },
    {
      id: 'slit', ch: 3, kind: 'design',
      name: 'スリットで明るさを稼ぐ',
      desc: '基準の分光器（400 本/mm・f 50 mm・F 4・コア **200 µm**・NA **0.22** のファイバ）のまま、スリットの幅で、ファイバから入る光を **10% 以上**にし、'
          + '分解能の目安を **2.5 nm 以下**に保つ。',
      why: 'スリットが切り出すのはコアの面積の一部で、角度でも (NA<sub>分光器</sub>/NA<sub>ファイバ</sub>)² しか受けられない ― 基準の設計では合わせて約 5%（第10部 08、エテンデュの関所）。'
         + 'スリットを広げると光は比例して増えるが、スリットの像が 2 画素の幅を超えたところから分解能がそのまま悪くなる。<b>明るさと分解能の取り合いを、要求で決める</b>。',
      hint: '25 µm で 5.1%。48.7 µm で 10%、50 µm（2 画素）までは分解能の目安 2.50 nm のまま。',
      check: function (ev, d) {
        var p = ev.sp;
        var lock = locks(d, { lpmm: 400, alpha: 15, fmm: 50, pxum: 25, npx: 512, lamlo: 400, lamhi: 1000, fibum: 200, nafib: 0.22, fnum: 4 });
        var okT = p.thru >= 0.10, okR = p.res <= 2.5 + 1e-9;
        return {
          ok: lock && okT && okR,
          rows: [
            row('入る光', f(p.thru * 100, 2) + ' %（スリット ' + f(p.slitFrac * 100, 1) + ' % × 角度 ' + f(p.angFrac * 100, 1) + ' %）', '10.00 以上', okT),
            row('分解能の目安', f(p.res, 3) + ' nm', '2.500 以下', okR),
            lockRow(lock, '400 本/mm・50 mm・F 4・200 µm・NA 0.22')
          ]
        };
      }
    },
    {
      id: 'absorb', ch: 3, kind: 'design',
      name: '吸光度の雑音を 1×10⁻⁴ に',
      desc: '1 画素に **10⁵ 電子**を貯める露光（**5 ms**）のまま、平均の回数で、ショット雑音による吸光度の雑音を **1.0×10⁻⁴ 以下**にし、'
          + '測定を **1 秒以内**に終える。',
      why: 'δA = 0.434 × δT/T、ショット雑音だけなら δT/T = 1/√N（第10部 09）。10⁵ 電子で 1.4×10⁻³、平均で 1/√(回数) ずつ減る。'
         + '回数を増やすほど時間がかかる ― <b>雑音を半分にするには 4 倍の時間</b>。',
      hint: '(0.434/(10⁻⁴ × √10⁵))² = 188.6 → 189 回以上。5 ms × 200 回 = 1 秒が上限。',
      check: function (ev, d) {
        var p = ev.sp, lock = locks(d, { ne: 1e5, tint: 5 });
        var okA = p.dAavg <= 1e-4, okT = p.tmeasS <= 1 + 1e-12;
        return {
          ok: lock && okA && okT,
          rows: [
            row('吸光度の雑音', e(p.dAavg, 3) + '（1 回で ' + e(p.dA1, 2) + '）', '1.00e-4 以下', okA),
            row('測定の時間', f(p.tmeasS, 3) + ' s（' + f(d.navg, 0) + ' 回）', '1.000 以下', okT),
            lockRow(lock, '10⁵ 電子・5 ms')
          ]
        };
      }
    },
    {
      id: 'calib', ch: 3, kind: 'design',
      name: '波長の目盛りまで含めた不確かさ',
      desc: '波長の校正の残差 **0.05 nm**・1 画素 **10⁵ 電子**・**5 ms** のまま、平均の回数と「測る場所の吸収スペクトルの傾き」を選んで、'
          + 'ショット雑音と波長のずれの誤差を二乗和で合わせた不確かさを **2.0×10⁻⁴ 以下**にし、**1 秒以内**に測る。',
      why: '吸収の坂の上では、波長が δλ ずれるだけで吸光度が 傾き × δλ 変わる（第10部 09、第8部 10 の感度係数）。0.01 AU/nm の坂で 0.1 nm ずれると 0.001 ― ショット雑音の 7 倍。'
         + '平均を増やしてもこの項は減らない。<b>吸収の山の頂上（傾きが小さい場所）で測る</b>ことが、光子を集めるより先に効く。',
      hint: '200 回でショット雑音 9.7×10⁻⁵。残りの予算 √(2² − 0.97²)×10⁻⁴ = 1.75×10⁻⁴ を 0.05 nm で割って、傾き 0.0035 AU/nm 以下の場所で。',
      check: function (ev, d) {
        var p = ev.sp, lock = locks(d, { ne: 1e5, tint: 5, dlcal: 0.05 });
        var okU = p.uA <= 2e-4, okT = p.tmeasS <= 1 + 1e-12;
        return {
          ok: lock && okU && okT,
          rows: [
            row('合わせた不確かさ', e(p.uA, 3), '2.00e-4 以下', okU),
            row('内訳 ショット / 波長のずれ', e(p.dAavg, 2) + ' / ' + e(p.calErr, 2) + '（傾き ' + f(d.slope, 4) + ' AU/nm）', '', true),
            row('測定の時間', f(p.tmeasS, 3) + ' s', '1.000 以下', okT),
            lockRow(lock, '0.05 nm・10⁵ 電子・5 ms')
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
      var r = q.check(M.evaluate(st.design), st.design);
      r.quest = q;
      return r;
    } catch (err) {
      return { ok: false, quest: q, rows: [row('採点できませんでした', String(err && err.message || err), '', false)] };
    }
  }

  DG.quest = { LIST: LIST, CH: CH, byId: byId, chapterOf: chapterOf, grade: grade };
})(typeof window !== 'undefined' ? window : globalThis);
