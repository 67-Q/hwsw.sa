/* ============================================================
   Game_engine.js —— 遊戲畫面與規則（SVG ＋ art/ 裡的圖片素材）
   兩種遊戲：
     跳躍：game.set_map([0,1,...])  地圖 0 = 障礙、1 = 平地；動作 0 = 跳、1 = 走
     森林迷宮：game.set_maze()      動作 w = 上、s = 下、a = 左、d = 右、j = 往面向的方向跳過水窪
   共用：game.step(動作)、game.play(動作串列)
   素材（art/ 必須和這個檔案放在同一層）：
     角色：玩家動畫/16x16（閒置、走 用分解動作；跳躍 直接從 16x16 Jump-Sheet.png 切，因為分解檔裁錯了）
     終點：其他物件/flag.png；森林迷宮：植物、其他物件/lake*.png（水窪）、道路/path*.png
     背景：地圖背景/parchmentAncient.png（寫在 Codeing_game.css 的 #stageBox）
   目錄（搜尋 【區塊】 可快速跳轉）
     1. 【區塊】工具與全域變數
     2. 【區塊】角色與動作（閒置、走、跳、搖晃、掉落、歡呼）
     3. 【區塊】跳躍遊戲：地圖與規則
     4. 【區塊】森林迷宮：地圖與規則
     5. 【區塊】共用：重設、步驟、結束判定
     6. 【區塊】Python 的 game 模組
============================================================ */

/* ===================== 【區塊】工具與全域變數 ===================== */
const SVGNS = 'http://www.w3.org/2000/svg';
const $g = id => document.getElementById(id);
const INK = '#333';                         // 線條顏色
const Game = { mode: '', over: false, n: 0, map: [], pos: 0, r: 0, c: 0, face: 2, rows: 0, cols: 0, hl: null };
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

// 素材路徑（中文與空白要編碼）
const PNG = 'art/其他元素/PNG/';
const HERO = 'art/玩家動畫/16x16/';
const src = p => encodeURI(p);
const pic = (file, x, y, w, h, parent) => mk('image', { href: src(file), x, y, width: w, height: h }, parent);

function addDefs() {                        // 角色受傷（紅）、過關（綠）的變色濾鏡
  const defs = mk('defs', {});
  const tint = (id, m) => mk('feColorMatrix', { type: 'matrix', values: m }, mk('filter', { id }, defs));
  tint('fxHurt', '1 0 0 0 0.25  0 0.3 0 0 0  0 0 0.3 0 0  0 0 0 1 0');
  tint('fxWin',  '0.35 0 0 0 0  0 1 0 0 0.05  0 0 0.35 0 0  0 0 0 1 0');
}

/* ===================== 【區塊】角色與動作 ===================== */
// 角色原圖 24×24 像素（跳躍圖集每格 24×22），放大 SC 倍；圖形的 (0,0) = 角色的腳底中央
const SC = 2;
const ROWS = ['下', '下側', '側面', '上側', '上'];               // 跳躍圖集由上到下的方向
const ANIM = { 閒置: { n: 4, ms: 180 }, 走: { n: 4, ms: 110 }, 跳躍: { n: 5 } };
const JUMP_SHEET = HERO + '16x16 Jump-Sheet.png';
const frameFile = (act, dir, i) => HERO + '分解動作/' + act + '/' + dir + '/' + act + '_' + dir + '_0' + i + '.png';

let hero = null, flip = null, box = null, img = null, shown = '';
let cur = { x: 0, y: 0 }, look = { dir: '側面', flip: false }, anim = { name: '閒置', t0: 0, ms: 0 };
const tr = (x, y) => 'translate(' + x + 'px,' + y + 'px)';

