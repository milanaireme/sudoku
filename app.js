const SIZE = 9;
const BOX = 3;
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const MAX_HINTS_PER_GAME = 3;
const LEADERBOARD_KEY = "sudoku-afterglow-leaderboard-v2";
const PLAYER_KEY = "sudoku-afterglow-player-v1";
const DIFFICULTY_CONFIG = {
  stage1: { clues: 46, label: "Stage 1", note: "A gentle warm-up with more anchors." },
  stage2: { clues: 41, label: "Stage 2", note: "Still relaxed, but less obvious." },
  stage3: { clues: 36, label: "Stage 3", note: "Balanced logic and momentum." },
  stage4: { clues: 31, label: "Stage 4", note: "Fewer clues and longer chains." },
  stage5: { clues: 26, label: "Stage 5", note: "The sparer, tougher finish." }
};

const state = {
  difficulty: "stage1",
  playerName: loadPlayerName(),
  puzzle: Array(81).fill(0),
  solution: Array(81).fill(0),
  board: Array(81).fill(0),
  notes: Array.from({ length: 81 }, () => new Set()),
  selectedIndex: 0,
  notesMode: false,
  pinnedDigit: null,
  history: [],
  leaderboard: loadLeaderboard(),
  focusMode: false,
  startedAt: Date.now(),
  elapsedBefore: 0,
  hintFlashIndex: null,
  completed: false,
  scoreSaved: false,
  hintsUsed: 0
};

const boardEl = document.getElementById("board");
const pageShellEl = document.querySelector(".page-shell");
const timerEl = document.getElementById("timer");
const progressEl = document.getElementById("progress");
const conflictsEl = document.getElementById("conflicts");
const playerNameEl = document.getElementById("player-name");
const editPlayerButton = document.getElementById("edit-player");
const statusEl = document.getElementById("status-line");
const stageStateEl = document.getElementById("stage-state");
const notesStateEl = document.getElementById("notes-state");
const pinStateEl = document.getElementById("pin-state");
const hintStateEl = document.getElementById("hint-state");
const leaderboardHeadingEl = document.getElementById("leaderboard-heading");
const leaderboardListEl = document.getElementById("leaderboard-list");
const leaderboardEmptyEl = document.getElementById("leaderboard-empty");
const newGameButton = document.getElementById("new-game");
const notesButton = document.getElementById("toggle-notes");
const undoButton = document.getElementById("undo-move");
const hintButton = document.getElementById("hint");
const checkButton = document.getElementById("check");
const focusBoardButton = document.getElementById("focus-board");
const clearPinButton = document.getElementById("clear-pin");
const difficultyButtons = Array.from(document.querySelectorAll("[data-difficulty]"));
const numberButtons = Array.from(document.querySelectorAll(".number-key"));
const pinButtons = Array.from(document.querySelectorAll("[data-pin-value]"));
const pinClearButton = document.querySelector("[data-pin-clear='true']");
const digitButtons = Array.from(document.querySelectorAll("[data-digit-button]"));
const sessionOverlayEl = document.getElementById("session-overlay");
const playerFormEl = document.getElementById("player-form");
const playerInputEl = document.getElementById("player-input");
const startPlayingButton = document.getElementById("start-playing");

const cellElements = [];
let statusTone = "neutral";

function loadLeaderboard() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEADERBOARD_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadPlayerName() {
  return (window.localStorage.getItem(PLAYER_KEY) ?? "").trim();
}

function savePlayerName(name) {
  window.localStorage.setItem(PLAYER_KEY, name);
}

function saveLeaderboard() {
  window.localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(state.leaderboard));
}

function isEditableTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function shuffle(values) {
  const copy = [...values];

  for (let i = copy.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[randomIndex]] = [copy[randomIndex], copy[i]];
  }

  return copy;
}

function rowOf(index) {
  return Math.floor(index / SIZE);
}

function colOf(index) {
  return index % SIZE;
}

