/* ============================================================
   Codeing_game.js —— 遊戲版的功能（改自 Codeing.js）
   拿掉：顏色按鈕、無限畫布、表情貼紙、turtle 畫布
   新增：註冊 Python 的 game 模組、跑完後判定過關、遊戲範例
   遊戲畫面本身在 Game_engine.js
   目錄（搜尋 【區塊】 可快速跳轉）
   0. 【區塊】共用小工具與主題（淺色／深色）
   1. 【區塊】載入外部程式庫（Skulpt = Python、CodeMirror = 編輯器）
   2. 【區塊】程式碼編輯器（行號、語法上色）
   3. 【區塊】執行 Python
   4. 【區塊】拖曳調整分區大小
   5. 【區塊】範例選單
============================================================ */

/* ===================== 【區塊】0. 共用小工具與主題 ===================== */
const $ = id => document.getElementById(id);
const out = $('out'), codeBox = $('code');
const runBtn = $('runBtn'), statusEl = $('status');
let skulptReady = false, running = false;
let cm = null;                       // CodeMirror 編輯器（載入失敗時維持 null，改用普通文字框）

// 淺色／深色：第一次打開預設淺色，之後記住選擇
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  $('themeBtn').textContent = t === 'dark' ? '☀️ 淺色' : '🌙 深色';
  try { localStorage.setItem('theme', t); } catch (e) { /* 部分瀏覽器不允許，忽略 */ }
}
let savedTheme = null;
try { savedTheme = localStorage.getItem('theme'); } catch (e) {}
setTheme(savedTheme === 'dark' ? 'dark' : 'light');
$('themeBtn').onclick = () =>
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

/* ===================== 【區塊】1. 載入外部程式庫 ===================== */
// 依序嘗試網址清單，第一個失敗就換下一個（備用來源）
function loadScript(urls) {
  return new Promise((resolve, reject) => {
    let i = 0;
    (function next() {
      if (i >= urls.length) return reject(new Error('載入失敗'));
      const s = document.createElement('script');
      s.src = urls[i++];
      s.onload = resolve;
      s.onerror = () => { s.remove(); next(); };
      document.head.appendChild(s);
    })();
  });
}
function loadCss(urls) {
  return new Promise((resolve, reject) => {
    let i = 0;
    (function next() {
      if (i >= urls.length) return reject(new Error('載入失敗'));
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = urls[i++];
      l.onload = resolve;
      l.onerror = () => { l.remove(); next(); };
      document.head.appendChild(l);
    })();
  });
}

// Skulpt：在瀏覽器裡執行 Python
(async function initSkulpt() {
  try {
    await loadScript([
      'https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/skulpt/1.2.0/skulpt.min.js'
    ]);
    await loadScript([
      'https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt-stdlib.js',
      'https://cdnjs.cloudflare.com/ajax/libs/skulpt/1.2.0/skulpt-stdlib.js'
    ]);
    // 【遊戲版新增】註冊 game 模組，之後 Python 才能 import game
    Sk.builtinFiles.files['src/lib/game.js'] = 'var $builtinmodule = ' + gameModule.toString();
    skulptReady = true;
    runBtn.disabled = false;
    statusEl.textContent = '✅ 準備好了';
  } catch (e) {
    statusEl.textContent = '❌ Python 載入失敗';
    addOut('無法載入 Python 引擎，請確認電腦有連上網路後重新整理頁面。\n', true);
  }
})();

