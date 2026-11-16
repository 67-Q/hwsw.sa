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

async function runCode() {
  if (!skulptReady || running) return;
  running = true;
  runBtn.disabled = true;
  statusEl.textContent = '執行中…';
  out.textContent = '';
  Game.redraw();                              // 【遊戲版】用同一張地圖重新擺好，角色回到起點

  Sk.configure({
    output: t => addOut(t, false),
    read: builtinRead,
    __future__: Sk.python3,
    inputfun: p => { const v = prompt(p || ''); return v === null ? '' : v; },
    inputfunTakesPrompt: true,
    yieldLimit: 100,                          // 讓畫面可以即時更新、也能按「停止」
    execLimit: Number.POSITIVE_INFINITY
  });

  try {
    await Sk.misceval.asyncToPromise(() =>
      Sk.importMainWithBody('<stdin>', false, getCode(), true));
    await Game.finish();                      // 【遊戲版】程式跑完了：判定有沒有走到終點
  } catch (e) {
    if (e.toString().includes('TimeLimitError')) {
      Game.over = true;
      addOut('\n⏹ 已停止執行\n', true);       // 按「停止」時顯示的友善訊息
    } else {
      addOut('\n' + e.toString() + '\n', true);
      if (e.toString().includes('IndexError')) {   // 【遊戲版】索引超出範圍：角色掉下去
        await Game.fall();
        Game.end(false, 'IndexError：沒有這一格');
      }
    }
  }
  running = false;
  runBtn.disabled = false;
  statusEl.textContent = '✅ 準備好了';
}

runBtn.onclick = runCode;
$('stopBtn').onclick = () => {
  if (running && window.Sk) { Sk.execLimit = 1; Game.over = true; }   // Game.over：讓還在跑的動作立刻結束
};
$('clearBtn').onclick = () => {
  out.textContent = '';
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

game.set_map([0, 1, 1, 1, 0, 1, 0, 0])   

moves = [0, 1, 1, 1, 0, 1, 0, 0]        
# 試試看改掉其中一個數字，角色會在第幾格失敗？

game.play(moves)
`,
  jump_L2: `import game

game.set_map([0, 1, 1, 1, 0, 1, 0, 0])

s = input("請輸入動作（例如 01110100）:")

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
  // ---------- 迷宮遊戲（w 上、s 下、a 左、d 右、j 原地跳） ----------
  maze_L1: `import game

game.set_maze()        # 載入迷宮：從左上角出發，紅色方塊是終點

# 動作：w = 上、s = 下、a = 左、d = 右（j = 原地跳一下）
moves = ["s", "s", "d", "d"]   

game.play(moves)
`,
  maze_L2: `import game

game.set_maze()

s = input("請輸入動作（例如 ssddwa）：")

moves = []
for ch in s:
    moves.append(ch)          # 字母直接放進去，不用轉成數字

print("共", len(moves), "步")
game.play(moves)
`
};

$('examples').onchange = e => {
  const v = e.target.value;
  if (EXAMPLES[v]) {
    setCode(EXAMPLES[v]);
    out.textContent = '';
    if (v.startsWith('maze')) Game.setMaze();                       // 先預覽這個範例的地圖
    else Game.setMap([0, 1, 1, 1, 0, 1, 0, 0]);
  }
  e.target.value = '';
};