function putHero(x, y, dir, flipped) {
  hero = mk('g', {});
  flip = mk('g', {}, hero);
  box = mk('svg', { preserveAspectRatio: 'none' }, flip);    // 內層 svg 當「窗口」，只露出圖集的一格
  img = mk('image', { class: 'px' }, box);
  shown = '';
  cur = { x, y };
  hero.style.transform = tr(x, y);
  face(dir, flipped);
  setAnim('閒置');
}
function face(dir, flipped) {               // 側面原圖朝右，朝左時水平翻轉
  look = { dir, flip: !!flipped };
  flip.setAttribute('transform', flipped ? 'scale(-1,1)' : '');
  drawHero();
}
function setAnim(name, ms) { anim = { name, t0: performance.now(), ms: ms || 0 }; drawHero(); }
function drawHero() {                       // 依照經過的時間挑出要顯示的那一格
  if (!hero) return;
  const a = ANIM[anim.name], t = performance.now() - anim.t0;
  const i = anim.name === '跳躍' ? Math.min(a.n - 1, Math.floor(t / anim.ms * a.n)) : Math.floor(t / a.ms) % a.n;
  const key = anim.name + look.dir + i;
  if (key === shown) return;
  shown = key;
  if (anim.name === '跳躍') {
    const h = 22;
    setAll(box, { x: -12 * SC, y: -h * SC, width: 24 * SC, height: h * SC, viewBox: (i * 24) + ' ' + (ROWS.indexOf(look.dir) * h) + ' 24 ' + h });
    setAll(img, { href: src(JUMP_SHEET), width: 120, height: 110 });
  } else {
    setAll(box, { x: -12 * SC, y: -24 * SC, width: 24 * SC, height: 24 * SC, viewBox: '0 0 24 24' });
    setAll(img, { href: src(frameFile(anim.name, look.dir, i + 1)), width: 24, height: 24 });
  }
}
function setAll(e, attrs) { for (const k in attrs) e.setAttribute(k, attrs[k]); }
setInterval(drawHero, 40);

async function play(keys, ms, easing) {     // 播放動畫，等它做完才往下
  const a = hero.animate(keys, { duration: ms, easing: easing || 'ease-in-out' });
  await a.finished.catch(() => {});
}
async function glide(x, y, arc, ms) {       // 移動到 (x, y)；arc > 0 時會跳起來劃一道弧線
  setAnim(arc ? '跳躍' : '走', ms);
  const keys = [{ transform: tr(cur.x, cur.y) }];
  if (arc) keys.push({ transform: tr((cur.x + x) / 2, Math.min(cur.y, y) - arc), offset: 0.5 });
  keys.push({ transform: tr(x, y) });
  await play(keys, ms);
  cur = { x, y };
  hero.style.transform = tr(x, y);
  setAnim('閒置');
}
const hopHere = () => glide(cur.x, cur.y, 30, 450);          // 原地跳一下
async function wobble() {                                    // 搖晃（撞到）
  const t = tr(cur.x, cur.y);
  await play([0, -18, 18, -10, 0].map(a => ({ transform: t + ' rotate(' + a + 'deg)' })), 400);
}
async function hurt() { hero.setAttribute('filter', 'url(#fxHurt)'); await wobble(); }
async function cheer() { hero.setAttribute('filter', 'url(#fxWin)'); await hopHere(); await hopHere(); }
async function fall() {                                      // 掉出地圖
  const a = hero.animate([
    { transform: tr(cur.x, cur.y) + ' rotate(0deg)', opacity: 1 },
    { transform: tr(cur.x, cur.y + 260) + ' rotate(540deg)', opacity: 0 }
  ], { duration: 900, easing: 'ease-in', fill: 'forwards' });
  await a.finished.catch(() => {});
}
Game.fall = () => (hero ? fall() : Promise.resolve());

function putFlag(x, groundY, size) {        // 旗竿底部對準 (x, groundY)
  pic(PNG + '其他物件/flag.png', x - size * 0.43, groundY - size * 0.95, size, size);
}