/* ===================== 【區塊】2. 程式碼編輯器 ===================== */
// CodeMirror 5：提供行號、Python 語法上色。載入失敗就保留原本的文字框。
(async function initEditor() {
  try {
    await loadCss([
      'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.css',
      'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.css'
    ]);
    await loadScript([
      'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/codemirror.min.js',
      'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/lib/codemirror.js'
    ]);
    await loadScript([
      'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.16/mode/python/python.min.js',
      'https://cdn.jsdelivr.net/npm/codemirror@5.65.16/mode/python/python.js'
    ]);
    cm = CodeMirror.fromTextArea(codeBox, {
      mode: 'python',
      theme: 'vscode',              // 對應 CSS 的 .cm-s-vscode
      lineNumbers: true,            // 左邊顯示行號
      indentUnit: 4,
      tabSize: 4,
      indentWithTabs: false,
      extraKeys: {
        Tab: c => c.somethingSelected() ? c.indentSelection('add') : c.replaceSelection('    ', 'end'),
        'Shift-Tab': c => c.indentSelection('subtract'),
        'Ctrl-Enter': () => runCode(),
        'Cmd-Enter': () => runCode()
      }
    });
    // 編輯區大小改變（拖曳分隔線）時，讓 CodeMirror 重新計算
    new ResizeObserver(() => cm.refresh()).observe($('editorHost'));
    cm.on('change', saveChallengeCode);
  } catch (e) {
    cm = null;                      // 退回普通文字框
  }
})();

// 文字框備用方案的快捷鍵（CodeMirror 載入成功後不會用到）
codeBox.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = codeBox.selectionStart, en = codeBox.selectionEnd;
    codeBox.value = codeBox.value.slice(0, s) + '    ' + codeBox.value.slice(en);
    codeBox.selectionStart = codeBox.selectionEnd = s + 4;
    saveChallengeCode();
  } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    runCode();
  }
});

// 讀取／寫入程式碼（不管有沒有 CodeMirror 都能用）
function getCode() { return cm ? cm.getValue() : codeBox.value; }
function setCode(text) { if (cm) cm.setValue(text); else codeBox.value = text; }

/* ===================== 【區塊】3. 執行 Python ===================== */
function addOut(text, isErr) {
  if (isErr) {
    const span = document.createElement('span');
    span.className = 'err';
    span.textContent = text;
    out.appendChild(span);
  } else {
    out.appendChild(document.createTextNode(text));
  }
  out.scrollTop = out.scrollHeight;
}

function builtinRead(x) {
  if (Sk.builtinFiles === undefined || Sk.builtinFiles['files'][x] === undefined)
    throw "File not found: '" + x + "'";
  return Sk.builtinFiles['files'][x];
}

function updateRunControls() {
  runBtn.disabled = running || !skulptReady;
  for (const id of ['examples', 'challengeBtn', 'clearBtn', 'restartChallengeBtn',
                    'leaveChallengeBtn', 'nextLevelBtn', 'editLevelBtn']) {
    $(id).disabled = running;
  }
}

async function runCode() {
  if (!skulptReady || running) return;
  running = true;
  updateRunControls();
  saveChallengeCode();
  $('levelResult').hidden = true;
  statusEl.textContent = '執行中…';
  out.textContent = '';
  Game.redraw();

  Sk.configure({
    output: t => addOut(t, false),
    read: builtinRead,
    __future__: Sk.python3,
    inputfun: p => { const v = prompt(p || ''); return v === null ? '' : v; },
    inputfunTakesPrompt: true,
    yieldLimit: 100,
    execLimit: Number.POSITIVE_INFINITY
  });

  try {
    await Sk.misceval.asyncToPromise(() =>
      Sk.importMainWithBody('<stdin>', false, getCode(), true));
    if (challenge.active && (Game.mode !== 'maze' || Game.mazeName !== currentLevel().id)) {
      Game.end(false, '目前是第 ' + (challenge.level + 1) + ' 關，請保留 game.set_maze("' + currentLevel().id + '")');
    } else {
      await Game.finish();
      if (challenge.active && Game.result && Game.result.ok && !stopRequested) {
        const id = currentLevel().id;
        if (!challenge.completed.includes(id)) challenge.completed.push(id);
        saveChallenge();
        updateChallengeBar();
        showLevelResult(Game.result.msg);
      }
    }
  } catch (e) {
    if (e.toString().includes('TimeLimitError')) {
      Game.over = true;
      addOut('\n⏹ 已停止執行\n', true);
    } else {
      addOut('\n' + e.toString() + '\n', true);
      if (e.toString().includes('IndexError')) {
        await Game.fall();
        Game.end(false, 'IndexError：沒有這一格');
      } else if (challenge.active && Game.result && Game.result.ok) {
        Game.end(false, '程式仍有錯誤，請修正後再執行');
      }
    }
  } finally {
    if (stopRequested && challenge.active) Game.end(false, '已停止執行，請重新執行本關');
    running = false;
    stopRequested = false;
    updateRunControls();
    statusEl.textContent = '✅ 準備好了';
    if (!$('levelResult').hidden) {
      ($('nextLevelBtn').hidden ? $('editLevelBtn') : $('nextLevelBtn')).focus();
    }
  }
}

