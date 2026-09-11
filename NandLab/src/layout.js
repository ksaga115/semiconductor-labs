/* 配置の自動整列
 *
 * 手で並べた回路は、繋ぎ足していくうちに線が交差して読めなくなる。
 * それを「信号は左から右へ流れる」形に並べ直す。
 *
 * 段取りは層状グラフ描画の定石そのまま:
 *   1. 段を決める   ― 上流から数えて何段目か。これがそのまま列（x）になる
 *   2. 並びを決める ― 同じ列の中の上下。交差が減るように何度か掃く
 *   3. 位置を決める ― 配線が水平になる y に寄せ、重なる分だけ押し戻す
 *
 * 【寸法を外から貰う理由】部品の大きさと端子の位置は画面（ui.js）の持ち物。
 * ここで同じ計算をもう一度書くと、片方を直したときにもう片方がずれて
 * 「整えたのに線が斜め」になる。metrics として ui.js の当たり判定と同じ関数を渡す。
 *
 * 【端子が 10 の格子に載ることに乗っかっている】部品の高さは 20 の倍数、
 * 端子の y は 10 の倍数（ui.js の寸法の規則）。だから望みの y を 10 に丸めておけば、
 * 押し戻し（GAP_Y も 10 の倍数）を通っても端子どうしはぴったり揃い、線が真横になる。
 *
 * 【フィードバックは直せない】ラッチは輪になっているので、どう並べても
 * 右から左へ戻る線が残る。後ろ向きの辺は段を決めるときだけ外し、
 * 並びと y の計算には使う（戻り先の近くに置きたいので）。
 */
