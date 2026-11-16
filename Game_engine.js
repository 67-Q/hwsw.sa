/* ============================================================
   Game_engine.js —— 遊戲畫面與規則（用 SVG 的簡單圖形和線條，沒有用任何圖片素材）
   兩種遊戲：
     跳躍：game.set_map([0,1,...])  地圖 0 = 障礙、1 = 平地；動作 0 = 跳、1 = 走
     迷宮：game.set_maze()          動作 w = 上、s = 下、a = 左、d = 右、j = 跳（原地）
   共用：game.step(動作)、game.play(動作串列)
   目錄（搜尋 【區塊】 可快速跳轉）
     1. 【區塊】工具與全域變數
     2. 【區塊】角色與動作（走、跳、搖晃、掉落、歡呼）
     3. 【區塊】跳躍遊戲：地圖與規則
     4. 【區塊】迷宮遊戲：地圖與規則
     5. 【區塊】共用：重設、步驟、結束判定
     6. 【區塊】Python 的 game 模組
============================================================ */

/* ===================== 【區塊】工具與全域變數 ===================== */
const SVGNS = 'http://www.w3.org/2000/svg';
const $g = id => document.getElementById(id);
const INK = '#333';                         // 線條顏色
const Game = { mode: '', over: false, n: 0, map: [], pos: 0, r: 0, c: 0, rows: 0, cols: 0, hl: null };
window.Game = Game;                         // 讓 Skulpt 的模組程式碼找得到

function mk(tag, attrs, parent) {           // 在舞台上建立一個 SVG 圖形
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  (parent || $g('stage')).appendChild(e);
  return e;
}
function text(x, y, str, size, color, anchor, bold) {
  const t = mk('text', { x, y, 'font-size': size, fill: color, 'text-anchor': anchor || 'middle',
    'font-family': 'Menlo, Consolas, monospace', 'font-weight': bold ? 'bold' : 'normal' });
  t.textContent = str;
  return t;
}

/* ===================== 【區塊】角色與動作 ===================== */
const R = 14;                               // 角色（圓形）的半徑
let hero = null, body = null, cur = { x: 0, y: 0 };
const tr = (x, y) => 'translate(' + x + 'px,' + y + 'px)';

function putHero(x, y) {                    // 角色 = 橘色圓圈 + 兩顆眼睛，圖形以 (0,0) 為中心
  hero = mk('g', {});
  body = mk('circle', { r: R, fill: '#ff9f1c', stroke: INK, 'stroke-width': 3 }, hero);
  mk('circle', { cx: -5, cy: -3, r: 2.5, fill: INK }, hero);
  mk('circle', { cx: 5, cy: -3, r: 2.5, fill: INK }, hero);
  cur = { x, y };
  hero.style.transform = tr(x, y);
}
async function play(keys, ms, easing) {     // 播放動畫，等它做完才往下
  const a = hero.animate(keys, { duration: ms, easing: easing || 'ease-in-out' });
  await a.finished.catch(() => {});
}
async function glide(x, y, arc, ms) {       // 移動到 (x, y)；arc > 0 時會跳起來劃一道弧線
  const keys = [{ transform: tr(cur.x, cur.y) }];
  if (arc) keys.push({ transform: tr((cur.x + x) / 2, Math.min(cur.y, y) - arc), offset: 0.5 });
  keys.push({ transform: tr(x, y) });
  await play(keys, ms);
  cur = { x, y };
  hero.style.transform = tr(x, y);
}
const hopHere = () => glide(cur.x, cur.y, 40, 400);          // 原地跳一下
async function wobble() {                                    // 搖晃（撞到）
  const t = tr(cur.x, cur.y);
  await play([0, -18, 18, -10, 0].map(a => ({ transform: t + ' rotate(' + a + 'deg)' })), 400);
}
async function hurt() { body.setAttribute('fill', '#e74c3c'); await wobble(); }
async function cheer() { body.setAttribute('fill', '#2ecc71'); await hopHere(); await hopHere(); }
async function fall() {                                      // 掉出地圖
  const a = hero.animate([
    { transform: tr(cur.x, cur.y) + ' rotate(0deg)', opacity: 1 },
    { transform: tr(cur.x, cur.y + 260) + ' rotate(540deg)', opacity: 0 }
  ], { duration: 900, easing: 'ease-in', fill: 'forwards' });
  await a.finished.catch(() => {});
}
Game.fall = () => (hero ? fall() : Promise.resolve());