function boxStart(value) {
  return Math.floor(value / BOX) * BOX;
}

function peersFor(index) {
  const row = rowOf(index);
  const col = colOf(index);
  const peers = new Set();

  for (let cursor = 0; cursor < SIZE; cursor += 1) {
    peers.add(row * SIZE + cursor);
    peers.add(cursor * SIZE + col);
  }

  const startRow = boxStart(row);
  const startCol = boxStart(col);

  for (let rowOffset = 0; rowOffset < BOX; rowOffset += 1) {
    for (let colOffset = 0; colOffset < BOX; colOffset += 1) {
      peers.add((startRow + rowOffset) * SIZE + startCol + colOffset);
    }
  }

  peers.delete(index);
  return peers;
}

function getCandidates(board, index) {
  if (board[index] !== 0) {
    return [];
  }

  const used = new Set();
  const row = rowOf(index);
  const col = colOf(index);
  const startRow = boxStart(row);
  const startCol = boxStart(col);

  for (let cursor = 0; cursor < SIZE; cursor += 1) {
    used.add(board[row * SIZE + cursor]);
    used.add(board[cursor * SIZE + col]);
  }

  for (let rowOffset = 0; rowOffset < BOX; rowOffset += 1) {
    for (let colOffset = 0; colOffset < BOX; colOffset += 1) {
      used.add(board[(startRow + rowOffset) * SIZE + startCol + colOffset]);
    }
  }

  return DIGITS.filter((digit) => !used.has(digit));
}

function findBestEmpty(board) {
  let bestIndex = -1;
  let bestCandidates = null;

  for (let index = 0; index < board.length; index += 1) {
    if (board[index] !== 0) {
      continue;
    }

    const candidates = getCandidates(board, index);

    if (candidates.length === 0) {
      return { index, candidates };
    }

    if (!bestCandidates || candidates.length < bestCandidates.length) {
      bestIndex = index;
      bestCandidates = candidates;
    }
  }

  return { index: bestIndex, candidates: bestCandidates };
}

function fillBoard(board) {
  const { index, candidates } = findBestEmpty(board);

  if (index === -1) {
    return true;
  }

  for (const candidate of shuffle(candidates)) {
    board[index] = candidate;

    if (fillBoard(board)) {
      return true;
    }

    board[index] = 0;
  }

  return false;
}

function countSolutions(board, limit = 2) {
  const copy = [...board];
  let solutions = 0;

  function search() {
    if (solutions >= limit) {
      return;
    }

    const { index, candidates } = findBestEmpty(copy);

    if (index === -1) {
      solutions += 1;
      return;
    }

    if (!candidates || candidates.length === 0) {
      return;
    }

    for (const candidate of candidates) {
      copy[index] = candidate;
      search();
      copy[index] = 0;

      if (solutions >= limit) {
        return;
      }
    }
  }

  search();
  return solutions;
}

function generatePuzzle(difficulty) {
  const targetClues = DIFFICULTY_CONFIG[difficulty].clues;
  let bestPuzzle = null;
  let bestSolution = null;
  let bestClueCount = Infinity;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const solved = Array(81).fill(0);
    fillBoard(solved);

    const puzzle = [...solved];
    const order = shuffle(Array.from({ length: 81 }, (_, index) => index));

    for (const index of order) {
      if (puzzle.filter(Boolean).length <= targetClues) {
        break;
      }

      const backup = puzzle[index];
      puzzle[index] = 0;

      if (countSolutions(puzzle, 2) !== 1) {
        puzzle[index] = backup;
      }
    }

    const clueCount = puzzle.filter(Boolean).length;

    if (clueCount < bestClueCount) {
      bestPuzzle = puzzle;
      bestSolution = solved;
      bestClueCount = clueCount;
    }

    if (clueCount === targetClues) {
      return { puzzle, solution: solved };
    }
  }

  return { puzzle: bestPuzzle, solution: bestSolution };
}