let stopRequested = false;
runBtn.onclick = runCode;
$('stopBtn').onclick = () => {
  if (running && window.Sk) {
    stopRequested = true;
    Sk.execLimit = 1;
    Game.over = true;
  }
};
$('clearBtn').onclick = () => {
  if (running) return;
  out.textContent = '';
  $('levelResult').hidden = true;
  Game.redraw();
};

/* ===================== 【區塊】4. 拖曳調整分區大小 ===================== */
function dragSplit(handle, onMove) {
  handle.addEventListener('pointerdown', e => {
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    document.body.classList.add('dragging');
    const up = () => {
      document.body.classList.remove('dragging');
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', up);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', up);
  });
}
dragSplit($('vsplit'), e => {                 // 左右：調整左半部（遊戲）寬度
  const r = $('main').getBoundingClientRect();
  $('left').style.width = Math.min(Math.max(e.clientX - r.left, 160), r.width - 246) + 'px';
});
dragSplit($('hsplit'), e => {                 // 上下：調整遊戲畫面高度
  const r = $('left').getBoundingClientRect();
  $('graphWrap').style.flex = '0 0 ' + Math.min(Math.max(e.clientY - r.top, 120), r.height - 66) + 'px';
});

/* ===================== 【區塊】5. 範例選單 ===================== */
// 注意：範例程式碼裡不能出現反引號（`）和 ${
const EXAMPLES = {
  // ---------- 跳躍遊戲（地圖 0 = 障礙、1 = 平地；動作 0 = 跳、1 = 走） ----------
  jump_L1: `import game

game.set_map([0, 1, 1, 1, 0, 1, 0, 0])   # 地圖：0 = 障礙，1 = 平地

moves = [0, 1, 1, 1, 0, 1, 0, 0]         # 你的動作：0 = 跳，1 = 走
# 試試看：改掉其中一個數字，角色會在第幾格失敗？

game.play(moves)
`,
  jump_L2: `import game

game.set_map([0, 1, 1, 1, 0, 1, 0, 0])

s = input("請輸入動作（例如 01110100）：")

moves = []
for ch in s:                   # 字串一個字一個字拿出來
    moves.append(int(ch))      # 文字 → 數字，放進串列

print("你的動作：", moves)
print("共", len(moves), "步")

game.play(moves)
`,
  jump_L3: `import game

game.set_map([0, 1, 1, 1, 0, 1, 0, 0])
moves = [0, 1, 1, 1, 0, 1, 0, 0]

for i in range(len(moves)):                      # i = 0, 1, 2, ...
    print("第", i, "步，動作是", moves[i])
    game.step(moves[i])                          # 角色做一步
`,
  // ---------- 森林迷宮（w 上、s 下、a 左、d 右、j 往面向的方向跳過水窪） ----------
  maze_L1: `import game

game.set_maze()        # 載入森林迷宮：從左上角出發，旗子是終點

# 動作：w = 上，s = 下，a = 左，d = 右
# 樹要繞過去；水窪要用 j 跳過（往角色面向的方向跳一格）
moves = ["d", "j", "d", "s"]   # 先走四步看看，再接著往後面加

game.play(moves)
`,
  maze_L2: `import game

game.set_maze()

s = input("請輸入動作（例如 djdssaa）：")

moves = []
for ch in s:
    moves.append(ch)          # 字母直接放進去，不用轉成數字

print("共", len(moves), "步")
game.play(moves)
`,
  maze_L3: `import game

game.set_maze("loop")

segment = ["d", "j", "s", "s"]
repeats = 3

print("每段動作：", segment)
print("規劃動作數：", len(segment) * repeats)

for i in range(repeats):
    print("第", i + 1, "段")
    game.play(segment)
`,
  // ---------- 森林迷宮 13 關（只給開頭與提示，不放完整解答） ----------
  L1: `import game

game.set_maze("L1")    # 第 1 關：森林入口

# 動作：d = 右，s = 下（一個字母走一格）
# 先數格子：往右要走幾格？往下要走幾格？
moves = ["d", "d"]     # 已經走了兩步，請接著往後加

game.play(moves)
`,
  L2: `import game

game.set_maze("L2")    # 第 2 關：曲折小徑

# 先把道路拆成幾條直路，再照順序接起來
# 執行前先猜猜看：第一次轉彎是第幾個動作？
moves = ["d", "d", "s"]     # 請接著往後加

game.play(moves)
`,
  L3: `import game

game.set_maze("L3")    # 第 3 關：第一座水窪

# 水窪不能直接走進去，要用 j 跳過（一次跨兩格）
# j 是往角色「目前面向」的方向跳，所以要先朝水窪走一步，再跳
moves = ["d", "d", "s", "s"]     # 請接著往後加

game.play(moves)
`,
  L4: `import game

game.set_maze("L4")    # 第 4 關：繞路才有出口

# 這一關會用到 w = 上、a = 左
# 離旗子比較近的路，不一定真的通到旗子，先用眼睛走一遍
moves = ["s", "s"]     # 請接著往後加

game.play(moves)
`,
  L5: `import game

game.set_maze("L5")    # 第 5 關：一步一步執行

moves = ["d", "d", "j"]        # 請接著往後加，走到旗子

for move in moves:             # 每一輪只拿出一個動作
    print("動作：", move)
    game.step(move)            # 角色做一步
`,
  L6: `import game

game.set_maze("L6")    # 第 6 關：數清直路

# 直路跨過幾格，就要走幾步（起點那一格不算）
for i in range(7):       # 第一條直路：往右 7 步
    game.step("d")

for i in range(2):       # 第二條直路：往下 2 步
    game.step("s")

# 後面還有三條直路，請照樣寫下去
# 執行前先猜猜看：如果少走一步，角色會停在哪裡？
`,
  L7: `import game

game.set_maze("L7")    # 第 7 關：修好路線計畫

# 這份路線計畫有 2 個地方寫錯了，請找出來並修好
moves = ["s", "s", "s", "s", "s", "s", "d", "w", "w", "w", "w", "w",
         "w", "d", "d", "s", "s", "s", "s", "s", "j", "j", "d"]

for i in range(len(moves)):              # i 是索引，從 0 開始
    print("索引", i, "動作", moves[i])
    game.step(moves[i])
# 提示：失敗訊息裡的「第幾步」就是索引
`,
  L8: `import game

game.set_maze("L8")    # 第 8 關：迴圈階梯

segment = ["d", "j", "s", "s"]   # 一段路線
repeats = 1                      # 這段路線要重複幾次才會到旗子？請修改

print("規劃動作數：", len(segment) * repeats)

for i in range(repeats):
    print("第", i + 1, "段")
    game.play(segment)
# 過關後試試看：少重複一次，角色會停在哪裡？
`,
  L9: `import game

game.set_maze("L9")    # 第 9 關：反向的階梯

for i in range(9):         # 引導段：沿著上面往右 9 步
    game.step("d")
game.play(["s", "s"])      # 再往下 2 步

segment = []               # 重複段：請填入「一段」的動作（這次是往左的階梯）
repeats = 3

for i in range(repeats):
    game.play(segment)

# 終點段：請自己寫（先往下，再沿著下面往右）
`,
  L10: `import game

game.set_maze("L10")   # 第 10 關：森林的重複規律（從右上走到左下）

moves = []
segment = ["a", "a", "w"]      # 走完一個「67」：只寫了開頭，請補完（一段有 11 個動作）
repeats = 3

for i in range(repeats):       # 外層：重複整段
    for move in segment:       # 內層：一次放進一個動作
        moves.append(move)

print("共", len(moves), "個動作")
game.play(moves)
`,
  L11: `import game

game.set_maze("L11")   # 第 11 關：最後一段不一樣

segment = ["d", "j"]       # 重複的一段：還少一個動作，請補上
repeats = 3
tail = []                  # 尾段：和前面的規律不一樣，請自己填（共 12 個動作）

for i in range(repeats):
    game.play(segment)

game.play(tail)
`,
  L12: `import game

game.set_maze("L12")   # 第 12 關：比較兩條路

# 有兩條路都能到旗子：一條先往右，一條先往下
route_a = ["d", "d", "d", "d", "j"]    # 先往右的路：請接著寫完
route_b = ["s", "s", "s"]              # 先往下的路：請接著寫完

print("route_a 共", len(route_a), "個動作")
print("route_b 共", len(route_b), "個動作")

moves = route_a            # 想走哪一條，就把它放進 moves
for move in moves:
    game.step(move)
# 注意：一次 j 算一個動作，但是位置跨了兩格
`,
  L13: `import game

game.set_maze("L13")   # 第 13 關：森林畢業考

# 先把路線拆成：引導段 → 重複段 A → 連接段 → 重複段 B → 尾段
moves = ["d"]              # 引導段

seg_a = []                 # 重複段 A：請自己找出來
for i in range(3):
    for move in seg_a:
        moves.append(move)

# 連接段、重複段 B：請接著寫

# 尾段：三條橫道的走法一樣（下 2 步 → 走一段 → 跳 → 再走一段），只有方向不同
directions = []                # 三條橫道各往哪個方向，請填
for d in directions:           # 外層：一條橫道
    moves.append("s")
    moves.append("s")
    for i in range(0):         # 內層：同一個方向走幾步？請改 0
        moves.append(d)
    # 請補完：跳過水窪，再用一個 for 走完這條橫道

print("共", len(moves), "個動作")
game.play(moves)
`
};

