import * as webllm from "./vendor/web-llm/index.js";
import {
  DEFAULT_METRICS,
  DEFAULT_SESSION,
  DEFAULT_SETTINGS,
  loadPersistedState,
  openSandboxDB,
  saveMetrics,
  saveSession,
  saveSettings,
} from "./browser_db.js";

const elements = {
  statusPill: document.querySelector("#status-pill"),
  statusText: document.querySelector("#status-text"),
  seedInput: document.querySelector("#seed-input"),
  viewSelect: document.querySelector("#view-select"),
  speedSelect: document.querySelector("#speed-select"),
  modeSelect: document.querySelector("#mode-select"),
  cacheSelect: document.querySelector("#cache-select"),
  modelIdInput: document.querySelector("#model-id-input"),
  modelPathInput: document.querySelector("#model-path-input"),
  modelLibInput: document.querySelector("#model-lib-input"),
  aiTemperatureInput: document.querySelector("#ai-temperature-input"),
  aiMaxTokensInput: document.querySelector("#ai-max-tokens-input"),
  aiSeedInput: document.querySelector("#ai-seed-input"),
  aiFallbackCheckbox: document.querySelector("#ai-fallback-checkbox"),
  newMatchButton: document.querySelector("#new-match-button"),
  nextMoveButton: document.querySelector("#next-move-button"),
  autoPlayButton: document.querySelector("#auto-play-button"),
  loadAiButton: document.querySelector("#load-ai-button"),
  clearAiCacheButton: document.querySelector("#clear-ai-cache-button"),
  resetMetricsButton: document.querySelector("#reset-metrics-button"),
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
  aiModeValue: document.querySelector("#ai-mode-value"),
  aiCacheValue: document.querySelector("#ai-cache-value"),
  aiStatusLine: document.querySelector("#ai-status-line"),
  cacheStatusLine: document.querySelector("#cache-status-line"),
  storageStatusLine: document.querySelector("#storage-status-line"),
  metricTotalTurns: document.querySelector("#metric-total-turns"),
  metricValidJson: document.querySelector("#metric-valid-json"),
  metricLegalMoves: document.querySelector("#metric-legal-moves"),
  metricFallbacks: document.querySelector("#metric-fallbacks"),
  seats: [0, 1, 2, 3].map((seat) => document.querySelector(`#seat-${seat}`)),
};

const seatNames = ["North", "East", "South", "West"];
const suitSymbols = { C: "♣", D: "♦", H: "♥", S: "♠" };
const suitNames = { C: "Clubs", D: "Diamonds", H: "Hearts", S: "Spades" };
const AI_JSON_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    move: { type: "string" },
    reason: { type: "string" },
  },
  required: ["move", "reason"],
  additionalProperties: false,
});