function createSnapshot() {
  return {
    board: [...state.board],
    notes: state.notes.map((entry) => [...entry]),
    selectedIndex: state.selectedIndex,
    notesMode: state.notesMode,
    pinnedDigit: state.pinnedDigit,
    hintFlashIndex: state.hintFlashIndex,
    completed: state.completed,
    scoreSaved: state.scoreSaved,
    hintsUsed: state.hintsUsed,
    elapsedBefore: state.elapsedBefore + (Date.now() - state.startedAt)
  };
}

function restoreSnapshot(snapshot) {
  state.board = [...snapshot.board];
  state.notes = snapshot.notes.map((entry) => new Set(entry));
  state.selectedIndex = snapshot.selectedIndex;
  state.notesMode = snapshot.notesMode;
  state.pinnedDigit = snapshot.pinnedDigit;
  state.hintFlashIndex = snapshot.hintFlashIndex;
  state.completed = snapshot.completed;
  state.scoreSaved = snapshot.scoreSaved;
  state.hintsUsed = snapshot.hintsUsed;
  state.elapsedBefore = snapshot.elapsedBefore;
  state.startedAt = Date.now();
}

function pushHistory() {
  state.history.push(createSnapshot());

  if (state.history.length > 250) {
    state.history.shift();
  }
}

function isFixed(index) {
  return state.puzzle[index] !== 0;
}

function setStatus(message, tone = "neutral") {
  statusTone = tone;
  statusEl.textContent = message;
  statusEl.classList.toggle("is-success", tone === "success");
  statusEl.classList.toggle("is-alert", tone === "alert");
}

function selectCell(index, { shouldFocus = false } = {}) {
  state.selectedIndex = Math.max(0, Math.min(80, index));
  renderBoard();

  if (shouldFocus) {
    cellElements[state.selectedIndex].focus();
  }
}

function moveSelection(deltaRow, deltaCol) {
  const currentRow = rowOf(state.selectedIndex);
  const currentCol = colOf(state.selectedIndex);
  const nextRow = (currentRow + deltaRow + SIZE) % SIZE;
  const nextCol = (currentCol + deltaCol + SIZE) % SIZE;
  selectCell(nextRow * SIZE + nextCol, { shouldFocus: true });
}

function computeConflicts(board) {
  const conflicts = new Set();

  for (let index = 0; index < board.length; index += 1) {
    const value = board[index];

    if (value === 0) {
      continue;
    }

    for (const peerIndex of peersFor(index)) {
      if (board[peerIndex] === value) {
        conflicts.add(index);
        conflicts.add(peerIndex);
      }
    }
  }

  return conflicts;
}

function removePeerNotes(index, value) {
  for (const peerIndex of peersFor(index)) {
    state.notes[peerIndex].delete(value);
  }
}

function currentElapsed() {
  if (state.completed) {
    return state.elapsedBefore;
  }

  return state.elapsedBefore + (Date.now() - state.startedAt);
}

function addLeaderboardEntry() {
  if (state.scoreSaved) {
    return;
  }

  const duration = currentElapsed();
  const entry = {
    playerName: state.playerName || "Guest",
    difficulty: state.difficulty,
    duration,
    hintsUsed: state.hintsUsed,
    recordedAt: new Date().toISOString()
  };

  state.leaderboard = [...state.leaderboard, entry]
    .sort((left, right) => {
      if (left.difficulty !== right.difficulty) {
        return left.difficulty.localeCompare(right.difficulty);
      }

      if (left.duration !== right.duration) {
        return left.duration - right.duration;
      }

      return left.hintsUsed - right.hintsUsed;
    })
    .reduce((entries, candidate) => {
      const existing = entries.filter((entryItem) => entryItem.difficulty === candidate.difficulty);

      if (existing.length >= 5) {
        return entries;
      }

      entries.push(candidate);
      return entries;
    }, []);

  state.scoreSaved = true;
  saveLeaderboard();
  renderLeaderboard();
}

