(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const MAZE_METHODS = {
    "recursive-backtracker": "穴掘り法",
    // Keep the name for mazes created by older versions and saved in local history.
    "randomized-prim": "ランダムPrim法",
  };
  const DIRS = [
    { name: "up", label: "上へ", arrow: "↑", dr: -1, dc: 0, opposite: "down" },
    { name: "right", label: "右へ", arrow: "→", dr: 0, dc: 1, opposite: "left" },
    { name: "down", label: "下へ", arrow: "↓", dr: 1, dc: 0, opposite: "up" },
    { name: "left", label: "左へ", arrow: "←", dr: 0, dc: -1, opposite: "right" },
  ];
  const DB_NAME = "picture-maze-local";
  const DB_VERSION = 1;

  const els = {
    historyCount: $("#historyCount"),
    historyList: $("#historyList"),
    stageEyebrow: $("#stageEyebrow"),
    stageTitle: $("#stageTitle"),
    stageActions: $("#stageActions"),
    emptyState: $("#emptyState"),
    customGridSize: $("#customGridSize"),
    generateDigButton: $("#generateDigButton"),
    emptyDigButton: $("#emptyDigButton"),
    puzzleView: $("#puzzleView"),
    mazeCanvas: $("#mazeCanvas"),
    mazeDimensions: $("#mazeDimensions"),
    moveCount: $("#moveCount"),
    progressLabel: $("#progressLabel"),
    resetButton: $("#resetButton"),
    solutionButton: $("#solutionButton"),
    solutionDetails: $("#solutionDetails"),
    solutionStatus: $("#solutionStatus"),
    solutionLength: $("#solutionLength"),
    directionSequence: $("#directionSequence"),
    gameMessage: $("#gameMessage"),
    newMazeButton: $("#newMazeButton"),
    printButton: $("#printButton"),
    printDialog: $("#printDialog"),
    confirmPrintButton: $("#confirmPrintButton"),
    toast: $("#toast"),
  };

  const state = {
    customGridSize: 15,
    maze: null,
    solution: [],
    playerPath: [],
    revealSolution: false,
    historyId: null,
    history: [],
    saveTimer: null,
    toastTimer: null,
    db: null,
  };

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("visible");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => els.toast.classList.remove("visible"), 2900);
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("このブラウザではローカル保存を利用できません。"));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("puzzles")) {
          const store = db.createObjectStore("puzzles", { keyPath: "id" });
          store.createIndex("createdAt", "createdAt", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("保存領域を開けませんでした。"));
    });
  }

  function dbRequest(mode, action) {
    return new Promise((resolve, reject) => {
      if (!state.db) {
        reject(new Error("保存領域を利用できません。"));
        return;
      }
      const transaction = state.db.transaction("puzzles", mode);
      const request = action(transaction.objectStore("puzzles"));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("保存に失敗しました。"));
      transaction.onabort = () => reject(transaction.error || new Error("保存に失敗しました。"));
    });
  }

  const dbGetAll = () => dbRequest("readonly", store => store.getAll());
  const dbPut = record => dbRequest("readwrite", store => store.put(record));
  const dbDelete = id => dbRequest("readwrite", store => store.delete(id));

  function makeId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `maze-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function formatDate(timestamp) {
    return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(new Date(timestamp));
  }

  function escapeLabel(value) {
    return String(value || "").replace(/\.[^.]+$/, "").slice(0, 40) || "迷路";
  }

  function diggingMethod(maze) {
    return MAZE_METHODS[maze?.routeStyle] || MAZE_METHODS["recursive-backtracker"];
  }

  function boundarySide(index, size) {
    const row = Math.floor(index / size);
    const col = index % size;
    if (row === 0) return "up";
    if (col === size - 1) return "right";
    if (row === size - 1) return "down";
    if (col === 0) return "left";
    return null;
  }

  function createDiggingMazeCandidate(size) {
    const count = size * size;
    const cells = Array.from({ length: count }, () => ({
      walls: { up: true, right: true, down: true, left: true },
    }));
    const visited = new Uint8Array(count);
    visited[0] = 1;

    const carve = (from, to, direction) => {
      cells[from].walls[direction.name] = false;
      cells[to].walls[direction.opposite] = false;
    };

    const stack = [0];
    // Iterative recursive-backtracker: dig into a random unvisited neighbor, then backtrack at dead ends.
    while (stack.length) {
      const current = stack[stack.length - 1];
      const row = Math.floor(current / size);
      const col = current % size;
      const options = DIRS.map(dir => ({
        dir,
        row: row + dir.dr,
        col: col + dir.dc,
      })).filter(next =>
        next.row >= 0 && next.row < size && next.col >= 0 && next.col < size &&
        !visited[next.row * size + next.col],
      );
      if (!options.length) {
        stack.pop();
        continue;
      }
      const next = options[Math.floor(Math.random() * options.length)];
      const nextIndex = next.row * size + next.col;
      carve(current, nextIndex, next.dir);
      visited[nextIndex] = 1;
      stack.push(nextIndex);
    }

    const start = 0;
    const end = count - 1;
    const startSide = "up";
    const endSide = "down";
    cells[start].walls[startSide] = false;
    cells[end].walls[endSide] = false;
    return {
      size,
      cells,
      mask: new Array(count).fill(1),
      start,
      end,
      startSide,
      endSide,
      routeStyle: "recursive-backtracker",
    };
  }

  function createDiggingMaze(size) {
    const candidateCount = 8;
    let bestMaze = null;
    let longestRouteLength = -1;
    let equallyLongCandidates = 0;
    for (let attempt = 0; attempt < candidateCount; attempt += 1) {
      const candidate = createDiggingMazeCandidate(size);
      const routeLength = solveMaze(candidate).length;
      if (routeLength > longestRouteLength) {
        bestMaze = candidate;
        longestRouteLength = routeLength;
        equallyLongCandidates = 1;
      } else if (routeLength === longestRouteLength) {
        equallyLongCandidates += 1;
        if (Math.random() < 1 / equallyLongCandidates) bestMaze = candidate;
      }
    }
    return bestMaze;
  }

  function neighbors(index, maze = state.maze) {
    const row = Math.floor(index / maze.size);
    const col = index % maze.size;
    return DIRS.map(dir => ({
      dir,
      row: row + dir.dr,
      col: col + dir.dc,
    })).filter(option =>
      option.row >= 0 && option.row < maze.size &&
      option.col >= 0 && option.col < maze.size &&
      maze.mask?.[option.row * maze.size + option.col] &&
      !maze.cells[index].walls[option.dir.name],
    ).map(option => ({ index: option.row * maze.size + option.col, dir: option.dir }));
  }

  function solveMaze(maze) {
    const start = maze.start ?? 0;
    const end = maze.end ?? maze.cells.length - 1;
    const previous = new Array(maze.cells.length).fill(-1);
    const queue = [start];
    previous[start] = start;
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head];
      if (current === end) break;
      neighbors(current, maze).forEach(({ index }) => {
        if (previous[index] !== -1) return;
        previous[index] = current;
        queue.push(index);
      });
    }
    if (previous[end] === -1) return [];
    const result = [];
    for (let current = end; ; current = previous[current]) {
      result.push(current);
      if (current === start) break;
    }
    return result.reverse();
  }

  function directionsFor(path = state.solution) {
    const directions = [];
    for (let i = 1; i < path.length; i += 1) {
      const previous = path[i - 1];
      const current = path[i];
      const rowDiff = Math.floor(current / state.maze.size) - Math.floor(previous / state.maze.size);
      const colDiff = current % state.maze.size - previous % state.maze.size;
      const dir = DIRS.find(candidate => candidate.dr === rowDiff && candidate.dc === colDiff);
      directions.push(dir);
    }
    const groups = [];
    directions.forEach((dir, index) => {
      const last = groups[groups.length - 1];
      if (last && last.name === dir.name) {
        last.count += 1;
        last.end = index + 1;
      } else {
        groups.push({ name: dir.name, label: dir.label, arrow: dir.arrow, count: 1, start: index + 1, end: index + 1 });
      }
    });
    return groups;
  }

  function roundedMarker(context, x, y, color, text, cell) {
    const radius = Math.min(cell * 0.22, 17);
    context.save();
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = `600 ${Math.max(8, Math.min(15, cell * 0.28))}px 'DM Sans', sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, x, y + .5);
    context.restore();
  }

  function renderMazeOnCanvas(canvas, options = {}) {
    const showSolution = options.showSolution ?? state.revealSolution;
    const showPlayer = options.showPlayer ?? true;
    const context = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    if (!state.maze) return;

    const margin = width * 0.075;
    const gridSize = width - margin * 2;
    const cellSize = gridSize / state.maze.size;

    const position = index => ({
      x: margin + (index % state.maze.size + .5) * cellSize,
      y: margin + (Math.floor(index / state.maze.size) + .5) * cellSize,
    });
    const entrancePosition = (index, side) => {
      const point = position(index);
      if (side === "up") point.y -= cellSize / 2;
      if (side === "right") point.x += cellSize / 2;
      if (side === "down") point.y += cellSize / 2;
      if (side === "left") point.x -= cellSize / 2;
      return point;
    };

    if (showSolution && state.solution.length > 1) {
      context.save();
      context.beginPath();
      const startEntrance = entrancePosition(state.maze.start, state.maze.startSide || boundarySide(state.maze.start, state.maze.size));
      context.moveTo(startEntrance.x, startEntrance.y);
      state.solution.forEach(index => {
        const point = position(index);
        context.lineTo(point.x, point.y);
      });
      const endEntrance = entrancePosition(state.maze.end, state.maze.endSide || boundarySide(state.maze.end, state.maze.size));
      context.lineTo(endEntrance.x, endEntrance.y);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "rgba(255, 255, 255, .82)";
      context.lineWidth = Math.max(5, cellSize * .48);
      context.stroke();
      context.strokeStyle = "#c65342";
      context.globalAlpha = .92;
      context.lineWidth = Math.max(2.2, cellSize * .19);
      context.stroke();
      context.restore();
    }

    context.save();
    context.strokeStyle = "#243d5a";
    context.lineWidth = Math.max(2.2, cellSize * .105);
    context.lineCap = "square";
    context.lineJoin = "miter";
    context.beginPath();
    state.maze.cells.forEach((cell, index) => {
      if (!state.maze.mask[index]) return;
      const row = Math.floor(index / state.maze.size);
      const col = index % state.maze.size;
      const x = margin + col * cellSize;
      const y = margin + row * cellSize;
      if (cell.walls.up) {
        context.moveTo(x, y); context.lineTo(x + cellSize, y);
      }
      if (cell.walls.right) {
        context.moveTo(x + cellSize, y); context.lineTo(x + cellSize, y + cellSize);
      }
      if (cell.walls.down) {
        context.moveTo(x, y + cellSize); context.lineTo(x + cellSize, y + cellSize);
      }
      if (cell.walls.left) {
        context.moveTo(x, y); context.lineTo(x, y + cellSize);
      }
    });
    context.stroke();
    context.restore();

    if (showPlayer && !showSolution && state.playerPath.length > 1) {
      context.save();
      context.beginPath();
      const startEntrance = entrancePosition(state.maze.start, state.maze.startSide || boundarySide(state.maze.start, state.maze.size));
      context.moveTo(startEntrance.x, startEntrance.y);
      state.playerPath.forEach(index => {
        const point = position(index);
        context.lineTo(point.x, point.y);
      });
      if (state.playerPath[state.playerPath.length - 1] === state.maze.end) {
        const endEntrance = entrancePosition(state.maze.end, state.maze.endSide || boundarySide(state.maze.end, state.maze.size));
        context.lineTo(endEntrance.x, endEntrance.y);
      }
      context.strokeStyle = "#c65342";
      context.globalAlpha = .88;
      context.lineWidth = Math.max(4, cellSize * .42);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();
      context.restore();
    }

    const start = entrancePosition(state.maze.start, state.maze.startSide || boundarySide(state.maze.start, state.maze.size));
    const goal = entrancePosition(state.maze.end, state.maze.endSide || boundarySide(state.maze.end, state.maze.size));
    const currentPosition = state.playerPath[state.playerPath.length - 1] ?? state.maze.start;
    roundedMarker(context, start.x, start.y, "#3e79bd", "S", cellSize);
    roundedMarker(context, goal.x, goal.y, "#bd684a", "G", cellSize);

    if (showPlayer && state.playerPath.length && currentPosition !== state.maze.start && currentPosition !== state.maze.end) {
      const player = position(state.playerPath[state.playerPath.length - 1]);
      context.save();
      context.fillStyle = "#ffffff";
      context.beginPath();
      context.arc(player.x, player.y, Math.max(5, cellSize * .22), 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#255b97";
      context.beginPath();
      context.arc(player.x, player.y, Math.max(3, cellSize * .12), 0, Math.PI * 2);
      context.fill();
      context.restore();
    }
  }

  function drawMaze() {
    renderMazeOnCanvas(els.mazeCanvas);
  }

  function updateProgress() {
    if (!state.maze) return;
    const moves = Math.max(0, state.playerPath.length - 1);
    const position = state.playerPath[state.playerPath.length - 1] ?? state.maze.start;
    els.moveCount.textContent = String(moves);
    if (position === state.maze.end) {
      els.progressLabel.textContent = "ゴール！";
      els.gameMessage.textContent = `クリア！ ${moves}歩でゴールしました。`;
      els.gameMessage.style.color = "#2f68a8";
      els.solutionStatus.textContent = "クリアおめでとう！正解ルートも確認できます。";
    } else if (moves === 0) {
      els.progressLabel.textContent = "スタートから進もう";
      els.gameMessage.textContent = "左上のスタートから右下のゴールを目指そう。";
      els.gameMessage.style.color = "";
      els.solutionStatus.textContent = "正解ルートと進む順番を確認できます。";
    } else {
      els.progressLabel.textContent = `マス ${position + 1} にいるよ`;
      els.gameMessage.textContent = "行き止まりに気をつけて進もう。";
      els.gameMessage.style.color = "";
      els.solutionStatus.textContent = "正解ルートと進む順番を確認できます。";
    }
    drawMaze();
  }

  function renderDirections() {
    els.directionSequence.replaceChildren();
    const groups = directionsFor();
    groups.forEach(group => {
      const chip = document.createElement("span");
      chip.className = "direction-chip";
      const range = group.start === group.end ? String(group.start) : `${group.start}–${group.end}`;
      chip.append(document.createTextNode(`${group.arrow} ${group.count}マス`));
      const sub = document.createElement("small");
      sub.textContent = `手順 ${range}`;
      chip.append(sub);
      els.directionSequence.append(chip);
    });
    els.solutionLength.textContent = `${Math.max(0, state.solution.length - 1)}歩`;
    return groups;
  }

  function renderStage() {
    const hasMaze = Boolean(state.maze);
    document.body.classList.toggle("puzzle-active", hasMaze);
    els.emptyState.hidden = hasMaze;
    els.puzzleView.hidden = !hasMaze;
    els.stageActions.hidden = !hasMaze;
    if (!hasMaze) {
      els.stageEyebrow.textContent = "YOUR NEXT MAZE";
      els.stageTitle.textContent = "マス数を決めて迷路をつくろう。";
      return;
    }
    els.stageEyebrow.textContent = "YOUR MAZE";
    els.stageTitle.textContent = `${diggingMethod(state.maze)} · ${state.maze.size} × ${state.maze.size}`;
    els.mazeDimensions.textContent = `${state.maze.size} × ${state.maze.size}`;
    updateProgress();
    if (state.revealSolution) renderDirections();
  }

  function getCurrentRecord() {
    if (!state.maze) return null;
    const record = {
      id: state.historyId || makeId(),
      createdAt: state.createdAt || Date.now(),
      updatedAt: Date.now(),
      mazeType: "digging",
      size: state.maze.size,
      maze: state.maze,
      playerPath: state.playerPath,
    };
    return record;
  }

  async function persistCurrent({ announce = false } = {}) {
    const record = getCurrentRecord();
    if (!record) return;
    const isNew = !state.history.some(item => item.id === record.id);
    state.historyId = record.id;
    try {
      await dbPut(record);
      if (announce || isNew) await refreshHistory();
      if (announce) showToast("迷路をこの端末に保存しました。");
    } catch (error) {
      console.warn("Unable to save this maze locally", error);
      if (announce) showToast("保存できませんでした。ブラウザの保存容量を確認してください。");
    }
  }

  function queuePersist() {
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(() => { void persistCurrent(); }, 280);
  }

  async function generateDiggingPuzzle() {
    const size = Number(els.customGridSize.value);
    if (!Number.isInteger(size) || size < 5 || size > 101) {
      showToast("マス数は5から101までの整数で指定してください。");
      els.customGridSize.focus();
      return;
    }
    state.customGridSize = size;
    state.maze = createDiggingMaze(size);
    state.solution = solveMaze(state.maze);
    state.playerPath = [state.maze.start];
    state.revealSolution = false;
    state.historyId = makeId();
    state.createdAt = Date.now();
    els.solutionButton.setAttribute("aria-expanded", "false");
    els.solutionButton.querySelector("span:first-child").textContent = "答えを見る";
    els.solutionDetails.hidden = true;
    renderStage();
    await persistCurrent({ announce: true });
    els.mazeCanvas.focus({ preventScroll: true });
  }

  function move(directionName) {
    if (!state.maze) return;
    const direction = DIRS.find(item => item.name === directionName);
    if (!direction) return;
    const current = state.playerPath[state.playerPath.length - 1] ?? state.maze.start;
    const currentRow = Math.floor(current / state.maze.size);
    const currentCol = current % state.maze.size;
    const row = currentRow + direction.dr;
    const col = currentCol + direction.dc;
    if (row < 0 || row >= state.maze.size || col < 0 || col >= state.maze.size) {
      return;
    }
    if (state.maze.cells[current].walls[direction.name]) {
      els.gameMessage.textContent = "そこは壁です。別の方向を試してみて。";
      els.gameMessage.style.color = "#b16d54";
      return;
    }
    const next = row * state.maze.size + col;
    if (state.playerPath.length > 1 && next === state.playerPath[state.playerPath.length - 2]) {
      state.playerPath.pop();
    } else {
      state.playerPath.push(next);
    }
    updateProgress();
    queuePersist();
  }

  function resetPlayer() {
    if (!state.maze) return;
    state.playerPath = [state.maze.start];
    updateProgress();
    queuePersist();
  }

  function toggleSolution() {
    if (!state.maze) return;
    state.revealSolution = !state.revealSolution;
    const opened = state.revealSolution;
    els.solutionDetails.hidden = !opened;
    els.solutionButton.setAttribute("aria-expanded", String(opened));
    els.solutionButton.querySelector("span:first-child").textContent = opened ? "答えを隠す" : "答えを見る";
    if (opened) renderDirections();
    drawMaze();
  }

  function renderHistory() {
    els.historyCount.textContent = String(state.history.length);
    els.historyList.replaceChildren();
    if (!state.history.length) {
      const empty = document.createElement("div");
      empty.className = "history-empty";
      const icon = document.createElement("span"); icon.setAttribute("aria-hidden", "true"); icon.textContent = "▧";
      const text = document.createElement("p"); text.innerHTML = "つくった迷路が<br>ここに並びます";
      empty.append(icon, text);
      els.historyList.append(empty);
      return;
    }
    state.history.forEach(record => {
      const row = document.createElement("div");
      row.className = "history-item";
      row.classList.toggle("active", record.id === state.historyId);
      row.dataset.id = record.id;
      const open = document.createElement("button");
      open.type = "button";
      open.className = "history-item-open";
      const recordTitle = `${diggingMethod(record.maze)} ${record.size} × ${record.size}`;
      open.setAttribute("aria-label", `${recordTitle}の迷路を開く`);
      open.style.cssText = "display:contents; border:0; padding:0; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer";
      const thumb = document.createElement("span");
      thumb.className = "history-thumb history-maze-thumb";
      thumb.textContent = "↗";
      const copy = document.createElement("span"); copy.className = "history-copy";
      const title = document.createElement("strong"); title.textContent = escapeLabel(recordTitle);
      const detail = document.createElement("small"); detail.textContent = formatDate(record.createdAt);
      copy.append(title, detail);
      open.append(thumb, copy);
      open.addEventListener("click", () => { void restorePuzzle(record); });
      const remove = document.createElement("button");
      remove.type = "button"; remove.className = "history-delete"; remove.textContent = "×";
      remove.setAttribute("aria-label", `${escapeLabel(recordTitle)}を履歴から削除`);
      remove.addEventListener("click", event => { event.stopPropagation(); void deletePuzzle(record.id); });
      row.append(open, remove);
      els.historyList.append(row);
    });
  }

  async function refreshHistory() {
    if (!state.db) return;
    try {
      state.history = (await dbGetAll())
        .filter(record => record.mazeType === "digging" && record.maze?.cells)
        .sort((a, b) => b.createdAt - a.createdAt);
      renderHistory();
    } catch (error) {
      console.warn("Unable to read local maze history", error);
    }
  }

  function normalizeStoredMaze(maze) {
    if (!Array.isArray(maze.mask)) maze.mask = new Array(maze.cells.length).fill(1);
    if (!Number.isInteger(maze.start)) maze.start = 0;
    if (!Number.isInteger(maze.end)) maze.end = maze.cells.length - 1;
    maze.startSide ||= boundarySide(maze.start, maze.size);
    maze.endSide ||= boundarySide(maze.end, maze.size);
    return maze;
  }

  async function restorePuzzle(record) {
    try {
      if (state.maze && state.historyId !== record.id) {
        window.clearTimeout(state.saveTimer);
        await persistCurrent();
      }
      let needsUpdate = false;
      state.customGridSize = Number(record.size) || 15;
      els.customGridSize.value = String(state.customGridSize);
      const storedMaze = normalizeStoredMaze(record.maze);
      const lastCell = storedMaze.cells.length - 1;
      const endpointsChanged = storedMaze.start !== 0 || storedMaze.end !== lastCell ||
        storedMaze.startSide !== "up" || storedMaze.endSide !== "down";
      if (endpointsChanged) {
        storedMaze.cells[storedMaze.start].walls[storedMaze.startSide] = true;
        storedMaze.cells[storedMaze.end].walls[storedMaze.endSide] = true;
        storedMaze.start = 0;
        storedMaze.end = lastCell;
        storedMaze.startSide = "up";
        storedMaze.endSide = "down";
        storedMaze.cells[storedMaze.start].walls[storedMaze.startSide] = false;
        storedMaze.cells[storedMaze.end].walls[storedMaze.endSide] = false;
        needsUpdate = true;
      }
      state.maze = storedMaze;
      state.playerPath = !endpointsChanged && Array.isArray(record.playerPath) && record.playerPath.length
        ? record.playerPath
        : [state.maze.start];
      state.solution = solveMaze(state.maze);
      state.historyId = record.id;
      state.createdAt = record.createdAt;
      state.revealSolution = false;
      els.solutionButton.setAttribute("aria-expanded", "false");
      els.solutionButton.querySelector("span:first-child").textContent = "答えを見る";
      els.solutionDetails.hidden = true;
      renderStage();
      renderHistory();
      if (needsUpdate) {
        await persistCurrent();
        showToast("保存済みの迷路を左上スタート・右下ゴールに更新しました。最初から遊べます。");
      }
    } catch (error) {
      showToast(error.message);
    }
  }

  async function deletePuzzle(id) {
    try {
      await dbDelete(id);
      if (state.historyId === id) {
        state.historyId = null;
        state.maze = null;
        state.solution = [];
        state.playerPath = [];
        state.revealSolution = false;
        renderStage();
      }
      await refreshHistory();
      showToast("履歴から削除しました。");
    } catch (error) {
      showToast("履歴を削除できませんでした。");
    }
  }

  function populatePrintLayout() {
    const title = diggingMethod(state.maze);
    $$(".print-name").forEach(element => { element.textContent = `${title} の迷路`; });
    $$(".print-size").forEach(element => { element.textContent = `${state.maze.size} × ${state.maze.size}`; });
    $$(".print-date").forEach(element => { element.textContent = new Intl.DateTimeFormat("ja-JP", { dateStyle: "long" }).format(new Date()); });
    renderMazeOnCanvas($(".print-canvas-question"), { showSolution: false, showPlayer: false });
    renderMazeOnCanvas($(".print-canvas-answer"), { showSolution: true, showPlayer: false });
    const groups = directionsFor();
    const directions = groups.map(group => `${group.arrow} ${group.label.replace("へ", "")} ${group.count}マス`).join("　·　");
    $(".print-directions").textContent = directions || "スタートとゴールが同じです。";
    $(".print-route-length").textContent = `${Math.max(0, state.solution.length - 1)}歩`;
  }

  function openPrintDialog() {
    if (!state.maze) return;
    if (typeof els.printDialog.showModal === "function") els.printDialog.showModal();
    else showToast("印刷形式を選んでください。");
  }

  function printPuzzle() {
    const mode = $("input[name='printMode']:checked")?.value || "question";
    populatePrintLayout();
    document.body.dataset.printMode = mode;
    els.printDialog.close();
    window.setTimeout(() => window.print(), 120);
  }

  function setupEvents() {
    els.generateDigButton.addEventListener("click", () => { void generateDiggingPuzzle(); });
    els.emptyDigButton.addEventListener("click", () => { void generateDiggingPuzzle(); });
    els.customGridSize.addEventListener("input", () => { state.customGridSize = Number(els.customGridSize.value) || 15; });
    els.newMazeButton.addEventListener("click", () => { void generateDiggingPuzzle(); });
    els.resetButton.addEventListener("click", resetPlayer);
    els.solutionButton.addEventListener("click", toggleSolution);
    els.printButton.addEventListener("click", openPrintDialog);
    els.confirmPrintButton.addEventListener("click", printPuzzle);
    $$('[data-move]').forEach(button => button.addEventListener("click", () => move(button.dataset.move)));
    document.addEventListener("keydown", event => {
      const target = event.target;
      if (!state.maze || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
      const map = { ArrowUp: "up", w: "up", W: "up", ArrowRight: "right", d: "right", D: "right", ArrowDown: "down", s: "down", S: "down", ArrowLeft: "left", a: "left", A: "left" };
      const direction = map[event.key];
      if (!direction) return;
      event.preventDefault();
      move(direction);
    });
    els.printDialog.addEventListener("click", event => {
      if (event.target === els.printDialog) els.printDialog.close();
    });
    window.addEventListener("afterprint", () => { delete document.body.dataset.printMode; });
  }

  async function init() {
    setupEvents();
    try {
      state.db = await openDatabase();
      await refreshHistory();
    } catch (error) {
      console.warn("Local history is unavailable", error);
      showToast("このブラウザでは履歴保存を利用できません。迷路はそのまま遊べます。");
    }
    renderStage();
  }

  init();
})();