const LEVELS = ['森林入口', '曲折小徑', '第一座水窪', '繞路才有出口',
  '一步一步執行', '數清直路', '修好路線計畫', '迴圈階梯', '反向的階梯',
  '森林的重複規律', '最後一段不一樣', '比較兩條路', '森林畢業考']
  .map((name, i) => ({ id: 'L' + (i + 1), name }));
const CHALLENGE_KEY = 'pythonGame.challenge.v1';
let challenge = { active: false, level: 0, completed: [], codes: {} };
let practice = null, progressSaved = true;

try {
  const saved = JSON.parse(localStorage.getItem(CHALLENGE_KEY));
  if (saved && Number.isInteger(saved.level) && saved.level >= 0 && saved.level < LEVELS.length) {
    challenge.level = saved.level;
    challenge.active = saved.active === true;
    if (Array.isArray(saved.completed)) {
      challenge.completed = LEVELS.filter(level => saved.completed.includes(level.id)).map(level => level.id);
    }
    if (saved.codes && typeof saved.codes === 'object') {
      for (const level of LEVELS) {
        if (typeof saved.codes[level.id] === 'string') challenge.codes[level.id] = saved.codes[level.id];
      }
    }
    const draft = saved.practice;
    if (draft && typeof draft.code === 'string' &&
        ((draft.mode === 'maze' && ['forest', 'loop', ...LEVELS.map(level => level.id)].includes(draft.maze)) ||
         (draft.mode === 'jump' && Array.isArray(draft.map) && draft.map.every(Number.isFinite)))) {
      practice = draft;
    }
  }
} catch (e) {
  progressSaved = false;
}