function checkForCompletion() {
  const filled = state.board.every((value) => value !== 0);

  if (!filled) {
    return false;
  }

  const solved = state.board.every((value, index) => value === state.solution[index]);

  if (solved) {
    state.elapsedBefore += Date.now() - state.startedAt;
    state.startedAt = Date.now();
    state.completed = true;
    addLeaderboardEntry();
    const difficultyKeys = Object.keys(DIFFICULTY_CONFIG);
    const currentIndex = difficultyKeys.indexOf(state.difficulty);
    const nextDifficulty = difficultyKeys[currentIndex + 1];
    const player = state.playerName || "Player";
    const nextMessage = nextDifficulty
      ? ` Try ${DIFFICULTY_CONFIG[nextDifficulty].label} next.`
      : " You finished the toughest stage. Try to beat your best time.";
    setStatus(
      `Congratulations, ${player}! ${DIFFICULTY_CONFIG[state.difficulty].label} complete in ${formatDuration(state.elapsedBefore)}.${nextMessage}`,
      "success"
    );
    renderMeta();
    return true;
  }

  return false;
}

function placeDigit(digit) {
  const index = state.selectedIndex;

  if (state.completed) {
    setStatus("This board is already solved. Press G for a new puzzle.");
    return;
  }

  if (isFixed(index)) {
    setStatus("That clue is fixed. Move to an empty or editable cell.");
    return;
  }

  pushHistory();
  state.hintFlashIndex = null;

  if (state.notesMode && state.board[index] === 0) {
    if (state.notes[index].has(digit)) {
      state.notes[index].delete(digit);
      setStatus(`Removed note ${digit}.`);
    } else {
      state.notes[index].add(digit);
      setStatus(`Added note ${digit}.`);
    }

    renderAll();
    return;
  }

  state.board[index] = digit;
  state.notes[index].clear();
  removePeerNotes(index, digit);
  renderAll();

  if (!checkForCompletion()) {
    const conflicts = computeConflicts(state.board);

    if (conflicts.has(index)) {
      setStatus(`Placed ${digit}, but it conflicts with another ${digit}.`, "alert");
    } else {
      setStatus(`Placed ${digit}.`);
    }
  }
}

function placePinnedDigit() {
  if (state.pinnedDigit === null) {
    setStatus("Freeze a digit first, then use Enter or Space to place it.");
    return;
  }

  placeDigit(state.pinnedDigit);
}

function clearSelectedCell() {
  const index = state.selectedIndex;

  if (state.completed) {
    setStatus("This board is already solved. Press G for a new puzzle.");
    return;
  }

  if (isFixed(index)) {
    setStatus("That clue is fixed and cannot be cleared.");
    return;
  }

  if (state.board[index] === 0 && state.notes[index].size === 0) {
    setStatus("That cell is already empty.");
    return;
  }

  pushHistory();
  state.board[index] = 0;
  state.notes[index].clear();
  state.hintFlashIndex = null;
  renderAll();
  setStatus("Cleared the cell.");
}

function toggleNotes() {
  state.notesMode = !state.notesMode;
  renderModes();
  setStatus(state.notesMode ? "Notes mode on." : "Notes mode off.");
}

function setPinnedDigit(digit) {
  state.pinnedDigit = state.pinnedDigit === digit ? null : digit;
  renderModes();

  if (state.pinnedDigit === null) {
    setStatus("Frozen digit cleared.");
  } else {
    setStatus(`Frozen digit ${state.pinnedDigit}. Move around and press Enter to fill it.`);
  }
}

function clearPinnedDigit() {
  if (state.pinnedDigit === null) {
    setStatus("No frozen digit to clear.");
    return;
  }

  state.pinnedDigit = null;
  renderModes();
  setStatus("Frozen digit cleared.");
}

