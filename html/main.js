const elements = {
  statusPill: document.querySelector("#status-pill"),
  statusText: document.querySelector("#status-text"),
  seedInput: document.querySelector("#seed-input"),
  viewSelect: document.querySelector("#view-select"),
  speedSelect: document.querySelector("#speed-select"),
  newMatchButton: document.querySelector("#new-match-button"),
  nextMoveButton: document.querySelector("#next-move-button"),
  autoPlayButton: document.querySelector("#auto-play-button"),
  phaseValue: document.querySelector("#phase-value"),
  handValue: document.querySelector("#hand-value"),
  trumpValue: document.querySelector("#trump-value"),
  upcardValue: document.querySelector("#upcard-value"),
  dealerValue: document.querySelector("#dealer-value"),
  currentPlayerValue: document.querySelector("#current-player-value"),
  scoreTeam0: document.querySelector("#score-team-0"),
  scoreTeam1: document.querySelector("#score-team-1"),
  tricksTeam0: document.querySelector("#tricks-team-0"),
  tricksTeam1: document.querySelector("#tricks-team-1"),
  legalMoves: document.querySelector("#legal-moves"),
  viewerLabel: document.querySelector("#viewer-label"),
  upcardCard: document.querySelector("#upcard-card"),
  lastMessage: document.querySelector("#last-message"),
  trickGrid: document.querySelector("#trick-grid"),
  logList: document.querySelector("#log-list"),
  seats: [0, 1, 2, 3].map((seat) => document.querySelector(`#seat-${seat}`)),
};

const seatNames = ["North", "East", "South", "West"];
const suitSymbols = { C: "♣", D: "♦", H: "♥", S: "♠" };
const suitNames = { C: "Clubs", D: "Diamonds", H: "Hearts", S: "Spades" };

const runtimeState = {
  pyodide: null,
  bridgeModule: null,
  autoRunning: false,
  currentSnapshot: null,
};

