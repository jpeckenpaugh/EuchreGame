import * as genai from "./vendor/tasks-genai/genai_bundle.mjs";
import { DEFAULT_SETTINGS, openSandboxDB, readRecord, writeRecord } from "./browser_db.js";

const STORE_SETTINGS = "settings";
const STORE_METRICS = "metrics";
const STORE_SESSION = "session";

const SETTINGS_ID = "benchmark_settings";
const METRICS_ID = "benchmark_metrics";
const SESSION_ID = "benchmark_session";

const DEFAULT_BENCHMARK_SETTINGS = {
  selectedView: DEFAULT_SETTINGS.selectedView,
  autoSpeed: DEFAULT_SETTINGS.autoSpeed,
  winningScore: 10,
  benchmarkGames: 10,
  aiTeam: 0,
  aiModelPath: DEFAULT_SETTINGS.aiModelPath,
  aiTemperature: DEFAULT_SETTINGS.aiTemperature,
  aiTopK: DEFAULT_SETTINGS.aiTopK,
  aiMaxTokens: DEFAULT_SETTINGS.aiMaxTokens,
  aiSeed: DEFAULT_SETTINGS.aiSeed,
  aiAutoFallback: DEFAULT_SETTINGS.aiAutoFallback,
};

const DEFAULT_BENCHMARK_METRICS = {
  ai_turns: 0,
  forced_move_count: 0,
  valid_json_count: 0,
  legal_move_count: 0,
  fallback_count: 0,
  invalid_json_count: 0,
  illegal_move_count: 0,
  engine_error_count: 0,
  ai_tricks_won: 0,
  random_tricks_won: 0,
  ai_final_points_total: 0,
  random_final_points_total: 0,
  updated_at: null,
};

const DEFAULT_BENCHMARK_SESSION = {
  benchmark_status: "Benchmark idle.",
  running: false,
  target_games: DEFAULT_BENCHMARK_SETTINGS.benchmarkGames,
  completed_games: 0,
  current_game_index: 0,
  current_game_seed: null,
  current_game_ai_tricks: 0,
  current_game_random_tricks: 0,
  current_base_seed: null,
  last_recorded_hand_key: null,
  last_completed_score: "Last completed game: none yet.",
  recent_results: [],
  ai_status: "AI idle. Load the model to benchmark it.",
  ai_cache_status: "Model asset status unknown.",
  storage_status: "Persistent storage not requested yet.",
  last_move_source: "-",
  last_ai_latency_ms: null,
  last_summary: null,
  last_logs: [],
  updated_at: null,
};

const elements = {
  statusPill: document.querySelector("#status-pill"),
  statusText: document.querySelector("#status-text"),
  seedInput: document.querySelector("#seed-input"),
  gamesInput: document.querySelector("#games-input"),
  aiTeamSelect: document.querySelector("#ai-team-select"),
  viewSelect: document.querySelector("#view-select"),
  speedSelect: document.querySelector("#speed-select"),
  modelPathInput: document.querySelector("#model-path-input"),
  aiTemperatureInput: document.querySelector("#ai-temperature-input"),
  aiTopKInput: document.querySelector("#ai-top-k-input"),
  aiMaxTokensInput: document.querySelector("#ai-max-tokens-input"),
  aiSeedInput: document.querySelector("#ai-seed-input"),
  aiFallbackCheckbox: document.querySelector("#ai-fallback-checkbox"),
  startBenchmarkButton: document.querySelector("#start-benchmark-button"),
  stopBenchmarkButton: document.querySelector("#stop-benchmark-button"),
  resetResultsButton: document.querySelector("#reset-results-button"),
  loadAiButton: document.querySelector("#load-ai-button"),
  unloadAiButton: document.querySelector("#unload-ai-button"),
  runStatusValue: document.querySelector("#run-status-value"),
  gamesProgressValue: document.querySelector("#games-progress-value"),
  currentGameValue: document.querySelector("#current-game-value"),
  aiTeamValue: document.querySelector("#ai-team-value"),
  competenceScoreValue: document.querySelector("#competence-score-value"),
  competenceScoreNote: document.querySelector("#competence-score-note"),
  metricAiTurns: document.querySelector("#metric-ai-turns"),
  metricForcedMoves: document.querySelector("#metric-forced-moves"),
  metricValidJson: document.querySelector("#metric-valid-json"),
  metricLegalMoves: document.querySelector("#metric-legal-moves"),
  metricFallbacks: document.querySelector("#metric-fallbacks"),
  metricAiTricks: document.querySelector("#metric-ai-tricks"),
  metricRandomTricks: document.querySelector("#metric-random-tricks"),
  metricTrickShare: document.querySelector("#metric-trick-share"),
  metricAiPoints: document.querySelector("#metric-ai-points"),
  metricRandomPoints: document.querySelector("#metric-random-points"),
  metricAverageScore: document.querySelector("#metric-average-score"),
  lastGameScoreLine: document.querySelector("#last-game-score-line"),
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
  benchmarkHistoryList: document.querySelector("#benchmark-history-list"),
  aiCacheValue: document.querySelector("#ai-cache-value"),
  aiStatusLine: document.querySelector("#ai-status-line"),
  cacheStatusLine: document.querySelector("#cache-status-line"),
  storageStatusLine: document.querySelector("#storage-status-line"),
  aiLastSourceValue: document.querySelector("#ai-last-source-value"),
  aiLastLatencyValue: document.querySelector("#ai-last-latency-value"),
  seats: [0, 1, 2, 3].map((seat) => document.querySelector(`#seat-${seat}`)),
};