function undoMove() {
  const snapshot = state.history.pop();

  if (!snapshot) {
    setStatus("Nothing to undo yet.");
    return;
  }

  restoreSnapshot(snapshot);
  renderAll();
  selectCell(state.selectedIndex, { shouldFocus: true });
  setStatus("Undid the last move.");
}

function applyHint() {
  if (state.completed) {
    setStatus("This board is already solved. Press G for a new puzzle.");
    return;
  }

  if (state.hintsUsed >= MAX_HINTS_PER_GAME) {
    setStatus(`You have already used all ${MAX_HINTS_PER_GAME} hints for this game.`);
    return;
  }

  let index = state.selectedIndex;

  if (isFixed(index) || state.board[index] !== 0) {
    index = state.board.findIndex((value, candidateIndex) => value === 0 && !isFixed(candidateIndex));
  }

  if (index === -1) {
    setStatus("No empty cells left to hint.");
    return;
  }

  pushHistory();
  state.board[index] = state.solution[index];
  state.notes[index].clear();
  state.hintsUsed += 1;
  removePeerNotes(index, state.solution[index]);
  state.hintFlashIndex = index;
  selectCell(index, { shouldFocus: true });
  renderAll();

  if (!checkForCompletion()) {
    const remainingHints = MAX_HINTS_PER_GAME - state.hintsUsed;
    setStatus(
      `Hint added at row ${rowOf(index) + 1}, column ${colOf(index) + 1}. ${state.hintsUsed}/${MAX_HINTS_PER_GAME} used, ${remainingHints} left.`,
      "success"
    );
  }
}

function checkBoard() {
  const conflicts = computeConflicts(state.board);

  if (checkForCompletion()) {
    renderAll();
    return;
  }

  if (conflicts.size > 0) {
    const firstConflict = [...conflicts][0];
    setStatus(`There are ${conflicts.size} conflicting cells to untangle.`, "alert");
    selectCell(firstConflict, { shouldFocus: true });
    return;
  }

  const empties = state.board.filter((value) => value === 0).length;

  if (empties > 0) {
    setStatus(`So far, so good. ${empties} cells left.`);
  } else {
    setStatus("Everything is filled, but at least one value is still off. Try a hint or undo.");
  }
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function formatRecordedDate(isoString) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(new Date(isoString));
}

function renderPlayer() {
  playerNameEl.textContent = state.playerName || "Guest";
}

function describeCell(index) {
  const row = rowOf(index) + 1;
  const col = colOf(index) + 1;
  const value = state.board[index];
  const notes = [...state.notes[index]].sort((left, right) => left - right);

  if (value !== 0) {
    return `Row ${row}, column ${col}, ${isFixed(index) ? "clue" : "value"} ${value}`;
  }

  if (notes.length > 0) {
    return `Row ${row}, column ${col}, empty, notes ${notes.join(", ")}`;
  }

  return `Row ${row}, column ${col}, empty`;
}

function buildCellContent(index) {
  const value = state.board[index];

  if (value !== 0) {
    return `<span class="cell-value">${value}</span>`;
  }

  const notes = [...state.notes[index]].sort((left, right) => left - right);

  if (notes.length === 0) {
    return "";
  }

  const noteMarkup = Array.from({ length: 9 }, (_, noteIndex) => {
    const digit = noteIndex + 1;
    return `<span>${notes.includes(digit) ? digit : ""}</span>`;
  }).join("");

  return `<span class="notes-grid" aria-hidden="true">${noteMarkup}</span>`;
}