function currentLevel() { return LEVELS[challenge.level]; }

function saveChallenge() {
  try {
    localStorage.setItem(CHALLENGE_KEY, JSON.stringify({ ...challenge, practice }));
    progressSaved = true;
  } catch (e) {
    progressSaved = false;
  }
  $('saveStatus').textContent = progressSaved
    ? '進度與程式碼儲存在這台電腦的瀏覽器'
    : '無法儲存：關閉或重新整理後會失去本次進度';
}

function saveChallengeCode() {
  if (!challenge.active) return;
  challenge.codes[currentLevel().id] = getCode();
  saveChallenge();
}
codeBox.addEventListener('input', saveChallengeCode);

function updateChallengeBar() {
  $('challengeBar').hidden = !challenge.active;
  $('challengeBtn').setAttribute('aria-pressed', String(challenge.active));
  $('levelResult').hidden = true;
  if (!challenge.active) return;
  $('levelTitle').textContent = '第 ' + (challenge.level + 1) + ' / ' + LEVELS.length + ' 關｜' + currentLevel().name;
  $('levelProgress').textContent = '已完成 ' + challenge.completed.length + ' / ' + LEVELS.length + ' 關';
}

function showLevelResult(msg) {
  const allDone = challenge.completed.length === LEVELS.length;
  $('resultTitle').textContent = allDone ? '13 關全部完成！' : '第 ' + (challenge.level + 1) + ' 關已完成';
  $('resultText').textContent = allDone
    ? '恭喜完成森林畢業考！可以繼續修改程式，或按「重新闖關」再挑戰。'
    : (msg || '這一關的進度已保存，可以繼續前往下一關。');
  $('nextLevelBtn').hidden = challenge.level === LEVELS.length - 1;
  $('levelResult').hidden = false;
}