/* ===================== 【區塊】跳躍遊戲 ===================== */
// 角色站在「邊界線」上：第 i 步 = 從第 i 條邊界走到第 i+1 條，中間跨過第 i 格
const J = { cell: 60, margin: 70, ground: 220, bw: 16, bh: 40 };
// 跳躍遊戲的數字約定（想對調 0 與 1，只要改這三行）
const OBSTACLE = 0;                                           // 地圖上代表「障礙」的數字
const JUMP = 0;                                               // 動作：跳
const WALK = 1;                                               // 動作：走
const hx = b => J.margin + b * J.cell;                        // 第 b 條邊界線的 x
const bx = i => hx(i) + (J.cell - J.bw) / 2;                  // 第 i 格障礙物的左邊 x
const hy = J.ground - 3;                                      // 角色腳底的 y（地面線上緣）

Game.setMap = function (arr) {
  Game.reset();
  Game.mode = 'jump';
  Game.map = arr.map(Number);
  Game.pos = 0;                                               // 角色站在第 pos 條邊界
  const n = Game.map.length;
  $g('stage').setAttribute('viewBox', '0 0 ' + (n * J.cell + 2 * J.margin + 60) + ' 300');
  Game.hl = mk('rect', { x: 0, y: 50, width: J.cell, height: 220, fill: 'gold', opacity: 0 });   // 高亮目前這一格
  // 地形 = 一條折線：障礙（OBSTACLE）= 凸起的方塊，其他 = 平地
  let d = 'M 10 ' + J.ground;
  Game.map.forEach((v, i) => {
    d += ' L ' + bx(i) + ' ' + J.ground;
    d += (v === OBSTACLE) ? ' l 0 ' + (-J.bh) + ' l ' + J.bw + ' 0 l 0 ' + J.bh : ' l ' + J.bw + ' 0';
  });
  d += ' L ' + (hx(n) + 110) + ' ' + J.ground;
  mk('path', { d, fill: 'none', stroke: INK, 'stroke-width': 6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
  putFlag(hx(n) + 70, hy, 64);                                // 終點：旗子
  text(14, 26, OBSTACLE + ' = 障礙（要跳）　' + (1 - OBSTACLE) + ' = 平地（要走）', 13, '#555', 'start');
  // 地面下方：數值與索引
  text(J.margin - 12, J.ground + 28, '值', 14, '#555', 'end');
  text(J.margin - 12, J.ground + 50, '索引', 14, '#555', 'end');
  Game.map.forEach((v, i) => {
    text(hx(i) + J.cell / 2, J.ground + 28, v, 20, INK, 'middle', true);
    text(hx(i) + J.cell / 2, J.ground + 50, i, 14, '#777', 'middle');
  });
  putHero(hx(0), hy, '側面', false);
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
    await glide(bx(i) - 12, hy, 0, 300);
    await hurt();
    Game.end(false, '第 ' + i + ' 格是障礙物（' + t + '），要跳（' + JUMP + '），但動作是 ' + m);
  } else {                                                    // 平地，卻選了「跳」
    await glide(hx(i + 1), hy, 70, 500);
    await hurt();
    Game.end(false, '第 ' + i + ' 格是平地（' + t + '），要走（' + WALK + '），但動作是 ' + m);
  }
}

/* ===================== 【區塊】森林迷宮 ===================== */
// 森林用文字畫，一個字 = 一格：. = 路、# = 樹（要繞過）、o = 小水窪、O = 大水窪（都要用 j 跳過）
// 從左上角出發，旗子在右下角（例外寫在下面的 SPOTS）。換地圖只要改這幾行（每一行長度要一樣）
const FOREST = [
  '..o..##..#',
  '##.#.##.##',
  '.....##...',
  '.#.####.#.',
  '.#.##...#o',
  '.####.#.#.',
  '...O..#.#.'
];
const LOOP = [
  '..o.######',
  '###.######',
  '###..o.###',
  '######.###',
  '######..O.',
  '#########.',
  '#########.'
];
const MAZES = {
  forest: FOREST,
  loop: LOOP,
  // ---------- 森林迷宮 13 關：game.set_maze("L1") ～ game.set_maze("L13") ----------
  L1: [                                                       // 森林入口（4 列 × 5 行）
    '.....',
    '####.',
    '####.',
    '####.'
  ],
  L2: [                                                       // 曲折小徑（5 × 6）
    '...###',
    '##.###',
    '##...#',
    '####.#',
    '####..'
  ],
  L3: [                                                       // 第一座水窪（6 × 7）
    '...####',
    '##.####',
    '##..o.#',
    '#####.#',
    '#####.#',
    '#####..'
  ],
  L4: [                                                       // 繞路才有出口（6 × 7）
    '.######',
    '.#.....',
    '.#.###.',
    '...#...',
    '.###.##',
    '...#...'
  ],
  L5: [                                                       // 一步一步執行（6 × 8）
    '...o....',
    '#######.',
    '....O...',
    '.#######',
    '........',
    '#######.'
  ],
  L6: [                                                       // 數清直路（7 × 9）
    '........#',
    '#######.#',
    '##......#',
    '##.######',
    '##.######',
    '##.######',
    '##.......'
  ],
  L7: [                                                       // 修好路線計畫（7 × 9）
    '.########',
    '.#...####',
    '.#.#.####',
    '.#.#.####',
    '.#.#.####',
    '.#.#.####',
    '...#..o..'
  ],
  L8: LOOP,                                                   // 迴圈階梯（7 × 10），和 loop 同一張
  L9: [                                                       // 反向的階梯（8 × 10）
    '..........',
    '#########.',
    '######.o..',
    '###.O..###',
    '.o..######',
    '.#########',
    '.#########',
    '..........'
  ],
  L10: [                                                      // 森林的重複規律（11 × 25）：三個「67」由右上排到左下
    '################...o...##',
    '################.#####...',
    '################...###.##',
    '########...o...#o#.###.##',
    '########.#####.....###.##',
    '########...###.##########',
    '...o...#o#.###.##########',
    '.#####.....###.##########',
    '...###.##################',
    'o#.###.##################',
    '...###.##################'
  ],
  L11: [                                                      // 最後一段不一樣（9 × 11）
    '..o.#######',
    '###..O.####',
    '######..o.#',
    '#########.#',
    '#########.#',
    '######....#',
    '######.####',
    '######.####',
    '######.....'
  ],
  L12: [                                                      // 比較兩條路（9 × 12）
    '.....o.....#',
    '.#########.#',
    '.###.......#',
    '..##.#######',
    '#..#........',
    '##..#######.',
    '###..######.',
    '####..#####.',
    '#####...O...'
  ],
  L13: [                                                      // 森林畢業考（9 × 12）
    '..o..O..o...',
    '###########.',
    '...O..o..O..',
    '.###########',
    '.....o......',
    '###########.',
    '......O.....',
    '.###########',
    '.....o......'
  ]
};
// 起點、終點不在左上、右下的關卡：[列, 行]
const SPOTS = {
  L10: { start: [1, 24], goal: [10, 0] }
};
const U = 60, M = 20;                                         // 一格的邊長、四周留白
const KEYS = { j: 0, w: 1, s: 2, a: 3, d: 4 };               // 鍵盤字母 → 內部代碼
const DIRS = [null, [-1, 0], [1, 0], [0, -1], [0, 1]];       // 代碼 1 上、2 下、3 左、4 右（列變化, 行變化）
const NAMES = ['跳', '上', '下', '左', '右'];
const LOOKS = [null, ['上', false], ['下', false], ['側面', true], ['側面', false]];   // 每個方向用的角色圖
const TREES = ['treePine', 'treePines', 'treePineLarge', 'bush', 'treePinesSmall'];
const mx = c => M + c * U + U / 2;                            // 第 c 行的中心 x
const my = r => M + r * U + U / 2;                            // 第 r 列的中心 y
const feet = r => my(r) + U * 0.38;                           // 角色站在第 r 列時腳底的 y
const tile = (r, c) => (r >= 0 && r < Game.rows && c >= 0 && c < Game.cols) ? Game.maze[r][c] : null;   // 外面 = null
const isPond = t => t === 'o' || t === 'O';

// 道路圖塊原本的出口（上、右、下、左）；依照鄰居是不是路，挑一塊再轉到對的方向
const ROADS = [['pathEnd', [1, 0, 0, 0]], ['pathStraight', [1, 0, 1, 0]], ['pathCorner', [1, 1, 0, 0]],
               ['pathSplit', [1, 1, 1, 0]], ['pathCrossing', [1, 1, 1, 1]]];
function roadTile(open) {
  for (const [name, base] of ROADS) for (let k = 0; k < 4; k++) {
    if (base.every((_, i) => base[(i + 4 - k) % 4] === open[i])) return [name, k * 90];
  }
  return null;
}

Game.setMaze = function (name = 'forest') {
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(MAZES, name)) {
    throw new Error('迷宮名稱不認得，請使用 "forest"、"loop" 或 "L1"～"L13"');
  }
  Game.reset();
  Game.mode = 'maze';
  Game.mazeName = name;
  Game.maze = MAZES[name];
  Game.rows = Game.maze.length;
  Game.cols = Game.maze[0].length;
  const spot = SPOTS[name] || {};
  [Game.r, Game.c] = spot.start || [0, 0];
  Game.goal = spot.goal || [Game.rows - 1, Game.cols - 1];
  Game.face = 2;
  $g('stage').setAttribute('viewBox', '0 0 ' + (Game.cols * U + 2 * M) + ' ' + (Game.rows * U + 2 * M));
  const open = (r, c) => { const t = tile(r, c); return t !== null && t !== '#' ? 1 : 0; };
  for (let r = 0; r < Game.rows; r++) for (let c = 0; c < Game.cols; c++) {
    const t = Game.maze[r][c], x = M + c * U, y = M + r * U;
    if (t === '#') continue;
    const road = roadTile([open(r - 1, c), open(r, c + 1), open(r + 1, c), open(r, c - 1)]);
    if (road) pic(PNG + '道路/' + road[0] + '.png', x, y, U, U).setAttribute('transform', 'rotate(' + road[1] + ' ' + mx(c) + ' ' + my(r) + ')');
    if (isPond(t)) {                                          // 先鋪一層水面蓋住道路，再畫水窪的外框
      const big = t === 'O';
      mk('ellipse', { cx: mx(c), cy: my(r), rx: big ? 23 : 27, ry: big ? 10 : 12, fill: '#9cc6cf' });
      pic(PNG + '其他物件/' + (big ? 'lake' : 'lakeRound') + '.png', x - 3, y + U / 2 - (U + 6) / 4, U + 6, (U + 6) / 2);
    }
  }
  for (let r = 0; r < Game.rows; r++) for (let c = 0; c < Game.cols; c++) {   // 樹最後畫，才能稍微蓋住道路邊緣
    if (Game.maze[r][c] === '#') pic(PNG + '植物/' + TREES[(r * 3 + c * 2) % TREES.length] + '.png', M + c * U - 4, M + r * U - 6, U + 8, U + 8);
  }
  putFlag(mx(Game.goal[1]) + 4, feet(Game.goal[0]), 50);     // 終點的旗子
  putHero(mx(Game.c), feet(Game.r), '下', false);
};