function renderBoard() {
  const selectedValue = state.board[state.selectedIndex];
  const selectedRow = rowOf(state.selectedIndex);
  const selectedCol = colOf(state.selectedIndex);
  const selectedBoxRow = boxStart(selectedRow);
  const selectedBoxCol = boxStart(selectedCol);
  const conflicts = computeConflicts(state.board);

  for (let index = 0; index < cellElements.length; index += 1) {
    const cell = cellElements[index];
    const row = rowOf(index);
    const col = colOf(index);
    const isSelected = index === state.selectedIndex;
    const sharesRow = row === selectedRow;
    const sharesCol = col === selectedCol;
    const sharesBox =
      row >= selectedBoxRow &&
      row < selectedBoxRow + BOX &&
      col >= selectedBoxCol &&
      col < selectedBoxCol + BOX;
    const sharesValue = selectedValue !== 0 && state.board[index] === selectedValue;
    const pinnedMatch = state.pinnedDigit !== null && state.board[index] === state.pinnedDigit;

    cell.className = "cell";
    cell.classList.toggle("box-edge-right", cell.dataset.boxEdgeRight === "true");
    cell.classList.toggle("box-edge-bottom", cell.dataset.boxEdgeBottom === "true");
    cell.classList.toggle("cell-selected", isSelected);
    cell.classList.toggle("cell-related", !isSelected && (sharesRow || sharesCol || sharesBox));
    cell.classList.toggle("cell-same", !isSelected && sharesValue);
    cell.classList.toggle("cell-pinned", pinnedMatch);
    cell.classList.toggle("cell-conflict", conflicts.has(index));
    cell.classList.toggle("cell-fixed", isFixed(index));
    cell.classList.toggle("cell-entered", !isFixed(index) && state.board[index] !== 0);
    cell.classList.toggle("cell-hinted", state.hintFlashIndex === index);
    cell.tabIndex = isSelected ? 0 : -1;
    cell.setAttribute("aria-label", describeCell(index));
    cell.setAttribute("aria-selected", String(isSelected));
    cell.innerHTML = buildCellContent(index);
  }
}

function renderMeta() {
  const filled = state.board.filter((value) => value !== 0).length;
  const conflicts = computeConflicts(state.board).size;

  progressEl.textContent = `${filled} / 81`;
  conflictsEl.textContent = String(conflicts);
  timerEl.textContent = formatDuration(currentElapsed());
  statusEl.classList.toggle("is-success", statusTone === "success");
  statusEl.classList.toggle("is-alert", statusTone === "alert");
}

function renderCompletedDigits() {
  const counts = DIGITS.reduce((map, digit) => {
    map.set(digit, state.board.filter((value) => value === digit).length);
    return map;
  }, new Map());

  digitButtons.forEach((button) => {
    const digit = Number(button.dataset.digitButton);
    button.classList.toggle("is-complete", counts.get(digit) === 9);
  });
}

function renderModes() {
  const remainingHints = Math.max(0, MAX_HINTS_PER_GAME - state.hintsUsed);

  stageStateEl.textContent = DIFFICULTY_CONFIG[state.difficulty].label;
  notesStateEl.textContent = state.notesMode ? "Notes on" : "Notes off";
  pinStateEl.textContent = state.pinnedDigit === null ? "Pin off" : `Pin ${state.pinnedDigit}`;
  hintStateEl.textContent = `Hints ${state.hintsUsed}/${MAX_HINTS_PER_GAME} used, ${remainingHints} left`;

  notesStateEl.classList.toggle("is-on", state.notesMode);
  pinStateEl.classList.toggle("is-pinned", state.pinnedDigit !== null);
  notesButton.setAttribute("aria-pressed", String(state.notesMode));
  hintButton.disabled = state.completed || state.hintsUsed >= MAX_HINTS_PER_GAME;
  hintButton.textContent = state.hintsUsed >= MAX_HINTS_PER_GAME ? "No hints left" : `Hint (${remainingHints})`;
  focusBoardButton.setAttribute("aria-pressed", String(state.focusMode));
  focusBoardButton.textContent = state.focusMode ? "Exit focus" : "Focus mode";
  pageShellEl.classList.toggle("focus-mode", state.focusMode);

  pinButtons.forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.pinValue) === state.pinnedDigit);
  });
}