(function (global) {
  'use strict';
  var NL = global.NL || (global.NL = {});

  var GRID = 10;
  var GAP_X = 60;      /* 列と列のすきま。配線が折れる余地がこれだけ要る */
  var GAP_Y = 20;      /* 同じ列で上下に並ぶ部品のすきま */
  var GAP_BAND = 60;   /* 繋がっていない別の塊とのすきま */
  var SWEEPS = 4;      /* 交差減らしの往復回数 */
  var PASSES = 4;      /* y の寄せ直しの往復回数 */
  var MAX_LANES = 4000;/* 通し道の上限。とんでもない回路で固まる前に止める */

  function snap(v) { return Math.round(v / GRID) * GRID; }

  function median(a) {
    a = a.slice().sort(function (x, y) { return x - y; });
    var m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /**
   * 整列した結果の座標を返す。回路そのものには触らない（入れるのは呼んだ側）。
   *
   * @param circuit  netlist の回路
   * @param lib      チップの定義
   * @param metrics  { sizeOf(part, lib), portXY(part, lib, side, i) } ― ui.js の geom
   * @param opts     { ids: [部品id] } を渡すと、その部品だけを整える
   * @return         { 部品id: {x, y} } / 整えようがなければ null
   */
  function arrange(circuit, lib, metrics, opts) {
    opts = opts || {};
    var ids = [], id, i;
    if (opts.ids) {
      for (i = 0; i < opts.ids.length; i++) if (circuit.parts[opts.ids[i]]) ids.push(+opts.ids[i]);
    } else {
      for (id in circuit.parts) ids.push(+id);
    }
    if (ids.length < 2) return null;

    var node = {}, mine = {};
    ids.forEach(function (n) {
      var p = circuit.parts[n], s = metrics.sizeOf(p, lib);
      node[n] = { id: n, p: p, w: s.w, h: s.h, ins: [], outs: [], layer: 0, y: p.y };
      mine[n] = true;
    });
    /* 端子の、部品の左上からの縦のずれ。通し道は点なので 0 */
    function dy(n, side, k) {
      if (node[n].lane) return 0;
      var p = node[n].p;
      return metrics.portXY(p, lib, side, k).y - p.y;
    }

    var edges = [];
    for (var wid in circuit.wires) {
      var w = circuit.wires[wid];
      if (!mine[w.from.part] || !mine[w.to.part]) continue;
      var e = { id: w.id, u: +w.from.part, v: +w.to.part, up: w.from.port, vp: w.to.port, back: false, lanes: null };
      edges.push(e);
      node[e.u].outs.push(e);
      node[e.v].ins.push(e);
    }

    markBackEdges(ids, node);
    layerize(ids, node);

    var comps = components(ids, node, edges);
    comps.forEach(function (c) { tidyLayers(c, node, circuit); });

    /* 列の x は塊をまたいで共通にする。塊ごとに決めると列が互い違いになって読みにくい */
    var colX = columnX(ids, node);

    var band = 0, seq = { n: 0 };
    comps.forEach(function (c) {
      var all = addLanes(c, node, seq);          /* 実部品＋長い線のための通し道 */
      var cols = orderColumns(all, node);
      placeY(cols, node, dy);
      var lo = 1e9, hi = -1e9;
      all.forEach(function (n) { lo = Math.min(lo, node[n].y); hi = Math.max(hi, node[n].y + node[n].h); });
      var d = band - lo;
      all.forEach(function (n) { node[n].y = snap(node[n].y + d); });
      band += (hi - lo) + GAP_BAND;
    });

    /* 元あった場所の左上に戻す。整えるたびに画面の外へ飛んでいかないように */
    var ox = 1e9, oy = 1e9, nx = 1e9, ny = 1e9;
    ids.forEach(function (n) {
      ox = Math.min(ox, node[n].p.x); oy = Math.min(oy, node[n].p.y);
      nx = Math.min(nx, colX[node[n].layer]); ny = Math.min(ny, node[n].y);
    });
    var sx = snap(ox - nx), sy = snap(oy - ny);

    var parts = {};
    ids.forEach(function (n) { parts[n] = { x: colX[node[n].layer] + sx, y: node[n].y + sy }; });

    /* 通し道を通る線は、通り道そのものを覚えさせて描かせる。
     * 端子の位置から毎回計算し直す描き方だと、空けた隙間の外を通ってしまうことがある
     * （道が他の部品に押しのけられた場合）。覚えた道は、部品を動かした瞬間に
     * 端子と合わなくなるので、そのときは ui.js が素直な折れ線に戻す */
    var wires = {};
    edges.forEach(function (e) {
      if (e.back || !e.lanes || !e.lanes.length) return;
      var p1 = { x: parts[e.u].x + node[e.u].w, y: parts[e.u].y + dy(e.u, 'out', e.up) };
      var p2 = { x: parts[e.v].x, y: parts[e.v].y + dy(e.v, 'in', e.vp) };
      var pts = [p1], cy = p1.y, jx, k;
      for (k = 0; k < e.lanes.length; k++) {
        var ln = node[e.lanes[k]], ly = ln.y + sy;
        if (ly === cy) continue;
        jx = colX[ln.layer] + sx - GAP_X / 2;              /* 折れるのは列と列のすきま */
        pts.push({ x: jx, y: cy }, { x: jx, y: ly });
        cy = ly;
      }
      if (p2.y !== cy) {
        jx = p2.x - 20 - Math.min(e.vp, 3) * 10;           /* 入る端子ごとに少しずらす */
        pts.push({ x: jx, y: cy }, { x: jx, y: p2.y });
      }
      pts.push(p2);
      wires[e.id] = pts;
    });

    return { parts: parts, wires: wires };
  }

  /* ---------------- 1. 段を決める ---------------- */

  /* 輪になっている所を見つけて印を付ける。深さ優先で、いま辿っている途中の
   * 部品へ戻る辺が後ろ向きの辺。再帰にしないのは、4ビット加算器のように
   * 一本道が長い回路では段数ぶんの深さになるため */
  function markBackEdges(ids, node) {
    var color = {};
    ids.forEach(function (n) { color[n] = 0; });
    ids.forEach(function (root) {
      if (color[root]) return;
      color[root] = 1;
      var stack = [{ n: root, k: 0 }];
      while (stack.length) {
        var t = stack[stack.length - 1], outs = node[t.n].outs;
        if (t.k < outs.length) {
          var e = outs[t.k++];
          if (color[e.v] === 1) e.back = true;              /* いま辿っている最中＝輪 */
          else if (!color[e.v]) { color[e.v] = 1; stack.push({ n: e.v, k: 0 }); }
        } else { color[t.n] = 2; stack.pop(); }
      }
    });
  }

  /* 上流からの最長路。最短路にすると、遠回りしてきた信号と直行してきた信号が
   * 同じ列で出会えず、配線が列をまたいで飛ぶ */
  function layerize(ids, node) {
    var deg = {}, q = [], i;
    ids.forEach(function (n) { deg[n] = 0; node[n].layer = 0; });
    ids.forEach(function (n) {
      node[n].outs.forEach(function (e) { if (!e.back) deg[e.v]++; });
    });
    ids.forEach(function (n) { if (!deg[n]) q.push(n); });
    for (i = 0; i < q.length; i++) {
      var u = q[i];
      node[u].outs.forEach(function (e) {
        if (e.back) return;
        if (node[e.v].layer < node[u].layer + 1) node[e.v].layer = node[u].layer + 1;
        if (--deg[e.v] === 0) q.push(e.v);
      });
    }
  }

  /* 塊ごとの後始末:
   *   - 段の番号を 0 から詰める
   *   - 出力は一番右の列に揃える（回路の顔なので、途中に散っていると読めない）
   *   - 定数とクロックは使われる直前まで右へ寄せる（左端に置くと線だけが長くなる） */
  function tidyLayers(comp, node, circuit) {
    var lo = 1e9, hi = -1e9;
    comp.forEach(function (n) { lo = Math.min(lo, node[n].layer); });
    comp.forEach(function (n) { node[n].layer -= lo; hi = Math.max(hi, node[n].layer); });
    comp.forEach(function (n) {
      if (circuit.parts[n].kind === 'out') node[n].layer = hi;
    });
    comp.forEach(function (n) {
      var k = circuit.parts[n].kind;
      if (k !== 'const' && k !== 'clock') return;
      var m = 1e9;
      node[n].outs.forEach(function (e) { m = Math.min(m, node[e.v].layer); });
      if (m < 1e9) node[n].layer = Math.max(node[n].layer, m - 1);
    });
  }

  /* 繋がっている者どうしをまとめる。別々の回路が盤面に並んでいるとき、
   * 混ぜて並べると誰と誰が仲間なのか分からなくなる */
  function components(ids, node, edges) {
    var par = {};
    ids.forEach(function (n) { par[n] = n; });
    function find(a) { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; }
    edges.forEach(function (e) { var a = find(e.u), b = find(e.v); if (a !== b) par[a] = b; });
    var map = {}, list = [];
    ids.forEach(function (n) {
      var r = find(n);
      if (!map[r]) { map[r] = []; list.push(map[r]); }
      map[r].push(n);
    });
    /* 元の位置で上にあった塊から順に。整えても上下の並びの気持ちは変えない */
    list.forEach(function (c) {
      c.ky = c.reduce(function (s, n) { return s + node[n].p.y; }, 0) / c.length;
    });
    list.sort(function (a, b) { return a.ky - b.ky; });
    return list;
  }

  /* 【通し道】列を2つ以上またぐ線は、途中の列を素通りする。何もしないと
   * その列に並んでいる部品の上を横切って、線と箱が重なって読めなくなる。
   *
   * そこで、またぐ列ごとに「大きさゼロの部品」を1つ置き、辺をそこで折り返す。
   * この点は場所の取り合いに普通に参加するので、通り道ぶんの隙間が空く。
   * しかも両端の端子と同じ高さに寄せられるので、長い線はまっすぐ真横に伸びる
   * （y が同じなら routePath の折れ曲がりが消えて1本の直線になる）。
   *
   * 後ろ向きの線（フィードバック）はやらない。あれは列の間を戻るのではなく
   * 下へ回り込んで描かれるので、途中の列に道を空けても意味がない。 */
  function addLanes(comp, node, seq) {
    var all = comp.slice(), lane = {};
    comp.forEach(function (n) {
      node[n].outs.slice().forEach(function (e) {
        if (e.back) return;
        var span = node[e.v].layer - node[e.u].layer;
        if (span <= 1) return;
        if (seq.n + span > MAX_LANES) return;             /* 諦めて元のまま（線が重なるだけで済む） */

        var prev = e.u, prevPort = e.up, l, id;
        e.lanes = [];
        for (l = node[e.u].layer + 1; l < node[e.v].layer; l++) {
          /* 同じ出力端子から出た線は同じ信号なので、道も1本にまとめる。
           * 重なって描かれるが、同じ値が流れているのだから重なって正しい */
          var key = e.u + ':' + e.up + ':' + l;
          id = lane[key];
          if (id === undefined) {
            id = lane[key] = -(++seq.n);
            node[id] = {
              id: id, lane: true, p: node[e.u].p, w: 0, h: 0,
              ins: [], outs: [], layer: l, y: node[e.u].y
            };
            all.push(id);
            join(node, prev, prevPort, id, 0);
          }
          e.lanes.push(id);
          prev = id; prevPort = 0;
        }
        join(node, prev, prevPort, e.v, e.vp);
        drop(node[e.u].outs, e);                 /* 元の1本は外す。折り返した鎖が代わりになる */
        drop(node[e.v].ins, e);
      });
    });
    return all;
  }

  function join(node, u, up, v, vp) {
    var e = { u: u, v: v, up: up, vp: vp, back: false };
    node[u].outs.push(e);
    node[v].ins.push(e);
  }

  function drop(list, e) {
    var i = list.indexOf(e);
    if (i >= 0) list.splice(i, 1);
  }

  /* ---------------- 2. 同じ列の中の並びを決める ---------------- */

  /* 「隣の列での位置の中央値」の順に並べ替える、を左右に往復する（中央値法）。
   * 交差を最小にするのは NP 困難なので、これで十分に減らす */
  function orderColumns(comp, node) {
    var cols = [], i;
    comp.forEach(function (n) {
      var l = node[n].layer;
      (cols[l] || (cols[l] = [])).push(n);
    });
    for (i = 0; i < cols.length; i++) if (!cols[i]) cols[i] = [];
    /* 出発点はいまの上下の並び。整えた結果が今の見た目から遠すぎると、
     * どれが自分の置いた部品だったのか分からなくなる */
    cols.forEach(function (col) {
      col.sort(function (a, b) {
        return (node[a].p.y - node[b].p.y) || (node[a].p.x - node[b].p.x) || (a - b);
      });
    });
    for (i = 0; i < SWEEPS; i++) sweep(cols, node, i % 2 ? -1 : 1);
    return cols;
  }

  function sweep(cols, node, dir) {
    var pos = {}, order = [], i;
    function repos() {
      cols.forEach(function (col) { col.forEach(function (n, k) { pos[n] = k; }); });
    }
    for (i = 0; i < cols.length; i++) order.push(dir > 0 ? i : cols.length - 1 - i);
    repos();
    order.forEach(function (l) {
      var ref = l - dir;
      if (ref < 0 || ref >= cols.length) return;
      var key = {};
      cols[l].forEach(function (n, k) {
        var acc = [];
        /* 向きは問わない。戻りの配線も並びの手がかりとして使う */
        node[n].ins.concat(node[n].outs).forEach(function (e) {
          var o = e.u === n ? e.v : e.u;
          if (node[o].layer === ref) acc.push(pos[o]);
        });
        key[n] = acc.length ? median(acc) : k;         /* 隣に相手が居ないものは動かさない */
      });
      cols[l] = cols[l].slice().sort(function (a, b) {
        return (key[a] - key[b]) || (pos[a] - pos[b]);
      });
      repos();
    });
  }

  /* ---------------- 3. 座標を決める ---------------- */

  function columnX(ids, node) {
    var w = [], x = [], i, cur = 0;
    ids.forEach(function (n) {
      var l = node[n].layer;
      w[l] = Math.max(w[l] || 0, node[n].w);
    });
    for (i = 0; i < w.length; i++) { x[i] = cur; cur += (w[i] || 0) + GAP_X; }
    return x;
  }

  /* 「望みの y（配線が真横になる位置）に寄せる」と「重なりを押し戻す」を往復する。
   * 入力側に合わせる回と出力側に合わせる回を交互にやらないと、
   * 上流だけ真っ直ぐで下流が斜め、という片寄った形に落ち着く */
  function placeY(cols, node, dy) {
    var l, i, y;
    for (l = 0; l < cols.length; l++) {
      y = 0;
      for (i = 0; i < cols[l].length; i++) {
        node[cols[l][i]].y = y;
        y += node[cols[l][i]].h + GAP_Y;
      }
    }
    for (var it = 0; it < PASSES; it++) {
      for (l = 0; l < cols.length; l++) packCol(cols[l], node, dy, 'in');
      for (l = cols.length - 1; l >= 0; l--) packCol(cols[l], node, dy, 'out');
    }
  }

  function packCol(col, node, dy, side) {
    if (!col.length) return;
    var want = col.map(function (n) { return desiredY(n, node, dy, side); });
    var prev = -1e9, i, k, m, lo, d;
    for (i = 0; i < col.length; i++) {                 /* 上から順に、望みの位置か、その下 */
      m = node[col[i]];
      d = want[i] === null ? m.y : want[i];
      m.y = Math.max(d, prev + GAP_Y);

      /* 【通し道は動かさない】押し下げられた通し道は、線が実際に通る高さと
       * ずれてしまい、空けたはずの隙間の外を線が通る（＝部品を突き抜ける）。
       * 下がる代わりに、上に居る連中を持ち上げて場所を空ける。
       * 上へはいくらでも伸ばしてよい ― 塊ごとに最後は上端を揃え直すので */
      if (m.lane && m.y > d) {
        m.y = d;
        for (k = i - 1; k >= 0; k--) {
          var up = node[col[k]], lim = node[col[k + 1]].y - up.h - GAP_Y;
          if (up.y <= lim) break;
          up.y = lim;
        }
      }
      prev = m.y + m.h;
    }
    for (i = col.length - 2; i >= 0; i--) {            /* 押し下げられた分を、隙間があるだけ戻す */
      m = node[col[i]];
      if (m.lane) continue;                            /* 通し道はもう正しい高さに居る */
      lo = i > 0 ? node[col[i - 1]].y + node[col[i - 1]].h + GAP_Y : -1e9;
      d = want[i] === null ? m.y : want[i];
      m.y = Math.max(lo, Math.min(m.y, d));
    }
  }

  /* 相手の端子とこちらの端子が同じ高さに来る y。相手が複数なら中央値。
   * 平均にすると、遠くに1つある相手に全体が引っ張られる */
  function desiredY(n, node, dy, side) {
    /* 通し道は上流の高さに釘付けにする。両側の言い分を足して割ると道が斜めになり、
     * 「出た高さのまま真横に走る」という描き方（ui.js の routePath）とずれて、
     * せっかく空けた隙間の外を線が通ってしまう */
    if (node[n].lane && side === 'out') return null;
    var es = side === 'in' ? node[n].ins : node[n].outs, acc = [];
    es.forEach(function (e) {
      var o = side === 'in' ? e.u : e.v;
      if (node[o].layer === node[n].layer) return;     /* 同じ列どうしは揃えようがない */
      var oy = node[o].y + (side === 'in' ? dy(o, 'out', e.up) : dy(o, 'in', e.vp));
      var my = side === 'in' ? dy(n, 'in', e.vp) : dy(n, 'out', e.up);
      acc.push(oy - my);
    });
    return acc.length ? snap(median(acc)) : null;
  }

  NL.layout = { arrange: arrange, GAP_X: GAP_X, GAP_Y: GAP_Y };
})(typeof window !== 'undefined' ? window : globalThis);