function loadChallengeLevel(index) {
  challenge.level = index;
  const level = currentLevel();
  setCode(challenge.codes[level.id] ?? EXAMPLES[level.id]);
  out.textContent = '';
  Game.setMaze(level.id);
  updateChallengeBar();
  saveChallengeCode();
  if (challenge.completed.includes(level.id)) showLevelResult();
}

function rememberPractice() {
  practice = { code: getCode(), mode: Game.mode, maze: Game.mazeName, map: Game.map.slice() };
}

$('challengeBtn').onclick = () => {
  if (running || challenge.active) return;
  rememberPractice();
  challenge.active = true;
  loadChallengeLevel(challenge.level);
};
$('nextLevelBtn').onclick = () => {
  if (running || !challenge.active || $('levelResult').hidden ||
      !challenge.completed.includes(currentLevel().id) || challenge.level === LEVELS.length - 1) return;
  saveChallengeCode();
  loadChallengeLevel(challenge.level + 1);
  if (cm) cm.focus(); else codeBox.focus();
};
$('editLevelBtn').onclick = () => {
  if (running) return;
  $('levelResult').hidden = true;
  if (cm) cm.focus(); else codeBox.focus();
};
$('leaveChallengeBtn').onclick = () => {
  if (running || !challenge.active) return;
  saveChallengeCode();
  challenge.active = false;
  saveChallenge();
  updateChallengeBar();
  setCode(practice.code);
  out.textContent = '';
  if (practice.mode === 'maze') Game.setMaze(practice.maze);
  else Game.setMap(practice.map);
};
$('restartChallengeBtn').onclick = () => {
  if (running || !challenge.active || !confirm('重新闖關會清除這 13 關的完成紀錄與程式碼，從第 1 關開始。確定嗎？')) return;
  challenge = { active: true, level: 0, completed: [], codes: {} };
  loadChallengeLevel(0);
};

$('examples').onchange = e => {
  if (running) { e.target.value = ''; return; }
  const v = e.target.value;
  if (EXAMPLES[v] && !/^L\d+$/.test(v)) {
    saveChallengeCode();
    challenge.active = false;
    saveChallenge();
    updateChallengeBar();
    setCode(EXAMPLES[v]);
    out.textContent = '';
    if (v.startsWith('maze')) Game.setMaze(v === 'maze_L3' ? 'loop' : 'forest');
    else Game.setMap([0, 1, 1, 1, 0, 1, 0, 0]);
  }
  e.target.value = '';
};

if (challenge.active) {
  if (!practice) rememberPractice();
  loadChallengeLevel(challenge.level);
}