/* ===================== 【區塊】跳躍遊戲 ===================== */
// 角色站在「邊界線」上：第 i 步 = 從第 i 條邊界走到第 i+1 條，中間跨過第 i 格
const J = { cell: 60, margin: 70, ground: 220, bw: 16, bh: 40 };
// 跳躍遊戲的數字約定（想對調 0 與 1，只要改這三行）
const OBSTACLE = 0;                                           // 地圖上代表「障礙」的數字
const JUMP = 0;                                               // 動作：跳
const WALK = 1;                                               // 動作：走
const hx = b => J.margin + b * J.cell;                        // 第 b 條邊界線的 x
const bx = i => hx(i) + (J.cell - J.bw) / 2;                  // 第 i 格障礙物的左邊 x
const hy = J.ground - R - 3;                                  // 角色站在地面上的 y

Game.setMap = function (arr) {
  Game.reset();
  Game.mode = 'jump';
  Game.map = arr.map(Number);
  Game.pos = 0;                                               // 角色站在第 pos 條邊界
  const n = Game.map.length;
  $g('stage').setAttribute('viewBox', '0 0 ' + (n * J.cell + 2 * J.margin + 30) + ' 300');
  Game.hl = mk('rect', { x: 0, y: 50, width: J.cell, height: 220, fill: 'gold', opacity: 0 });   // 高亮目前這一格
  // 地形 = 一條折線：障礙（OBSTACLE）= 凸起的方塊，其他 = 平地
  let d = 'M 10 ' + J.ground;
  Game.map.forEach((v, i) => {
    d += ' L ' + bx(i) + ' ' + J.ground;
    d += (v === OBSTACLE) ? ' l 0 ' + (-J.bh) + ' l ' + J.bw + ' 0 l 0 ' + J.bh : ' l ' + J.bw + ' 0';
  });
  d += ' L ' + (hx(n) + 110) + ' ' + J.ground;
  mk('path', { d, fill: 'none', stroke: INK, 'stroke-width': 6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  // 終點：紅色方塊（禮物）
  const gx = hx(n) + 70;
  mk('rect', { x: gx - 14, y: J.ground - 28, width: 28, height: 28, fill: '#e74c3c', stroke: INK, 'stroke-width': 3 });
  mk('path', { d: 'M ' + gx + ' ' + (J.ground - 28) + ' v 28 M ' + (gx - 14) + ' ' + (J.ground - 14) + ' h 28', stroke: '#f1c40f', 'stroke-width': 4 });
  text(14, 26, OBSTACLE + ' = 障礙（要跳）　' + (1 - OBSTACLE) + ' = 平地（要走）', 13, '#777', 'start');
  // 地面下方：數值與索引
  text(J.margin - 12, J.ground + 28, '值', 14, '#555', 'end');
  text(J.margin - 12, J.ground + 50, '索引', 14, '#555', 'end');
  Game.map.forEach((v, i) => {
    text(hx(i) + J.cell / 2, J.ground + 28, v, 20, INK, 'middle', true);
    text(hx(i) + J.cell / 2, J.ground + 50, i, 14, '#999', 'middle');
  });
  putHero(hx(0), hy);
};

async function jumpStep(m, raw) {
  const i = Game.pos, n = Game.map.length;
  if (i >= n) {                                               // 沒有這一格 → 掉出去
    Game.show('第 ' + i + ' 格｜（沒有這一格）｜動作 ' + raw);
    await fall();
    return Game.end(false, '地圖只有 ' + n + ' 格（索引 0～' + (n - 1) + '），沒有第 ' + i + ' 格');
  }
  const t = Game.map[i];
  const rock = (t === OBSTACLE);                              // 這一格是障礙物嗎？
  Game.show('第 ' + i + ' 格｜地形 ' + t + (rock ? '（障礙）' : '（平地）') +
            '｜動作 ' + m + (m === JUMP ? '（跳）' : '（走）'), i);
  if (m === (rock ? JUMP : WALK)) {                           // 動作和地形吻合 → 通過
    await glide(hx(i + 1), hy, rock ? 70 : 0, rock ? 500 : 350);
    Game.pos = i + 1;
  } else if (rock) {                                          // 障礙物，卻選了「走」
    await glide(bx(i) - R - 4, hy, 0, 300);
    await hurt();
    Game.end(false, '第 ' + i + ' 格是障礙物（' + t + '），要跳（' + JUMP + '），但動作是 ' + m);
  } else {                                                    // 平地，卻選了「跳」
    await glide(hx(i + 1), hy, 70, 500);
    await hurt();
    Game.end(false, '第 ' + i + ' 格是平地（' + t + '），要走（' + WALK + '），但動作是 ' + m);
  }
}

/* ===================== 【區塊】迷宮遊戲 ===================== */
// 迷宮用文字畫：# = 牆，空白 = 路。奇數列、奇數行的空白是「格子」，其餘是牆或通道
const MAZE = [
  '#################',
  '# #       #     #',
  '# # ##### # # ###',
  '# #   #   # #   #',
  '# ### # ### ### #',
  '#     #   # #   #',
  '######### ### # #',
  '#       #     # #',
  '# # ########### #',
  '# #             #',
  '#################'
];
const U = 60, M = 30;                                         // 一格的邊長、四周留白
const KEYS = { j: 0, w: 1, s: 2, a: 3, d: 4 };               // 鍵盤字母 → 內部代碼
const DIRS = [null, [-1, 0], [1, 0], [0, -1], [0, 1]];       // 代碼 1 上、2 下、3 左、4 右（列變化, 行變化）
const NAMES = ['跳', '上', '下', '左', '右'];
const mx = c => M + c * U + U / 2;                            // 第 c 行的中心 x
const my = r => M + r * U + U / 2;                            // 第 r 列的中心 y

Game.setMaze = function () {
  Game.reset();
  Game.mode = 'maze';
  Game.rows = (MAZE.length - 1) / 2;
  Game.cols = (MAZE[0].length - 1) / 2;
  Game.r = 0; Game.c = 0;
  $g('stage').setAttribute('viewBox', '0 0 ' + (Game.cols * U + 2 * M) + ' ' + (Game.rows * U + 2 * M));
  // 牆：每個 # 畫成一小段粗線（橫牆或直牆），線頭是圓的，接起來就像一整條
  let d = '';
  MAZE.forEach((row, gr) => [...row].forEach((ch, gc) => {
    if (ch !== '#') return;
    const px = M + (gc / 2) * U, py = M + (gr / 2) * U;
    if (gr % 2 === 0 && gc % 2 === 1) d += 'M ' + (px - U / 2) + ' ' + py + ' h ' + U + ' ';
    if (gr % 2 === 1 && gc % 2 === 0) d += 'M ' + px + ' ' + (py - U / 2) + ' v ' + U + ' ';
  }));
  mk('path', { d, fill: 'none', stroke: INK, 'stroke-width': 8, 'stroke-linecap': 'round' });
  // 終點：右下角的紅色方塊（禮物）
  const gx = mx(Game.cols - 1), gy = my(Game.rows - 1);
  mk('rect', { x: gx - 14, y: gy - 14, width: 28, height: 28, fill: '#e74c3c', stroke: INK, 'stroke-width': 3 });
  mk('path', { d: 'M ' + gx + ' ' + (gy - 14) + ' v 28 M ' + (gx - 14) + ' ' + gy + ' h 28', stroke: '#f1c40f', 'stroke-width': 4 });
  putHero(mx(0), my(0));
};

async function mazeStep(m, i, k) {
  Game.show('第 ' + i + ' 步｜動作 ' + k + '（' + NAMES[m] + '）｜位置 (列 ' + Game.r + '，行 ' + Game.c + ')');
  if (m === 0) return hopHere();                              // 0 = 跳：原地跳一下，不移動
  const [dr, dc] = DIRS[m];
  if (MAZE[2 * Game.r + 1 + dr][2 * Game.c + 1 + dc] === '#') {   // 前面是牆
    await glide(cur.x + dc * U * 0.3, cur.y + dr * U * 0.3, 0, 200);
    await hurt();
    return Game.end(false, '第 ' + i + ' 步：往' + NAMES[m] + '走撞到牆了（位置 列 ' + Game.r + '，行 ' + Game.c + '）');
  }
  Game.r += dr; Game.c += dc;
  await glide(mx(Game.c), my(Game.r), 0, 280);
  if (Game.r === Game.rows - 1 && Game.c === Game.cols - 1) {
    await cheer();
    Game.end(true, '用了 ' + (i + 1) + ' 步走出迷宮');
  }
}

/* ===================== 【區塊】共用：重設、步驟、結束判定 ===================== */
Game.reset = function () {                  // 清空舞台與訊息
  Game.over = false; Game.n = 0; Game.hl = null; hero = null;
  $g('stage').textContent = '';
  $g('mon').textContent = '';
  $g('banner').textContent = ''; $g('banner').className = '';
};
Game.redraw = function () {                 // 每次執行前：用同一張地圖重新擺好
  if (Game.mode === 'jump') Game.setMap(Game.map);
  else if (Game.mode === 'maze') Game.setMaze();
};
Game.show = function (str, i) {             // 上方提示列；跳躍遊戲會同時高亮那一格
  $g('mon').textContent = str;
  if (Game.hl && i !== undefined) { Game.hl.setAttribute('x', hx(i)); Game.hl.setAttribute('opacity', 0.35); }
};
Game.end = function (ok, msg) {
  Game.over = true;
  $g('banner').textContent = (ok ? '🎉 過關！' : '💥 失敗：') + msg;
  $g('banner').className = ok ? 'win' : 'lose';
};

// 角色做一步。對錯判斷（if-else）全部寫在這裡，學生的程式碼裡不需要 if
Game.step = async function (raw) {
  if (Game.over) return;
  if (!Game.mode) return Game.end(false, '請先用 game.set_map(...) 或 game.set_maze() 建立地圖');
  const i = Game.n++;
  const maze = (Game.mode === 'maze');
  const k = String(raw).trim().toLowerCase();               // 迷宮：w、a、s、d、j（大小寫都可以）
  const m = maze ? (Object.prototype.hasOwnProperty.call(KEYS, k) ? KEYS[k] : NaN)
                 : (k === '' ? NaN : Number(raw));          // 跳躍：0、1（也接受 "0"、False 這幾種寫法）
  if (!Number.isInteger(m) || m < 0 || (!maze && m > 1)) {
    Game.show('第 ' + i + ' 步｜動作 ' + raw);
    await hurt();
    return Game.end(false, '第 ' + i + ' 步：動作 ' + raw + ' 不認得（' + (maze ? '只能是 w、a、s、d、j' : '只能是 0 或 1') + '）');
  }
  return maze ? mazeStep(m, i, k) : jumpStep(m, raw);
};

// Python 整支程式跑完後呼叫：判定有沒有走到終點
Game.finish = async function () {
  if (Game.over || !Game.mode) return;
  if (Game.mode === 'jump') {
    const n = Game.map.length;
    if (Game.pos === n) {
      await glide(hx(n) + 36, hy, 0, 350);
      await cheer();
      Game.end(true, '全部 ' + n + ' 格都通過了');
    } else {
      Game.end(false, '動作用完了，只走到第 ' + Game.pos + ' 格，還沒到終點（共 ' + n + ' 格）');
    }
  } else {
    Game.end(false, '動作用完了，還在 (列 ' + Game.r + '，行 ' + Game.c + ')，還沒走到紅色終點');
  }
};

/* ===================== 【區塊】Python 的 game 模組 ===================== */
// 在 Codeing_game.js 的 initSkulpt 裡會註冊成 src/lib/game.js，Python 就能 import game
// 注意：這個函式會被轉成文字再交給 Skulpt，外面的區域變數會不見，只能用全域的 Game
function gameModule(name) {
  const mod = {};
  const none = Sk.builtin.none.none$;

  mod.set_map = new Sk.builtin.func(function (arr) {          // 跳躍遊戲：建立地圖
    Game.setMap(Sk.ffi.remapToJs(arr));
    return none;
  });
  mod.set_maze = new Sk.builtin.func(function () {            // 迷宮遊戲：載入迷宮
    Game.setMaze();
    return none;
  });
  mod.step = new Sk.builtin.func(function (move) {            // 做一步（Python 會等動畫做完才繼續）
    return Sk.misceval.promiseToSuspension(
      Game.step(Sk.ffi.remapToJs(move)).then(() => none)
    );
  });
  mod.play = new Sk.builtin.func(function (moves) {           // 一次做完整串動作
    const arr = Sk.ffi.remapToJs(moves);
    return Sk.misceval.promiseToSuspension(
      (async () => {
        for (const m of arr) await Game.step(m);
        return none;
      })()
    );
  });
  return mod;
}

Game.setMap([0, 1, 1, 1, 0, 1, 0, 0]);      // 一開啟網頁就先顯示預設地圖
