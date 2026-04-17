export const DEFAULT_SETTINGS = {
  selectedView: "god",
  autoSpeed: "700",
  playMode: "random",
  winningScore: 10,
  aiModelId: "Gemma-4-2B-IT-INT4-Local",
  aiModelPath: "./vendor/models/gemma-4-2b-it-int4/",
  aiModelLib: "./vendor/model-libs/gemma-4-2b-it-int4-webgpu.wasm",
  aiUseIndexedDBCache: true,
  aiTemperature: 0.2,
  aiMaxTokens: 96,
  aiSeed: "",
  aiAutoFallback: true,
};

export const DEFAULT_METRICS = {
  total_turns: 0,
  valid_json_count: 0,
  legal_move_count: 0,
  fallback_count: 0,
  invalid_json_count: 0,
  illegal_move_count: 0,
  engine_error_count: 0,
  updated_at: null,
};

export const DEFAULT_SESSION = {
  last_summary: null,
  last_logs: [],
  ai_status: "AI idle.",
  ai_cache_status: "Cache status unknown.",
  storage_status: "Persistent storage not requested yet.",
  model_cache: null,
  updated_at: null,
};

const DB_NAME = "euchre-browser-sandbox";
const DB_VERSION = 1;
const STORE_SETTINGS = "settings";
const STORE_METRICS = "metrics";
const STORE_SESSION = "session";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function openSandboxDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_METRICS)) {
        db.createObjectStore(STORE_METRICS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        db.createObjectStore(STORE_SESSION, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readRecord(db, storeName, id, fallback) {
  const transaction = db.transaction(storeName, "readonly");
  const store = transaction.objectStore(storeName);
  const result = await transactionPromise(store.get(id));
  if (!result) {
    return clone(fallback);
  }
  const merged = { ...clone(fallback), ...result };
  delete merged.id;
  return merged;
}

export async function writeRecord(db, storeName, id, value) {
  const transaction = db.transaction(storeName, "readwrite");
  const store = transaction.objectStore(storeName);
  await transactionPromise(store.put({ id, ...clone(value) }));
}

export async function loadPersistedState(db) {
  const [settings, metrics, session] = await Promise.all([
    readRecord(db, STORE_SETTINGS, "app", DEFAULT_SETTINGS),
    readRecord(db, STORE_METRICS, "baseline", DEFAULT_METRICS),
    readRecord(db, STORE_SESSION, "latest", DEFAULT_SESSION),
  ]);

  return { settings, metrics, session };
}

export async function saveSettings(db, settings) {
  const payload = { ...settings, updated_at: new Date().toISOString() };
  await writeRecord(db, STORE_SETTINGS, "app", payload);
}

export async function saveMetrics(db, metrics) {
  const payload = { ...metrics, updated_at: new Date().toISOString() };
  await writeRecord(db, STORE_METRICS, "baseline", payload);
}

export async function saveSession(db, session) {
  const payload = { ...session, updated_at: new Date().toISOString() };
  await writeRecord(db, STORE_SESSION, "latest", payload);
}