const atGoal = () => Game.r === Game.goal[0] && Game.c === Game.goal[1];
const where = () => '（位置 列 ' + Game.r + '，行 ' + Game.c + '）';

async function mazeStep(m, i, k) {
  const dirName = NAMES[m === 0 ? Game.face : m];
  Game.show('第 ' + i + ' 步｜動作 ' + k + '（' + (m === 0 ? '往' + dirName + '跳' : dirName) + '）｜位置 (列 ' + Game.r + '，行 ' + Game.c + ')');
  if (m !== 0) { Game.face = m; face(LOOKS[m][0], LOOKS[m][1]); }
  const [dr, dc] = DIRS[Game.face];
  const t1 = tile(Game.r + dr, Game.c + dc);
  if (m === 0) {                                              // j：往面向的方向跳過一格水窪
    if (!isPond(t1)) {
      await hopHere();
      await hurt();
      return Game.end(false, '第 ' + i + ' 步：往' + dirName + '的下一格不是水窪，j 只能用來跳過水窪' + where());
    }
    const t2 = tile(Game.r + 2 * dr, Game.c + 2 * dc);
    if (t2 !== '.') {                                         // 跳過去的落點不是路
      await glide(cur.x + dc * U, cur.y + dr * U, 30, 450);
      await hurt();
      return Game.end(false, '第 ' + i + ' 步：跳過水窪後' + (t2 === null ? '會跳出森林' : t2 === '#' ? '會撞到樹' : '還是水窪') + where());
    }
    Game.r += 2 * dr; Game.c += 2 * dc;
    await glide(mx(Game.c), feet(Game.r), 30, 550);
  } else {
    if (t1 !== '.') {                                         // 前面是樹、水窪或森林外面
      await glide(cur.x + dc * U * 0.3, cur.y + dr * U * 0.3, 0, 200);
      await hurt();
      return Game.end(false, '第 ' + i + ' 步：往' + dirName + (t1 === null ? '會走出森林' : t1 === '#' ? '撞到樹了' : '會掉進水窪，水窪要用 j 跳過去') + where());
    }
    Game.r += dr; Game.c += dc;
    await glide(mx(Game.c), feet(Game.r), 0, 300);
  }
  if (atGoal()) {
    await cheer();
    Game.end(true, '用了 ' + (i + 1) + ' 步走出森林');
  }
}