const seatNames = ["North", "East", "South", "West"];
const teamLabels = ["North / South", "East / West"];
const suitSymbols = { C: "C", D: "D", H: "H", S: "S" };
const suitNames = { C: "Clubs", D: "Diamonds", H: "Hearts", S: "Spades" };

const runtimeState = {
  pyodide: null,
  bridgeModule: null,
  currentSnapshot: null,
  db: null,
  settings: { ...DEFAULT_BENCHMARK_SETTINGS },
  metrics: { ...DEFAULT_BENCHMARK_METRICS },
  session: { ...DEFAULT_BENCHMARK_SESSION },
  aiRunner: null,
  aiFileset: null,
  aiLoadPromise: null,
  aiLoadedFingerprint: null,
  sessionPersistTimer: null,
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
    tone === "ready" ? "Ready" : tone === "error" ? "Runtime Error" : "Loading";
}

function teamForSeat(seat) {
  return seat % 2 === 0 ? 0 : 1;
}

function randomTeam() {
  return 1 - runtimeState.settings.aiTeam;
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
    return { rank: ".", suit: "", label: "None", color: "" };
  }

  if (card === "??") {
    return { rank: "?", suit: "*", label: "Hidden", color: "" };
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
        <p class="seat-subline">Player ${player.seat} | Partner ${player.partner}</p>
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

function formatPercent(numerator, denominator) {
  if (!denominator) {
    return "0%";
  }
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function formatLatency(value) {
  if (!Number.isFinite(value) || value < 0) {
    return "-";
  }
  if (value < 1000) {
    return `${Math.round(value)} ms`;
  }
  return `${(value / 1000).toFixed(2)} s`;
}

function formatCountWithPercent(numerator, denominator) {
  return `${numerator} / ${denominator} (${formatPercent(numerator, denominator)})`;
}

function displayModelAsset(pathValue) {
  const trimmed = pathValue.trim();
  if (!trimmed) {
    return "-";
  }
  const normalized = trimmed.replace(/\/+$/, "");
  const segments = normalized.split("/");
  return segments[segments.length - 1] || normalized;
}

function currentAiFingerprint() {
  return JSON.stringify({
    modelPath: runtimeState.settings.aiModelPath,
    temperature: runtimeState.settings.aiTemperature,
    topK: runtimeState.settings.aiTopK,
    maxTokens: runtimeState.settings.aiMaxTokens,
    aiSeed: runtimeState.settings.aiSeed,
  });
}

function getSeedValue() {
  const parsedSeed = Number.parseInt(runtimeState.settings.aiSeed, 10);
  return Number.isFinite(parsedSeed) ? parsedSeed : undefined;
}

function buildLlmOptions(modelUrl) {
  const options = {
    baseOptions: {
      modelAssetPath: modelUrl,
    },
    maxTokens: runtimeState.settings.aiMaxTokens,
    topK: runtimeState.settings.aiTopK,
    temperature: runtimeState.settings.aiTemperature,
  };

  const seed = getSeedValue();
  if (seed !== undefined) {
    options.randomSeed = seed;
  }
  return options;
}

function benchmarkTargetGames() {
  return Math.max(1, Number.parseInt(runtimeState.settings.benchmarkGames, 10) || 10);
}

function computeCompetenceScore() {
  const aiTurns = runtimeState.metrics.ai_turns;
  const totalTricks = runtimeState.metrics.ai_tricks_won + runtimeState.metrics.random_tricks_won;
  const totalFinalPoints =
    runtimeState.metrics.ai_final_points_total + runtimeState.metrics.random_final_points_total;

  if (!aiTurns && !totalTricks && !runtimeState.session.completed_games) {
    return null;
  }

  const moveQuality = aiTurns
    ? (runtimeState.metrics.valid_json_count / aiTurns +
        runtimeState.metrics.legal_move_count / aiTurns) /
      2
    : 0;
  const trickShare = totalTricks ? runtimeState.metrics.ai_tricks_won / totalTricks : 0;
  const pointShare = totalFinalPoints ? runtimeState.metrics.ai_final_points_total / totalFinalPoints : 0;

  return Math.round((moveQuality * 0.4 + trickShare * 0.35 + pointShare * 0.25) * 100);
}

function renderBenchmarkHistory() {
  if (!runtimeState.session.recent_results.length) {
    elements.benchmarkHistoryList.innerHTML = `<li>No completed games yet.</li>`;
    return;
  }

  elements.benchmarkHistoryList.innerHTML = runtimeState.session.recent_results
    .map((result) => {
      const seedPart = result.seed == null ? "" : ` | seed ${result.seed}`;
      return `
        <li>
          <strong>Game ${result.game_index}</strong><br />
          ${teamLabels[runtimeState.settings.aiTeam]} ${result.ai_score} - ${result.random_score} ${
            teamLabels[randomTeam()]
          }<br />
          Tricks: ${result.ai_tricks} - ${result.random_tricks}${seedPart}
        </li>
      `;
    })
    .join("");
}

function renderBenchmarkPanel() {
  const completedGames = runtimeState.session.completed_games;
  const targetGames = runtimeState.session.running
    ? runtimeState.session.target_games
    : benchmarkTargetGames();
  const competenceScore = computeCompetenceScore();
  const aiTurns = runtimeState.metrics.ai_turns;
  const totalTricks = runtimeState.metrics.ai_tricks_won + runtimeState.metrics.random_tricks_won;

  elements.runStatusValue.textContent = runtimeState.session.running ? "Running" : "Idle";
  elements.gamesProgressValue.textContent = `${completedGames} / ${targetGames}`;
  elements.currentGameValue.textContent =
    runtimeState.session.current_game_index > 0
      ? String(runtimeState.session.current_game_index)
      : "-";
  elements.aiTeamValue.textContent = teamLabels[runtimeState.settings.aiTeam];
  elements.competenceScoreValue.textContent =
    competenceScore == null ? "-" : `${competenceScore} / 100`;
  elements.metricAiTurns.textContent = String(runtimeState.metrics.ai_turns);
  elements.metricForcedMoves.textContent = String(runtimeState.metrics.forced_move_count);
  elements.metricValidJson.textContent = formatCountWithPercent(
    runtimeState.metrics.valid_json_count,
    aiTurns,
  );
  elements.metricLegalMoves.textContent = formatCountWithPercent(
    runtimeState.metrics.legal_move_count,
    aiTurns,
  );
  elements.metricFallbacks.textContent = String(runtimeState.metrics.fallback_count);
  elements.metricAiTricks.textContent = String(runtimeState.metrics.ai_tricks_won);
  elements.metricRandomTricks.textContent = String(runtimeState.metrics.random_tricks_won);
  elements.metricTrickShare.textContent = formatPercent(runtimeState.metrics.ai_tricks_won, totalTricks);
  elements.metricAiPoints.textContent = String(runtimeState.metrics.ai_final_points_total);
  elements.metricRandomPoints.textContent = String(runtimeState.metrics.random_final_points_total);
  elements.metricAverageScore.textContent =
    completedGames > 0
      ? `${(runtimeState.metrics.ai_final_points_total / completedGames).toFixed(1)} - ${(
          runtimeState.metrics.random_final_points_total / completedGames
        ).toFixed(1)}`
      : "-";
  elements.lastGameScoreLine.textContent = runtimeState.session.last_completed_score;
  elements.aiCacheValue.textContent = displayModelAsset(runtimeState.settings.aiModelPath);
  elements.aiStatusLine.textContent = runtimeState.session.ai_status;
  elements.cacheStatusLine.textContent = runtimeState.session.ai_cache_status;
  elements.storageStatusLine.textContent = runtimeState.session.storage_status;
  elements.aiLastSourceValue.textContent = runtimeState.session.last_move_source || "-";
  elements.aiLastLatencyValue.textContent = formatLatency(runtimeState.session.last_ai_latency_ms);
  elements.seedInput.disabled = runtimeState.session.running;
  elements.gamesInput.disabled = runtimeState.session.running;
  elements.aiTeamSelect.disabled = runtimeState.session.running;
  elements.modelPathInput.disabled = runtimeState.session.running;
  elements.aiTemperatureInput.disabled = runtimeState.session.running;
  elements.aiTopKInput.disabled = runtimeState.session.running;
  elements.aiMaxTokensInput.disabled = runtimeState.session.running;
  elements.aiSeedInput.disabled = runtimeState.session.running;
  elements.aiFallbackCheckbox.disabled = runtimeState.session.running;
  elements.startBenchmarkButton.disabled = !runtimeState.bridgeModule || runtimeState.session.running;
  elements.stopBenchmarkButton.disabled = !runtimeState.bridgeModule || !runtimeState.session.running;
  elements.resetResultsButton.disabled = !runtimeState.bridgeModule || runtimeState.session.running;
  elements.loadAiButton.disabled = !runtimeState.bridgeModule || runtimeState.session.running;
  elements.unloadAiButton.disabled =
    !runtimeState.bridgeModule || !runtimeState.aiRunner || runtimeState.session.running;
  renderBenchmarkHistory();
}

function renderSnapshot(snapshot) {
  runtimeState.currentSnapshot = snapshot;
  const summary = snapshot.summary;
  const upcard = summary.upcard ?? "-";

  elements.phaseValue.textContent = summary.phase_label;
  elements.handValue.textContent = String(summary.hand_number);
  elements.trumpValue.textContent = summary.trump ? summary.trump : "Unset";
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
  renderBenchmarkPanel();
  schedulePersistSession();
}

function schedulePersistSession() {
  if (!runtimeState.db) {
    return;
  }
  if (runtimeState.sessionPersistTimer != null) {
    window.clearTimeout(runtimeState.sessionPersistTimer);
  }
  runtimeState.sessionPersistTimer = window.setTimeout(() => {
    runtimeState.sessionPersistTimer = null;
    void persistSession();
  }, 200);
}

async function persistSettings() {
  if (!runtimeState.db) {
    return;
  }
  await writeRecord(runtimeState.db, STORE_SETTINGS, SETTINGS_ID, {
    ...runtimeState.settings,
    updated_at: new Date().toISOString(),
  });
}

async function persistMetrics() {
  if (!runtimeState.db) {
    return;
  }
  await writeRecord(runtimeState.db, STORE_METRICS, METRICS_ID, {
    ...runtimeState.metrics,
    updated_at: new Date().toISOString(),
  });
}

async function persistSession() {
  if (!runtimeState.db) {
    return;
  }
  const snapshot = runtimeState.currentSnapshot;
  runtimeState.session.last_summary = snapshot?.summary ?? null;
  runtimeState.session.last_logs = snapshot?.logs?.slice(-20) ?? [];
  await writeRecord(runtimeState.db, STORE_SESSION, SESSION_ID, {
    ...runtimeState.session,
    updated_at: new Date().toISOString(),
  });
}

function applySettingsToControls() {
  elements.seedInput.value =
    runtimeState.session.current_base_seed == null ? "" : String(runtimeState.session.current_base_seed);
  elements.gamesInput.value = String(runtimeState.settings.benchmarkGames);
  elements.aiTeamSelect.value = String(runtimeState.settings.aiTeam);
  elements.viewSelect.value = runtimeState.settings.selectedView;
  elements.speedSelect.value = runtimeState.settings.autoSpeed;
  elements.modelPathInput.value = runtimeState.settings.aiModelPath;
  elements.aiTemperatureInput.value = String(runtimeState.settings.aiTemperature);
  elements.aiTopKInput.value = String(runtimeState.settings.aiTopK);
  elements.aiMaxTokensInput.value = String(runtimeState.settings.aiMaxTokens);
  elements.aiSeedInput.value = runtimeState.settings.aiSeed;
  elements.aiFallbackCheckbox.checked = runtimeState.settings.aiAutoFallback;
}

function sanitizeTextInput(value) {
  return value.trim();
}

function readSettingsFromControls() {
  runtimeState.settings = {
    ...runtimeState.settings,
    selectedView: elements.viewSelect.value,
    autoSpeed: elements.speedSelect.value,
    benchmarkGames: Math.max(1, Number.parseInt(elements.gamesInput.value, 10) || 10),
    aiTeam: Number.parseInt(elements.aiTeamSelect.value, 10) === 1 ? 1 : 0,
    aiModelPath: sanitizeTextInput(elements.modelPathInput.value),
    aiTemperature: Number.parseFloat(elements.aiTemperatureInput.value) || 0.1,
    aiTopK: Number.parseInt(elements.aiTopKInput.value, 10) || 1,
    aiMaxTokens: Number.parseInt(elements.aiMaxTokensInput.value, 10) || 256,
    aiSeed: elements.aiSeedInput.value.trim(),
    aiAutoFallback: elements.aiFallbackCheckbox.checked,
  };
  renderBenchmarkPanel();
}

function migrateSettings(persistedSettings) {
  const migrated = {
    ...DEFAULT_BENCHMARK_SETTINGS,
    ...persistedSettings,
  };

  if (!migrated.aiModelPath || !/\.(task|litertlm)$/i.test(migrated.aiModelPath)) {
    migrated.aiModelPath = DEFAULT_BENCHMARK_SETTINGS.aiModelPath;
  }
  if (!Number.isFinite(Number(migrated.aiTemperature))) {
    migrated.aiTemperature = DEFAULT_BENCHMARK_SETTINGS.aiTemperature;
  }
  if (!Number.isFinite(Number(migrated.aiTopK)) || Number(migrated.aiTopK) < 1) {
    migrated.aiTopK = DEFAULT_BENCHMARK_SETTINGS.aiTopK;
  }
  if (!Number.isFinite(Number(migrated.aiMaxTokens)) || Number(migrated.aiMaxTokens) < 64) {
    migrated.aiMaxTokens = DEFAULT_BENCHMARK_SETTINGS.aiMaxTokens;
  }
  if (Number.parseInt(migrated.aiTeam, 10) !== 1) {
    migrated.aiTeam = 0;
  }
  migrated.benchmarkGames = Math.max(1, Number.parseInt(migrated.benchmarkGames, 10) || 10);
  if (typeof migrated.aiSeed !== "string") {
    migrated.aiSeed = DEFAULT_BENCHMARK_SETTINGS.aiSeed;
  }
  return migrated;
}

function resolveAssetUrl(value) {
  return new URL(value, import.meta.url).href;
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
    const content = await loadTextFile(file.source);
    ensureDirectory(pyodide.FS, file.target.substring(0, file.target.lastIndexOf("/")));
    pyodide.FS.writeFile(file.target, content, { encoding: "utf8" });
  }

  await pyodide.runPythonAsync(`
import importlib
import sys

if "/app" not in sys.path:
    sys.path.insert(0, "/app")

import game_bridge
importlib.invalidate_caches()
importlib.reload(game_bridge)
`);
}

function setAiStatus(message, tone = "ready") {
  runtimeState.session.ai_status = message;
  renderBenchmarkPanel();
  if (tone === "error") {
    setStatus(message, "error");
  }
  void persistSession();
}

function setLastMoveSource(source, latencyMs = null) {
  runtimeState.session.last_move_source = source;
  runtimeState.session.last_ai_latency_ms = latencyMs;
  renderBenchmarkPanel();
  void persistSession();
}

async function fetchOk(url) {
  let response = await fetch(url, { method: "HEAD" });
  if (response.status === 405 || response.status === 501) {
    response = await fetch(url, { method: "GET" });
  }
  if (!response.ok) {
    throw new Error(`Missing required local asset at ${url} (${response.status})`);
  }
}

async function verifyLocalModelAsset() {
  const modelUrl = resolveAssetUrl(runtimeState.settings.aiModelPath);
  await fetchOk(modelUrl);
  runtimeState.session.ai_cache_status = `Local model asset found: ${displayModelAsset(
    runtimeState.settings.aiModelPath,
  )}.`;
  renderBenchmarkPanel();
  return modelUrl;
}

async function ensureStoragePersistence() {
  if (!navigator.storage?.persisted) {
    runtimeState.session.storage_status = "Persistent storage API unavailable in this browser.";
    renderBenchmarkPanel();
    return;
  }

  const alreadyPersisted = await navigator.storage.persisted();
  if (alreadyPersisted) {
    runtimeState.session.storage_status = "Persistent browser storage is enabled.";
    renderBenchmarkPanel();
    return;
  }

  if (!navigator.storage.persist) {
    runtimeState.session.storage_status = "Persistent storage cannot be requested here.";
    renderBenchmarkPanel();
    return;
  }

  const granted = await navigator.storage.persist();
  runtimeState.session.storage_status = granted
    ? "Persistent browser storage granted."
    : "Persistent browser storage request was not granted.";
  renderBenchmarkPanel();
}

async function ensureGenAiFileset() {
  if (runtimeState.aiFileset) {
    return runtimeState.aiFileset;
  }
  const wasmBase = new URL("./vendor/tasks-genai/wasm/", import.meta.url).href;
  runtimeState.aiFileset = await genai.FilesetResolver.forGenAiTasks(wasmBase);
  return runtimeState.aiFileset;
}

async function unloadAiEngine() {
  if (!runtimeState.aiRunner) {
    renderBenchmarkPanel();
    return;
  }

  try {
    runtimeState.aiRunner.close();
  } catch {
    // Ignore cleanup issues.
  }

  runtimeState.aiRunner = null;
  runtimeState.aiLoadedFingerprint = null;
  runtimeState.session.ai_status = "AI unloaded.";
  renderBenchmarkPanel();
  await persistSession();
}

async function loadAiEngine(forceReload = false) {
  readSettingsFromControls();
  const fingerprint = currentAiFingerprint();
  if (runtimeState.aiRunner && runtimeState.aiLoadedFingerprint === fingerprint && !forceReload) {
    return runtimeState.aiRunner;
  }
  if (runtimeState.aiLoadPromise && !forceReload) {
    return runtimeState.aiLoadPromise;
  }

  runtimeState.aiLoadPromise = (async () => {
    await ensureStoragePersistence();
    const modelUrl = await verifyLocalModelAsset();
    const wasmFileset = await ensureGenAiFileset();
    await unloadAiEngine();

    const modelName = displayModelAsset(runtimeState.settings.aiModelPath);
    setAiStatus(`Loading ${modelName} with LiteRT...`);
    setStatus("Loading local LiteRT model asset.", "loading");

    const runner = await genai.LlmInference.createFromOptions(
      wasmFileset,
      buildLlmOptions(modelUrl),
    );

    runtimeState.aiRunner = runner;
    runtimeState.aiLoadedFingerprint = fingerprint;
    runtimeState.session.ai_cache_status = `Loaded ${modelName} from the local vendor path.`;
    setAiStatus(`${modelName} is ready.`);
    setStatus("Pyodide and LiteRT AI are ready.", "ready");
    return runner;
  })()
    .catch((error) => {
      const errorMessage = formatError(error);
      runtimeState.aiRunner = null;
      runtimeState.aiLoadedFingerprint = null;
      runtimeState.session.ai_cache_status = "AI unavailable because the model asset did not load.";
      setAiStatus(errorMessage, "error");
      throw error;
    })
    .finally(() => {
      runtimeState.aiLoadPromise = null;
      renderBenchmarkPanel();
      schedulePersistSession();
    });

  return runtimeState.aiLoadPromise;
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
  setStatus("Pyodide is ready. Loading the current game.", "ready");
}

async function newMatch(seedValue = null) {
  const snapshot = await callBridge("new_match", {
    seed: seedValue,
    winning_score: runtimeState.settings.winningScore,
  });
  const refreshed = await callBridge("set_view", parseViewSelection());
  renderSnapshot(refreshed ?? snapshot);
}

async function refreshView() {
  const snapshot = await callBridge("set_view", parseViewSelection());
  renderSnapshot(snapshot);
}

async function stepRandomMove(source = "Random") {
  const snapshot = await callBridge("step_random", parseViewSelection());
  setLastMoveSource(source, null);
  renderSnapshot(snapshot);
  return snapshot;
}

function buildAiPrompt(aiContext) {
  const legalTokens = JSON.stringify(aiContext.legal_move_tokens);
  return [
    "You are selecting exactly one legal Euchre move for the acting player.",
    'Return only minified JSON in this exact format: {"move":"TOKEN"}',
    "Do not include markdown fences, explanations, or any keys other than move.",
    `Compact state: ${aiContext.compact_state}`,
    `Allowed move tokens (copy exactly one): ${legalTokens}`,
    "The move value must exactly match one allowed token.",
  ].join("\n");
}

function parseAiJsonResponse(rawText) {
  const trimmed = rawText.trim();
  const candidates = [trimmed];

  if (trimmed.startsWith("```")) {
    const withoutFence = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    candidates.push(withoutFence);
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  let parsed = null;
  let lastError = null;
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      parsed = JSON.parse(candidate);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!parsed || typeof parsed !== "object") {
    throw lastError ?? new Error("Model did not return a JSON object.");
  }

  const move = typeof parsed.move === "string" ? parsed.move.trim() : "";
  if (!move) {
    throw new Error("Model response JSON did not include a non-empty move.");
  }

  return { move };
}

function normalizeMoveToken(token) {
  return token.trim().toUpperCase().replace(/\s+/g, "_").replace("CALL:", "CALL_");
}

async function applyChosenMove(moveToken, { reason = null, sourceLabel = "AI" } = {}) {
  const snapshot = await callBridge("apply_move_token", {
    move_token: normalizeMoveToken(moveToken),
    reason,
    source_label: sourceLabel,
    ...parseViewSelection(),
  });
  return snapshot;
}

async function recordAiFailure(kind, detail) {
  runtimeState.metrics.fallback_count += 1;
  if (kind === "invalid_json") {
    runtimeState.metrics.invalid_json_count += 1;
  } else if (kind === "illegal_move") {
    runtimeState.metrics.illegal_move_count += 1;
  } else if (kind === "engine_error") {
    runtimeState.metrics.engine_error_count += 1;
  }
  await persistMetrics();

  const shortDetail = detail.length > 220 ? `${detail.slice(0, 217)}...` : detail;
  await callBridge("record_note", {
    message: `AI fallback (${kind}): ${shortDetail}`,
  });
  runtimeState.session.ai_status = `AI fallback used: ${shortDetail}`;
  setLastMoveSource(`Fallback (${kind})`, null);
  renderBenchmarkPanel();
}

async function performFallback(kind, detail) {
  await recordAiFailure(kind, detail);
  if (!runtimeState.settings.aiAutoFallback) {
    throw new Error(detail);
  }
  return stepRandomMove(`Fallback to random (${kind})`);
}

async function stepAiMove(currentSnapshot) {
  const aiContext = currentSnapshot.ai_context ?? (await callBridge("get_ai_context"));
  if (!aiContext) {
    return stepRandomMove("No AI context");
  }

  if (aiContext.legal_move_tokens.length === 1) {
    const forcedMove = aiContext.legal_move_tokens[0];
    try {
      const snapshot = await applyChosenMove(forcedMove, {
        reason: "Only one legal move was available, so inference was skipped.",
        sourceLabel: "Forced move",
      });
      runtimeState.metrics.forced_move_count += 1;
      await persistMetrics();
      runtimeState.session.ai_status = `Skipped inference and auto-applied ${forcedMove}.`;
      setLastMoveSource("Forced legal move", null);
      renderSnapshot(snapshot);
      return snapshot;
    } catch (error) {
      return performFallback("illegal_move", formatError(error));
    }
  }

  runtimeState.metrics.ai_turns += 1;
  await persistMetrics();
  renderBenchmarkPanel();

  let runner;
  try {
    runner = await loadAiEngine();
  } catch (error) {
    return performFallback("engine_error", formatError(error));
  }

  let aiResponse;
  try {
    setAiStatus(`AI is evaluating ${displayModelAsset(runtimeState.settings.aiModelPath)}...`);
    const startedAt = performance.now();
    const rawText = await runner.generateResponse(buildAiPrompt(aiContext));
    const elapsedMs = performance.now() - startedAt;
    aiResponse = parseAiJsonResponse(rawText);
    runtimeState.metrics.valid_json_count += 1;
    await persistMetrics();
    setLastMoveSource("Gemma AI response", elapsedMs);
  } catch (error) {
    return performFallback("invalid_json", formatError(error));
  }

  try {
    const snapshot = await applyChosenMove(aiResponse.move, { sourceLabel: "AI" });
    runtimeState.metrics.legal_move_count += 1;
    await persistMetrics();
    runtimeState.session.ai_status = `AI selected ${normalizeMoveToken(aiResponse.move)} successfully.`;
    runtimeState.session.last_move_source = "Gemma AI";
    renderSnapshot(snapshot);
    return snapshot;
  } catch (error) {
    return performFallback("illegal_move", formatError(error));
  }
}

function scoreValue(summaryScores, team) {
  return Number(summaryScores[String(team)] ?? summaryScores[team] ?? 0);
}

function trickValue(summaryTricks, team) {
  return Number(summaryTricks[String(team)] ?? summaryTricks[team] ?? 0);
}

async function maybeRecordCompletedHand(snapshot) {
  if (snapshot.summary.phase !== "hand_complete") {
    return;
  }

  const handKey = `${runtimeState.session.current_game_index}:${snapshot.summary.hand_number}`;
  if (runtimeState.session.last_recorded_hand_key === handKey) {
    return;
  }

  runtimeState.session.last_recorded_hand_key = handKey;
  const aiTricks = trickValue(snapshot.summary.tricks_won, runtimeState.settings.aiTeam);
  const randomTricks = trickValue(snapshot.summary.tricks_won, randomTeam());

  runtimeState.metrics.ai_tricks_won += aiTricks;
  runtimeState.metrics.random_tricks_won += randomTricks;
  runtimeState.session.current_game_ai_tricks += aiTricks;
  runtimeState.session.current_game_random_tricks += randomTricks;

  await persistMetrics();
  await persistSession();
}

async function recordCompletedGame(snapshot) {
  const aiScore = scoreValue(snapshot.summary.scores, runtimeState.settings.aiTeam);
  const randomScore = scoreValue(snapshot.summary.scores, randomTeam());

  runtimeState.metrics.ai_final_points_total += aiScore;
  runtimeState.metrics.random_final_points_total += randomScore;
  runtimeState.session.completed_games += 1;
  runtimeState.session.last_completed_score =
    `Last completed game: ${teamLabels[runtimeState.settings.aiTeam]} ${aiScore} - ${randomScore} ${
      teamLabels[randomTeam()]
    }`;
  runtimeState.session.recent_results = [
    {
      game_index: runtimeState.session.current_game_index,
      seed: runtimeState.session.current_game_seed,
      ai_score: aiScore,
      random_score: randomScore,
      ai_tricks: runtimeState.session.current_game_ai_tricks,
      random_tricks: runtimeState.session.current_game_random_tricks,
    },
    ...runtimeState.session.recent_results,
  ].slice(0, 12);

  runtimeState.session.benchmark_status =
    runtimeState.session.completed_games >= runtimeState.session.target_games
      ? "Benchmark completed."
      : `Game ${runtimeState.session.current_game_index} complete. Preparing the next game.`;

  await persistMetrics();
  await persistSession();
  renderBenchmarkPanel();
}

function nextBenchmarkSeed(gameIndex) {
  if (runtimeState.session.current_base_seed == null) {
    return null;
  }
  return runtimeState.session.current_base_seed + gameIndex - 1;
}

async function beginBenchmarkGame(gameIndex) {
  runtimeState.session.current_game_index = gameIndex;
  runtimeState.session.current_game_seed = nextBenchmarkSeed(gameIndex);
  runtimeState.session.current_game_ai_tricks = 0;
  runtimeState.session.current_game_random_tricks = 0;
  runtimeState.session.last_recorded_hand_key = null;
  runtimeState.session.benchmark_status = `Running game ${gameIndex} of ${runtimeState.session.target_games}.`;
  await persistSession();
  await newMatch(runtimeState.session.current_game_seed);
}

async function stepBenchmarkTurn() {
  const snapshot =
    runtimeState.currentSnapshot ?? (await callBridge("get_snapshot", parseViewSelection()));

  if (snapshot.summary.phase === "hand_complete") {
    await maybeRecordCompletedHand(snapshot);
    if (snapshot.summary.match_complete) {
      await recordCompletedGame(snapshot);
      return snapshot;
    }
    return stepRandomMove("Hand rollover");
  }

  const currentPlayer = snapshot.summary.current_player;
  if (currentPlayer == null) {
    return stepRandomMove("No active player");
  }

  if (teamForSeat(currentPlayer) === runtimeState.settings.aiTeam) {
    return stepAiMove(snapshot);
  }
  return stepRandomMove(`${teamLabels[randomTeam()]} random turn`);
}

function waitForDelay() {
  const delay = Number.parseInt(runtimeState.settings.autoSpeed, 10) || 700;
  return new Promise((resolve) => window.setTimeout(resolve, delay));
}

async function startBenchmark() {
  if (runtimeState.session.running) {
    return;
  }

  readSettingsFromControls();
  await persistSettings();
  await loadAiEngine();

  const seedText = elements.seedInput.value.trim();
  const parsedSeed = seedText === "" ? Math.floor(Date.now() % 10_000_000) : Number.parseInt(seedText, 10);
  runtimeState.session.current_base_seed = Number.isFinite(parsedSeed) ? parsedSeed : null;
  elements.seedInput.value =
    runtimeState.session.current_base_seed == null ? "" : String(runtimeState.session.current_base_seed);

  runtimeState.metrics = { ...DEFAULT_BENCHMARK_METRICS };
  runtimeState.session = {
    ...DEFAULT_BENCHMARK_SESSION,
    ai_status: runtimeState.session.ai_status,
    ai_cache_status: runtimeState.session.ai_cache_status,
    storage_status: runtimeState.session.storage_status,
    target_games: benchmarkTargetGames(),
    running: true,
    current_base_seed: runtimeState.session.current_base_seed,
  };

  await persistMetrics();
  await persistSession();
  renderBenchmarkPanel();
  setStatus("Benchmark running.", "ready");

  await beginBenchmarkGame(1);

  while (runtimeState.session.running && runtimeState.session.completed_games < runtimeState.session.target_games) {
    const snapshot = await stepBenchmarkTurn();
    if (
      runtimeState.session.running &&
      snapshot.summary.phase === "hand_complete" &&
      snapshot.summary.match_complete &&
      runtimeState.session.completed_games < runtimeState.session.target_games
    ) {
      await beginBenchmarkGame(runtimeState.session.completed_games + 1);
    }
    if (!runtimeState.session.running) {
      break;
    }
    await waitForDelay();
  }

  runtimeState.session.running = false;
  if (runtimeState.session.completed_games >= runtimeState.session.target_games) {
    runtimeState.session.benchmark_status = "Benchmark completed.";
  } else {
    runtimeState.session.benchmark_status = "Benchmark stopped.";
  }
  await persistSession();
  renderBenchmarkPanel();
}

async function stopBenchmark() {
  runtimeState.session.running = false;
  runtimeState.session.benchmark_status = "Benchmark stopping...";
  await persistSession();
  renderBenchmarkPanel();
}

async function resetResults() {
  runtimeState.metrics = { ...DEFAULT_BENCHMARK_METRICS };
  runtimeState.session = {
    ...DEFAULT_BENCHMARK_SESSION,
    ai_status: runtimeState.session.ai_status,
    ai_cache_status: runtimeState.session.ai_cache_status,
    storage_status: runtimeState.session.storage_status,
  };
  await persistMetrics();
  await persistSession();
  renderBenchmarkPanel();
}

function markAiConfigDirty() {
  runtimeState.aiLoadedFingerprint = null;
}

function bindEvents() {
  const settingInputs = [
    elements.gamesInput,
    elements.aiTeamSelect,
    elements.viewSelect,
    elements.speedSelect,
    elements.modelPathInput,
    elements.aiTemperatureInput,
    elements.aiTopKInput,
    elements.aiMaxTokensInput,
    elements.aiSeedInput,
    elements.aiFallbackCheckbox,
  ];

  for (const element of settingInputs) {
    element.addEventListener("change", async () => {
      readSettingsFromControls();
      markAiConfigDirty();
      await persistSettings();
      renderBenchmarkPanel();
      if (element === elements.viewSelect && runtimeState.bridgeModule) {
        await refreshView();
      }
    });
  }

  elements.startBenchmarkButton.addEventListener("click", async () => {
    try {
      await startBenchmark();
    } catch (error) {
      runtimeState.session.running = false;
      runtimeState.session.benchmark_status = "Benchmark failed.";
      await persistSession();
      renderBenchmarkPanel();
      setStatus(formatError(error), "error");
    }
  });

  elements.stopBenchmarkButton.addEventListener("click", async () => {
    try {
      await stopBenchmark();
    } catch (error) {
      setStatus(formatError(error), "error");
    }
  });

  elements.resetResultsButton.addEventListener("click", async () => {
    try {
      await resetResults();
    } catch (error) {
      setStatus(formatError(error), "error");
    }
  });

  elements.loadAiButton.addEventListener("click", async () => {
    try {
      await loadAiEngine(true);
    } catch {
      // Error already surfaced in the UI.
    }
  });

  elements.unloadAiButton.addEventListener("click", async () => {
    try {
      await unloadAiEngine();
      renderBenchmarkPanel();
    } catch (error) {
      setStatus(formatError(error), "error");
    }
  });
}

async function hydratePersistentState() {
  runtimeState.db = await openSandboxDB();
  const [persistedSettings, persistedMetrics, persistedSession] = await Promise.all([
    readRecord(runtimeState.db, STORE_SETTINGS, SETTINGS_ID, DEFAULT_BENCHMARK_SETTINGS),
    readRecord(runtimeState.db, STORE_METRICS, METRICS_ID, DEFAULT_BENCHMARK_METRICS),
    readRecord(runtimeState.db, STORE_SESSION, SESSION_ID, DEFAULT_BENCHMARK_SESSION),
  ]);

  runtimeState.settings = migrateSettings(persistedSettings);
  runtimeState.metrics = { ...DEFAULT_BENCHMARK_METRICS, ...persistedMetrics };
  runtimeState.session = { ...DEFAULT_BENCHMARK_SESSION, ...persistedSession, running: false };
  applySettingsToControls();
  renderBenchmarkPanel();
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
    await hydratePersistentState();
    await initializeRuntime();
    await newMatch(runtimeState.session.current_base_seed);
    renderBenchmarkPanel();
  } catch (error) {
    console.error(error);
    const errorMessage = formatError(error);
    setStatus(errorMessage, "error");
    elements.lastMessage.textContent = errorMessage;
  }
}

main();