function renderLeaderboard() {
  const stageEntries = state.leaderboard.filter((entry) => entry.difficulty === state.difficulty);
  leaderboardHeadingEl.textContent = `Best times for ${DIFFICULTY_CONFIG[state.difficulty].label}`;
  leaderboardListEl.innerHTML = "";
  leaderboardEmptyEl.hidden = stageEntries.length > 0;

  stageEntries.forEach((entry, index) => {
    const item = document.createElement("li");
    item.className = "leaderboard-item";
    item.innerHTML = `
      <span class="leaderboard-rank">${index + 1}</span>
      <div class="leaderboard-meta">
        <span class="leaderboard-name">${entry.playerName || "Guest"}</span>
        <div class="leaderboard-time">${formatDuration(entry.duration)}</div>
        <div class="leaderboard-detail">${entry.hintsUsed} hint${entry.hintsUsed === 1 ? "" : "s"}</div>
      </div>
      <span class="leaderboard-date">${formatRecordedDate(entry.recordedAt)}</span>
    `;
    leaderboardListEl.appendChild(item);
  });
}

function renderAll() {
  renderBoard();
  renderMeta();
  renderPlayer();
  renderCompletedDigits();
  renderModes();
  renderLeaderboard();
}

function focusBoard() {
  cellElements[state.selectedIndex].focus();
}

function toggleFocusMode() {
  state.focusMode = !state.focusMode;
  renderModes();
  focusBoard();
  setStatus(state.focusMode ? "Focus mode on." : "Focus mode off.");
}

function startNewGame(difficulty = state.difficulty) {
  if (!state.playerName) {
    showPlayerPrompt();
    return;
  }

  state.difficulty = difficulty;
  state.history = [];
  state.notesMode = false;
  state.pinnedDigit = null;
  state.focusMode = false;
  state.hintFlashIndex = null;
  state.completed = false;
  state.scoreSaved = false;
  state.hintsUsed = 0;

  difficultyButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.difficulty === difficulty);
  });

  renderModes();
  renderPlayer();
  renderLeaderboard();
  setStatus(`Building ${DIFFICULTY_CONFIG[difficulty].label.toLowerCase()}...`);
  renderMeta();

  window.requestAnimationFrame(() => {
    const { puzzle, solution } = generatePuzzle(difficulty);
    state.puzzle = puzzle;
    state.solution = solution;
    state.board = [...puzzle];
    state.notes = Array.from({ length: 81 }, () => new Set());
    state.selectedIndex = state.board.findIndex((value) => value === 0);
    state.selectedIndex = state.selectedIndex === -1 ? 0 : state.selectedIndex;
    state.startedAt = Date.now();
    state.elapsedBefore = 0;
    renderAll();
    setStatus(DIFFICULTY_CONFIG[difficulty].note);
    focusBoard();
  });
}

function showPlayerPrompt() {
  sessionOverlayEl.hidden = false;
  playerInputEl.value = state.playerName;
  window.requestAnimationFrame(() => {
    playerInputEl.focus();
    playerInputEl.select();
  });
}

function hidePlayerPrompt() {
  sessionOverlayEl.hidden = true;
}

function commitPlayerName() {
  const nextName = playerInputEl.value.trim();

  if (!nextName) {
    playerInputEl.focus();
    return false;
  }

  state.playerName = nextName;
  savePlayerName(nextName);
  renderPlayer();
  hidePlayerPrompt();

  if (state.puzzle.every((value) => value === 0)) {
    startNewGame(state.difficulty);
  } else {
    setStatus(`Player set to ${nextName}.`);
  }

  return true;
}

function submitPlayerName(event) {
  event.preventDefault();
  commitPlayerName();
}