/* ===================== 【區塊】共用：重設、步驟、結束判定 ===================== */
Game.reset = function () {                  // 清空舞台與訊息
  Game.over = false; Game.result = null; Game.n = 0; Game.hl = null; hero = null;
  $g('stage').textContent = '';
  addDefs();
  $g('mon').textContent = '';
  $g('banner').textContent = ''; $g('banner').className = '';
};
Game.redraw = function () {                 // 每次執行前：用同一張地圖重新擺好
  if (Game.mode === 'jump') Game.setMap(Game.map);
  else if (Game.mode === 'maze') Game.setMaze(Game.mazeName);
};
Game.show = function (str, i) {             // 上方提示列；跳躍遊戲會同時高亮那一格
  $g('mon').textContent = str;
  if (Game.hl && i !== undefined) { Game.hl.setAttribute('x', hx(i)); Game.hl.setAttribute('opacity', 0.35); }
};
Game.end = function (ok, msg) {
  Game.over = true;
  Game.result = { ok, msg };
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
    Game.end(false, '動作用完了，還在 (列 ' + Game.r + '，行 ' + Game.c + ')，還沒走到旗子');
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
  mod.set_maze = new Sk.builtin.func(function (name) {
    Game.setMaze(name === undefined ? undefined : Sk.ffi.remapToJs(name));
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

// 先載入角色影格，換格時才不會閃
[['閒置', 4], ['走', 4]].forEach(([act, n]) => ['下', '側面', '上'].forEach(dir => {
  for (let i = 1; i <= n; i++) new Image().src = src(frameFile(act, dir, i));
}));
new Image().src = src(JUMP_SHEET);

Game.setMap([0, 1, 1, 1, 0, 1, 0, 0]);      // 一開啟網頁就先顯示預設地圖