const runtimeState = {
  pyodide: null,
  bridgeModule: null,
  autoRunning: false,
  currentSnapshot: null,
  db: null,
  settings: { ...DEFAULT_SETTINGS },
  metrics: { ...DEFAULT_METRICS },
  session: { ...DEFAULT_SESSION },
  aiEngine: null,
  aiLoadPromise: null,
  aiLoadedFingerprint: null,
  aiStatusTone: "ready",
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

function formatPercent(numerator, denominator) {
  if (!denominator) {
    return "0%";
  }
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function renderAiPanel() {
  elements.aiModeValue.textContent =
    runtimeState.settings.playMode === "ai" ? "Gemma AI" : "Random";
  elements.aiCacheValue.textContent = runtimeState.settings.aiUseIndexedDBCache
    ? "IndexedDB"
    : "Cache API";
  elements.aiStatusLine.textContent = runtimeState.session.ai_status;
  elements.cacheStatusLine.textContent = runtimeState.session.ai_cache_status;
  elements.storageStatusLine.textContent = runtimeState.session.storage_status;
  elements.metricTotalTurns.textContent = String(runtimeState.metrics.total_turns);
  elements.metricValidJson.textContent = formatPercent(
    runtimeState.metrics.valid_json_count,
    runtimeState.metrics.total_turns,
  );
  elements.metricLegalMoves.textContent = formatPercent(
    runtimeState.metrics.legal_move_count,
    runtimeState.metrics.total_turns,
  );
  elements.metricFallbacks.textContent = String(runtimeState.metrics.fallback_count);
  elements.loadAiButton.textContent =
    runtimeState.aiLoadPromise != null ? "Loading AI..." : "Load AI";
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
  renderAiPanel();

  elements.autoPlayButton.textContent = runtimeState.autoRunning ? "Pause" : "Auto Play";
  schedulePersistSession();
}

function setControlsEnabled(enabled) {
  elements.newMatchButton.disabled = !enabled;
  elements.nextMoveButton.disabled = !enabled;
  elements.autoPlayButton.disabled = !enabled;
  elements.loadAiButton.disabled = !enabled;
  elements.clearAiCacheButton.disabled = !enabled;
  elements.resetMetricsButton.disabled = !enabled;
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

function setAiStatus(message, tone = "ready") {
  runtimeState.session.ai_status = message;
  runtimeState.aiStatusTone = tone;
  renderAiPanel();
  void persistSession();
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

async function persistSession() {
  if (!runtimeState.db) {
    return;
  }

  const snapshot = runtimeState.currentSnapshot;
  runtimeState.session.last_summary = snapshot?.summary ?? null;
  runtimeState.session.last_logs = snapshot?.logs?.slice(-20) ?? [];
  await saveSession(runtimeState.db, runtimeState.session);
}

async function persistSettings() {
  if (!runtimeState.db) {
    return;
  }
  await saveSettings(runtimeState.db, runtimeState.settings);
}

async function persistMetrics() {
  if (!runtimeState.db) {
    return;
  }
  await saveMetrics(runtimeState.db, runtimeState.metrics);
}

function applySettingsToControls() {
  elements.viewSelect.value = runtimeState.settings.selectedView;
  elements.speedSelect.value = runtimeState.settings.autoSpeed;
  elements.modeSelect.value = runtimeState.settings.playMode;
  elements.cacheSelect.value = runtimeState.settings.aiUseIndexedDBCache ? "indexeddb" : "cache";
  elements.modelIdInput.value = runtimeState.settings.aiModelId;
  elements.modelPathInput.value = runtimeState.settings.aiModelPath;
  elements.modelLibInput.value = runtimeState.settings.aiModelLib;
  elements.aiTemperatureInput.value = String(runtimeState.settings.aiTemperature);
  elements.aiMaxTokensInput.value = String(runtimeState.settings.aiMaxTokens);
  elements.aiSeedInput.value = runtimeState.settings.aiSeed;
  elements.aiFallbackCheckbox.checked = runtimeState.settings.aiAutoFallback;
}

function sanitizeTextInput(value, { trailingSlash = false } = {}) {
  let normalized = value.trim();
  if (trailingSlash && normalized && !normalized.endsWith("/")) {
    normalized += "/";
  }
  return normalized;
}

function readSettingsFromControls() {
  runtimeState.settings = {
    ...runtimeState.settings,
    selectedView: elements.viewSelect.value,
    autoSpeed: elements.speedSelect.value,
    playMode: elements.modeSelect.value,
    aiUseIndexedDBCache: elements.cacheSelect.value === "indexeddb",
    aiModelId: sanitizeTextInput(elements.modelIdInput.value),
    aiModelPath: sanitizeTextInput(elements.modelPathInput.value, { trailingSlash: true }),
    aiModelLib: sanitizeTextInput(elements.modelLibInput.value),
    aiTemperature: Number.parseFloat(elements.aiTemperatureInput.value) || 0.2,
    aiMaxTokens: Number.parseInt(elements.aiMaxTokensInput.value, 10) || 96,
    aiSeed: elements.aiSeedInput.value.trim(),
    aiAutoFallback: elements.aiFallbackCheckbox.checked,
  };
  renderAiPanel();
}

function resolveAssetUrl(value) {
  return new URL(value, import.meta.url).href;
}

function buildAiConfig() {
  const settings = runtimeState.settings;
  const modelUrl = resolveAssetUrl(settings.aiModelPath);
  const modelLibUrl = resolveAssetUrl(settings.aiModelLib);
  const appConfig = {
    model_list: [
      {
        model: modelUrl,
        model_id: settings.aiModelId,
        model_lib: modelLibUrl,
      },
    ],
    useIndexedDBCache: settings.aiUseIndexedDBCache,
  };

  return { appConfig, modelUrl, modelLibUrl };
}

function currentAiFingerprint() {
  const settings = runtimeState.settings;
  return JSON.stringify({
    modelId: settings.aiModelId,
    modelPath: settings.aiModelPath,
    modelLib: settings.aiModelLib,
    useIndexedDBCache: settings.aiUseIndexedDBCache,
  });
}

async function fetchOk(url, init) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Missing required local asset at ${url} (${response.status})`);
  }
}

async function verifyLocalModelAssets() {
  const { modelUrl, modelLibUrl } = buildAiConfig();
  const configUrl = new URL("mlc-chat-config.json", modelUrl).href;
  await fetchOk(configUrl, { method: "GET" });
  await fetchOk(modelLibUrl, { method: "HEAD" });
}

async function ensureStoragePersistence() {
  if (!navigator.storage?.persisted) {
    runtimeState.session.storage_status = "Persistent storage API unavailable in this browser.";
    renderAiPanel();
    return;
  }

  const alreadyPersisted = await navigator.storage.persisted();
  if (alreadyPersisted) {
    runtimeState.session.storage_status = "Persistent browser storage is enabled.";
    renderAiPanel();
    return;
  }

  if (!navigator.storage.persist) {
    runtimeState.session.storage_status = "Persistent storage cannot be requested here.";
    renderAiPanel();
    return;
  }

  const granted = await navigator.storage.persist();
  runtimeState.session.storage_status = granted
    ? "Persistent browser storage granted."
    : "Persistent browser storage request was not granted.";
  renderAiPanel();
}

async function updateModelCacheStatus(appConfig) {
  const cached = await webllm.hasModelInCache(runtimeState.settings.aiModelId, appConfig);
  runtimeState.session.ai_cache_status = cached
    ? `Model artifacts are cached in ${
        runtimeState.settings.aiUseIndexedDBCache ? "IndexedDB" : "the Cache API"
      }.`
    : `Model artifacts are not cached yet in ${
        runtimeState.settings.aiUseIndexedDBCache ? "IndexedDB" : "the Cache API"
      }.`;
  renderAiPanel();
}

async function unloadAiEngine() {
  if (!runtimeState.aiEngine) {
    return;
  }
  try {
    await runtimeState.aiEngine.unload();
  } catch {
    // Ignore unload issues; a subsequent reload will replace the instance.
  }
  runtimeState.aiEngine = null;
  runtimeState.aiLoadedFingerprint = null;
}

async function loadAiEngine(forceReload = false) {
  readSettingsFromControls();
  const fingerprint = currentAiFingerprint();
  if (
    runtimeState.aiEngine &&
    runtimeState.aiLoadedFingerprint === fingerprint &&
    !forceReload
  ) {
    return runtimeState.aiEngine;
  }

  if (runtimeState.aiLoadPromise && !forceReload) {
    return runtimeState.aiLoadPromise;
  }

  runtimeState.aiLoadPromise = (async () => {
    const { appConfig } = buildAiConfig();
    await ensureStoragePersistence();
    setAiStatus(`Checking local assets for ${runtimeState.settings.aiModelId}...`, "loading");
    await verifyLocalModelAssets();
    await updateModelCacheStatus(appConfig);
    await unloadAiEngine();

    setAiStatus(`Loading AI model ${runtimeState.settings.aiModelId}...`, "loading");
    setStatus("Loading AI brain from local assets.", "loading");

    const engine = await webllm.CreateMLCEngine(runtimeState.settings.aiModelId, {
      appConfig,
      initProgressCallback: (progress) => {
        const message = progress?.text ?? `Loading ${runtimeState.settings.aiModelId}...`;
        runtimeState.session.ai_status = message;
        renderAiPanel();
        setStatus(message, "loading");
      },
    });

    runtimeState.aiEngine = engine;
    runtimeState.aiLoadedFingerprint = fingerprint;
    const gpuVendor = await engine.getGPUVendor().catch(() => "Unknown GPU");
    await updateModelCacheStatus(appConfig);
    setAiStatus(`AI ready on ${gpuVendor}.`, "ready");
    setStatus("Pyodide and AI are ready.", "ready");
    return engine;
  })().catch((error) => {
    const errorMessage = formatError(error);
    runtimeState.aiEngine = null;
    runtimeState.aiLoadedFingerprint = null;
    runtimeState.session.ai_cache_status = "AI cache unavailable because the model did not load.";
    setAiStatus(errorMessage, "error");
    setStatus(errorMessage, "error");
    throw error;
  }).finally(() => {
    runtimeState.aiLoadPromise = null;
    renderAiPanel();
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

  setControlsEnabled(true);
  setStatus("Pyodide is ready. Starting a new match.", "ready");
}

async function newMatch() {
  readSettingsFromControls();
  const seedText = elements.seedInput.value.trim();
  const numericSeed = seedText === "" ? Math.floor(Date.now() % 10_000_000) : Number(seedText);
  elements.seedInput.value = Number.isFinite(numericSeed) ? String(numericSeed) : "";
  const snapshot = await callBridge("new_match", {
    seed: Number.isFinite(numericSeed) ? numericSeed : null,
    winning_score: runtimeState.settings.winningScore,
  });
  const refreshed = await callBridge("set_view", parseViewSelection());
  renderSnapshot(refreshed ?? snapshot);
}

async function refreshView() {
  const snapshot = await callBridge("set_view", parseViewSelection());
  renderSnapshot(snapshot);
}

async function stepRandom() {
  const snapshot = await callBridge("step_random", parseViewSelection());
  renderSnapshot(snapshot);
  if (snapshot.summary.match_complete) {
    runtimeState.autoRunning = false;
  }
}

function buildAiMessages(aiContext) {
  return [
    {
      role: "system",
      content:
        "You are a Euchre move selector. Return JSON only. The `move` field must exactly match one token from Leg. Do not invent moves.",
    },
    {
      role: "user",
      content:
        "Choose the single best legal move for the acting player.\n" +
        `State: ${aiContext.compact_state}\n` +
        'Return exactly: {"move":"TOKEN","reason":"brief explanation"}',
    },
  ];
}

function getCompletionText(completion) {
  const content = completion?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part) {
          return part.text;
        }
        return "";
      })
      .join("");
  }
  if (content && typeof content === "object") {
    return JSON.stringify(content);
  }
  return "";
}

function parseAiJsonResponse(rawText) {
  const parsed = JSON.parse(rawText);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Model did not return a JSON object.");
  }
  const move = typeof parsed.move === "string" ? parsed.move.trim() : "";
  const reason = typeof parsed.reason === "string" ? parsed.reason.trim() : "";
  if (!move) {
    throw new Error("Model response JSON did not include a non-empty move.");
  }
  return { move, reason };
}

function normalizeMoveToken(token) {
  return token.trim().toUpperCase().replace(/\s+/g, "_").replace("CALL:", "CALL_");
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
  renderAiPanel();
}

async function performFallback(kind, detail) {
  await recordAiFailure(kind, detail);
  if (!runtimeState.settings.aiAutoFallback) {
    throw new Error(detail);
  }
  await stepRandom();
}

async function stepAi() {
  const currentSnapshot =
    runtimeState.currentSnapshot ?? (await callBridge("get_snapshot", parseViewSelection()));

  if (currentSnapshot.summary.match_complete) {
    runtimeState.autoRunning = false;
    renderSnapshot(currentSnapshot);
    return;
  }

  if (currentSnapshot.summary.phase === "hand_complete") {
    await stepRandom();
    return;
  }

  const aiContext = currentSnapshot.ai_context ?? (await callBridge("get_ai_context"));
  if (!aiContext) {
    await stepRandom();
    return;
  }

  runtimeState.metrics.total_turns += 1;
  await persistMetrics();
  renderAiPanel();

  let engine;
  try {
    engine = await loadAiEngine();
  } catch (error) {
    await performFallback("engine_error", formatError(error));
    return;
  }

  let aiResponse;
  try {
    const completion = await engine.chat.completions.create({
      messages: buildAiMessages(aiContext),
      response_format: {
        type: "json_object",
        schema: AI_JSON_SCHEMA,
      },
      temperature: runtimeState.settings.aiTemperature,
      max_tokens: runtimeState.settings.aiMaxTokens,
      seed: runtimeState.settings.aiSeed
        ? Number.parseInt(runtimeState.settings.aiSeed, 10)
        : undefined,
      model: runtimeState.settings.aiModelId,
    });

    const rawText = getCompletionText(completion);
    aiResponse = parseAiJsonResponse(rawText);
    runtimeState.metrics.valid_json_count += 1;
    await persistMetrics();
  } catch (error) {
    await performFallback("invalid_json", formatError(error));
    return;
  }

  try {
    const snapshot = await callBridge("apply_move_token", {
      move_token: normalizeMoveToken(aiResponse.move),
      reason: aiResponse.reason,
      ...parseViewSelection(),
    });
    runtimeState.metrics.legal_move_count += 1;
    await persistMetrics();
    runtimeState.session.ai_status = `AI selected ${normalizeMoveToken(aiResponse.move)} successfully.`;
    renderSnapshot(snapshot);
    if (snapshot.summary.match_complete) {
      runtimeState.autoRunning = false;
    }
  } catch (error) {
    await performFallback("illegal_move", formatError(error));
  }
}

async function stepGame() {
  readSettingsFromControls();
  await persistSettings();

  if (runtimeState.settings.playMode === "ai") {
    await stepAi();
  } else {
    await stepRandom();
  }
}

async function autoplayLoop() {
  while (runtimeState.autoRunning) {
    await stepGame();
    if (!runtimeState.autoRunning) {
      break;
    }
    const delay = Number.parseInt(runtimeState.settings.autoSpeed, 10) || 700;
    await new Promise((resolve) => window.setTimeout(resolve, delay));
  }

  renderSnapshot(runtimeState.currentSnapshot ?? (await callBridge("get_snapshot", parseViewSelection())));
}

async function clearAiCache() {
  readSettingsFromControls();
  const { appConfig } = buildAiConfig();
  await unloadAiEngine();
  await webllm.deleteModelAllInfoInCache(runtimeState.settings.aiModelId, appConfig);
  runtimeState.session.ai_cache_status = `Cleared cached artifacts for ${runtimeState.settings.aiModelId}.`;
  renderAiPanel();
  await persistSession();
}

async function resetMetrics() {
  runtimeState.metrics = { ...DEFAULT_METRICS };
  renderAiPanel();
  await persistMetrics();
}

function markAiConfigDirty() {
  runtimeState.aiLoadedFingerprint = null;
}

function bindEvents() {
  const settingInputs = [
    elements.viewSelect,
    elements.speedSelect,
    elements.modeSelect,
    elements.cacheSelect,
    elements.modelIdInput,
    elements.modelPathInput,
    elements.modelLibInput,
    elements.aiTemperatureInput,
    elements.aiMaxTokensInput,
    elements.aiSeedInput,
    elements.aiFallbackCheckbox,
  ];

  for (const element of settingInputs) {
    element.addEventListener("change", async () => {
      readSettingsFromControls();
      markAiConfigDirty();
      await persistSettings();
      renderAiPanel();
      if (element === elements.viewSelect && runtimeState.bridgeModule) {
        await refreshView();
      }
    });
  }

  elements.newMatchButton.addEventListener("click", async () => {
    runtimeState.autoRunning = false;
    try {
      await newMatch();
    } catch (error) {
      setStatus(formatError(error), "error");
    }
  });

  elements.nextMoveButton.addEventListener("click", async () => {
    runtimeState.autoRunning = false;
    try {
      await stepGame();
    } catch (error) {
      setStatus(formatError(error), "error");
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

  elements.clearAiCacheButton.addEventListener("click", async () => {
    try {
      await clearAiCache();
    } catch (error) {
      setStatus(formatError(error), "error");
    }
  });

  elements.resetMetricsButton.addEventListener("click", async () => {
    try {
      await resetMetrics();
    } catch (error) {
      setStatus(formatError(error), "error");
    }
  });
}

async function hydratePersistentState() {
  runtimeState.db = await openSandboxDB();
  const persisted = await loadPersistedState(runtimeState.db);
  runtimeState.settings = { ...DEFAULT_SETTINGS, ...persisted.settings };
  runtimeState.metrics = { ...DEFAULT_METRICS, ...persisted.metrics };
  runtimeState.session = { ...DEFAULT_SESSION, ...persisted.session };
  applySettingsToControls();
  renderAiPanel();
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