function initializeBoard() {
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < 81; index += 1) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    cell.setAttribute("role", "gridcell");
    cell.dataset.index = String(index);

    if ((colOf(index) + 1) % 3 === 0 && colOf(index) !== 8) {
      cell.dataset.boxEdgeRight = "true";
      cell.classList.add("box-edge-right");
    }

    if ((rowOf(index) + 1) % 3 === 0 && rowOf(index) !== 8) {
      cell.dataset.boxEdgeBottom = "true";
      cell.classList.add("box-edge-bottom");
    }

    cell.addEventListener("click", () => {
      selectCell(index, { shouldFocus: true });
    });

    cell.addEventListener("focus", () => {
      if (state.selectedIndex !== index) {
        selectCell(index);
      }
    });

    cellElements.push(cell);
    fragment.appendChild(cell);
  }

  boardEl.appendChild(fragment);
}

function handleGlobalKeydown(event) {
  if (isEditableTarget(event.target)) {
    return;
  }

  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  if (event.shiftKey && /^Digit[1-9]$/.test(event.code)) {
    event.preventDefault();
    setPinnedDigit(Number(event.code.replace("Digit", "")));
    return;
  }

  const key = event.key.toLowerCase();

  if (["arrowup", "w"].includes(key)) {
    event.preventDefault();
    moveSelection(-1, 0);
    return;
  }

  if (["arrowdown", "s"].includes(key)) {
    event.preventDefault();
    moveSelection(1, 0);
    return;
  }

  if (["arrowleft", "a"].includes(key)) {
    event.preventDefault();
    moveSelection(0, -1);
    return;
  }

  if (["arrowright", "d"].includes(key)) {
    event.preventDefault();
    moveSelection(0, 1);
    return;
  }

  if (/^[1-9]$/.test(key)) {
    event.preventDefault();
    placeDigit(Number(key));
    return;
  }

  if (["0", "backspace", "delete"].includes(key)) {
    event.preventDefault();
    clearSelectedCell();
    return;
  }

  if (["enter", " "].includes(key)) {
    event.preventDefault();
    placePinnedDigit();
    return;
  }

  if (key === "n") {
    event.preventDefault();
    toggleNotes();
    return;
  }

  if (key === "u") {
    event.preventDefault();
    undoMove();
    return;
  }

  if (key === "g") {
    event.preventDefault();
    startNewGame(state.difficulty);
    return;
  }

  if (key === "b") {
    event.preventDefault();
    focusBoard();
    return;
  }

  if (key === "c") {
    event.preventDefault();
    checkBoard();
    return;
  }

  if (key === "h") {
    event.preventDefault();
    applyHint();
    return;
  }

  if (key === "f") {
    event.preventDefault();
    toggleFocusMode();
    return;
  }

  if (key === "p") {
    event.preventDefault();
    clearPinnedDigit();
  }
}

function bindEvents() {
  newGameButton.addEventListener("click", () => startNewGame(state.difficulty));
  editPlayerButton.addEventListener("click", showPlayerPrompt);
  notesButton.addEventListener("click", toggleNotes);
  undoButton.addEventListener("click", undoMove);
  hintButton.addEventListener("click", applyHint);
  checkButton.addEventListener("click", checkBoard);
  focusBoardButton.addEventListener("click", toggleFocusMode);
  clearPinButton.addEventListener("click", clearPinnedDigit);
  pinClearButton.addEventListener("click", clearPinnedDigit);

  difficultyButtons.forEach((button) => {
    button.addEventListener("click", () => {
      startNewGame(button.dataset.difficulty);
    });
  });

  numberButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.clear === "true") {
        clearSelectedCell();
        return;
      }

      placeDigit(Number(button.dataset.value));
    });
  });

  pinButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setPinnedDigit(Number(button.dataset.pinValue));
    });
  });

  playerFormEl.addEventListener("submit", submitPlayerName);
  startPlayingButton.addEventListener("click", commitPlayerName);
  document.addEventListener("keydown", handleGlobalKeydown);
  window.setInterval(renderMeta, 1000);
}

initializeBoard();
bindEvents();
renderAll();

if (state.playerName) {
  startNewGame("stage1");
} else {
  showPlayerPrompt();
}