function formatError(error) {
  if (error instanceof Error) {
    const extra = "errno" in error ? ` | errno: ${error.errno}` : "";
    return `${error.name}: ${error.message}${extra}`;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const parts = [];
    for (const key of ["name", "message", "type", "status", "url", "reason", "errno", "code"]) {
      if (key in error && error[key] != null) {
        const value = error[key];
        parts.push(`${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
      }
    }

    if (parts.length) {
      return parts.join(" | ");
    }

    try {
      return JSON.stringify(error, null, 2);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }

  return String(error);
}

function setStatus(message, tone = "loading") {
  elements.statusText.textContent = message;
  elements.statusPill.className = `status-pill status-${tone}`;
  elements.statusPill.textContent =
    tone === "ready" ? "Ready" : tone === "error" ? "Runtime Error" : "Loading Pyodide";
}

function parseViewSelection() {
  const value = elements.viewSelect.value;
  if (value === "god") {
    return { view_mode: "god", viewer_seat: 0 };
  }

  const [, seatValue] = value.split(":");
  return { view_mode: "seat", viewer_seat: Number.parseInt(seatValue, 10) || 0 };
}

function cardFace(card) {
  if (!card || card === "-") {
    return { rank: "·", suit: "", label: "None", color: "" };
  }

  if (card === "??") {
    return { rank: "?", suit: "✶", label: "Hidden", color: "" };
  }

  const rank = card[0];
  const suit = card[1];
  const symbol = suitSymbols[suit] ?? suit;
  return {
    rank,
    suit: symbol,
    label: `${rank}${symbol}`,
    color: suit === "D" || suit === "H" ? "red" : "",
  };
}

function cardMarkup(card, options = {}) {
  const { small = false } = options;
  const { rank, suit, label, color } = cardFace(card);
  const hiddenClass = card === "??" ? "hidden" : "";
  return `
    <div class="playing-card ${small ? "small" : ""} ${hiddenClass} ${color}">
      <span class="card-rank">${rank}</span>
      <span class="card-suit">${suit}</span>
      <span class="card-text">${label}</span>
    </div>
  `;
}

function describeMove(move) {
  if (move.type === "pass") {
    return "pass";
  }

  if (move.type === "order_up") {
    return "order up";
  }

  if (move.type === "call_trump") {
    return `call ${suitNames[move.suit] ?? move.suit}`;
  }

  if (move.type === "discard") {
    return `discard ${move.card}`;
  }

  if (move.type === "play_card") {
    return `play ${move.card}`;
  }

  return move.type;
}

function renderSeat(player) {
  const badges = [
    `<span class="badge team-${player.team}">${player.team_label}</span>`,
    player.is_dealer ? `<span class="badge">Dealer</span>` : "",
    player.is_current ? `<span class="badge">Turn</span>` : "",
    player.is_maker ? `<span class="badge">Maker</span>` : "",
  ]
    .filter(Boolean)
    .join("");

  const cards = player.cards.length
    ? player.cards.map((card) => cardMarkup(card, { small: true })).join("")
    : `<p class="seat-subline">No cards left.</p>`;

  const seatElement = elements.seats[player.seat];
  seatElement.classList.toggle("is-current", Boolean(player.is_current));
  seatElement.innerHTML = `
    <div class="seat-header">
      <div>
        <h3 class="seat-name">${player.name}</h3>
        <p class="seat-subline">Player ${player.seat} · Partner ${player.partner}</p>
      </div>
      <div class="seat-badges">${badges}</div>
    </div>
    <div class="card-row">${cards}</div>
  `;
}

function renderTrick(snapshot) {
  const trickPlays = snapshot.current_trick;
  if (!trickPlays.length) {
    elements.trickGrid.innerHTML = `
      <div class="trick-play">
        <div class="trick-meta">
          <strong>Waiting for the lead</strong>
          <span>No cards are in the trick yet.</span>
        </div>
      </div>
    `;
    return;
  }

  elements.trickGrid.innerHTML = trickPlays
    .map(
      (play) => `
        <div class="trick-play">
          ${cardMarkup(play.card)}
          <div class="trick-meta">
            <strong>${play.player_name}</strong>
            <span>Player ${play.player}</span>
          </div>
        </div>
      `,
    )
    .join("");
}

function renderLegalMoves(moves) {
  if (!moves.length) {
    elements.legalMoves.innerHTML = `<span class="legal-pill">No actions available</span>`;
    return;
  }

  elements.legalMoves.innerHTML = moves
    .map((move) => `<span class="legal-pill">${describeMove(move)}</span>`)
    .join("");
}

function renderLogs(logs) {
  elements.logList.innerHTML = logs.map((line) => `<li>${line}</li>`).join("");
  elements.logList.scrollTop = elements.logList.scrollHeight;
}

function renderSnapshot(snapshot) {
  runtimeState.currentSnapshot = snapshot;
  const summary = snapshot.summary;
  const upcard = summary.upcard ?? "-";

  elements.phaseValue.textContent = summary.phase_label;
  elements.handValue.textContent = String(summary.hand_number);
  elements.trumpValue.textContent = summary.trump
    ? `${summary.trump}${suitSymbols[summary.trump] ?? ""}`
    : "Unset";
  elements.upcardValue.textContent = upcard === "-" ? "-" : upcard;
  elements.dealerValue.textContent =
    summary.dealer == null ? "-" : `${seatNames[summary.dealer]} (P${summary.dealer})`;
  elements.currentPlayerValue.textContent =
    summary.current_player == null
      ? "None"
      : `${seatNames[summary.current_player]} (P${summary.current_player})`;
  elements.scoreTeam0.textContent = String(summary.scores["0"] ?? summary.scores[0] ?? 0);
  elements.scoreTeam1.textContent = String(summary.scores["1"] ?? summary.scores[1] ?? 0);
  elements.tricksTeam0.textContent = `${
    summary.tricks_won["0"] ?? summary.tricks_won[0] ?? 0
  } tricks`;
  elements.tricksTeam1.textContent = `${
    summary.tricks_won["1"] ?? summary.tricks_won[1] ?? 0
  } tricks`;
  elements.viewerLabel.textContent = snapshot.view.label;
  elements.upcardCard.innerHTML = cardMarkup(upcard);
  elements.lastMessage.textContent = snapshot.last_message;

  snapshot.players.forEach(renderSeat);
  renderTrick(snapshot);
  renderLegalMoves(snapshot.legal_moves);
  renderLogs(snapshot.logs);

  elements.autoPlayButton.textContent = runtimeState.autoRunning ? "Pause" : "Auto Play";
}

function setControlsEnabled(enabled) {
  elements.newMatchButton.disabled = !enabled;
  elements.nextMoveButton.disabled = !enabled;
  elements.autoPlayButton.disabled = !enabled;
}

async function callBridge(command, payload = {}) {
  if (!runtimeState.bridgeModule) {
    throw new Error("Bridge module is not loaded.");
  }

  const responseText = runtimeState.bridgeModule.call_from_js(command, JSON.stringify(payload));
  const response = JSON.parse(responseText);
  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.data;
}

function ensureDirectory(fs, path) {
  const parts = path.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += `/${part}`;
    const analyzed = fs.analyzePath(current);
    if (analyzed.exists) {
      if (!analyzed.object || !fs.isDir(analyzed.object.mode)) {
        throw new Error(`Expected directory at ${current}, found non-directory entry.`);
      }
      continue;
    }
    fs.mkdir(current);
  }
}

async function loadTextFile(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.text();
}

async function stagePythonSources(pyodide) {
  const files = [
    {
      source: new URL("../euchre_game/__init__.py", import.meta.url),
      target: "/app/euchre_game/__init__.py",
    },
    {
      source: new URL("../euchre_game/constants.py", import.meta.url),
      target: "/app/euchre_game/constants.py",
    },
    {
      source: new URL("../euchre_game/game.py", import.meta.url),
      target: "/app/euchre_game/game.py",
    },
    {
      source: new URL("./python/game_bridge.py", import.meta.url),
      target: "/app/game_bridge.py",
    },
  ];

  for (const file of files) {
    try {
      const content = await loadTextFile(file.source);
      ensureDirectory(pyodide.FS, file.target.substring(0, file.target.lastIndexOf("/")));
      pyodide.FS.writeFile(file.target, content, { encoding: "utf8" });
    } catch (error) {
      const detail = formatError(error);
      throw new Error(`Failed while staging ${file.target} from ${file.source}: ${detail}`);
    }
  }

  try {
    await pyodide.runPythonAsync(`
import importlib
import sys

if "/app" not in sys.path:
    sys.path.insert(0, "/app")

importlib.invalidate_caches()
import game_bridge
importlib.reload(game_bridge)
`);
  } catch (error) {
    throw new Error(`Failed while importing browser bridge: ${formatError(error)}`);
  }
}

async function initializeRuntime() {
  setStatus("Loading the local Pyodide runtime.", "loading");
  const pyodide = await loadPyodide({
    indexURL: `${new URL("./vendor/pyodide/", import.meta.url).href}`,
  });

  setStatus("Staging local Python modules into the browser runtime.", "loading");
  await stagePythonSources(pyodide);

  runtimeState.pyodide = pyodide;
  runtimeState.bridgeModule = pyodide.pyimport("game_bridge");

  setControlsEnabled(true);
  setStatus("Pyodide is ready. Starting a new match.", "ready");
}

async function newMatch() {
  const seedText = elements.seedInput.value.trim();
  const numericSeed = seedText === "" ? Math.floor(Date.now() % 10_000_000) : Number(seedText);
  elements.seedInput.value = Number.isFinite(numericSeed) ? String(numericSeed) : "";
  const snapshot = await callBridge("new_match", {
    seed: Number.isFinite(numericSeed) ? numericSeed : null,
    winning_score: 10,
  });
  const refreshed = await callBridge("set_view", parseViewSelection());
  renderSnapshot(refreshed ?? snapshot);
}

async function stepRandom() {
  const snapshot = await callBridge("step_random", parseViewSelection());
  renderSnapshot(snapshot);
  if (snapshot.summary.match_complete) {
    runtimeState.autoRunning = false;
  }
}

async function refreshView() {
  const snapshot = await callBridge("set_view", parseViewSelection());
  renderSnapshot(snapshot);
}

async function autoplayLoop() {
  while (runtimeState.autoRunning) {
    await stepRandom();
    if (!runtimeState.autoRunning) {
      break;
    }
    const delay = Number.parseInt(elements.speedSelect.value, 10) || 700;
    await new Promise((resolve) => window.setTimeout(resolve, delay));
  }
  renderSnapshot(runtimeState.currentSnapshot ?? (await callBridge("get_snapshot", parseViewSelection())));
}

function bindEvents() {
  elements.newMatchButton.addEventListener("click", async () => {
    runtimeState.autoRunning = false;
    try {
      await newMatch();
    } catch (error) {
      setStatus(String(error), "error");
    }
  });

  elements.nextMoveButton.addEventListener("click", async () => {
    runtimeState.autoRunning = false;
    try {
      await stepRandom();
    } catch (error) {
      setStatus(String(error), "error");
    }
  });

  elements.autoPlayButton.addEventListener("click", async () => {
    runtimeState.autoRunning = !runtimeState.autoRunning;
    try {
      if (runtimeState.autoRunning) {
        await autoplayLoop();
      } else if (runtimeState.currentSnapshot) {
        renderSnapshot(runtimeState.currentSnapshot);
      }
    } catch (error) {
      runtimeState.autoRunning = false;
      setStatus(String(error), "error");
    }
  });

  elements.viewSelect.addEventListener("change", async () => {
    try {
      await refreshView();
    } catch (error) {
      setStatus(String(error), "error");
    }
  });
}

async function main() {
  window.addEventListener("error", (event) => {
    const message = formatError(event.error ?? event.message ?? event);
    setStatus(message, "error");
    elements.lastMessage.textContent = message;
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message = formatError(event.reason ?? event);
    setStatus(message, "error");
    elements.lastMessage.textContent = message;
  });

  bindEvents();
  try {
    await initializeRuntime();
    await newMatch();
  } catch (error) {
    console.error(error);
    setControlsEnabled(false);
    const errorMessage = formatError(error);
    setStatus(errorMessage, "error");
    elements.lastMessage.textContent = errorMessage;
  }
}

main();
