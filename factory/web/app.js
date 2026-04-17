const state = {
  runs: [],
  selectedRunId: null,
  selectedRunDetail: null,
  selectedGameId: null,
  selectedGameDetail: null,
  selectedFailureId: null,
  jobs: [],
  selectedJobId: null,
  files: [],
  selectedFileId: null,
  selectedRow: null,
  currentOffset: 0,
  currentLimit: 20,
};

const elements = {
  statusPill: document.querySelector("#status-pill"),
  statusText: document.querySelector("#status-text"),
  sampleCountInput: document.querySelector("#sample-count-input"),
  seedInput: document.querySelector("#seed-input"),
  modelInput: document.querySelector("#model-input"),
  timeoutInput: document.querySelector("#timeout-input"),
  runOneButton: document.querySelector("#run-one-button"),
  runTenButton: document.querySelector("#run-ten-button"),
  startJobButton: document.querySelector("#start-job-button"),
  refreshRunsButton: document.querySelector("#refresh-runs-button"),
  runList: document.querySelector("#run-list"),
  runTitle: document.querySelector("#run-title"),
  runStatusPill: document.querySelector("#run-status-pill"),
  metricAccepted: document.querySelector("#metric-accepted"),
  metricRpm: document.querySelector("#metric-rpm"),
  metricLatency: document.querySelector("#metric-latency"),
  metricParseRate: document.querySelector("#metric-parse-rate"),
  metricGames: document.querySelector("#metric-games"),
  metricFailures: document.querySelector("#metric-failures"),
  backendList: document.querySelector("#backend-list"),
  failureCounts: document.querySelector("#failure-counts"),
  failureList: document.querySelector("#failure-list"),
  gameList: document.querySelector("#game-list"),
  turnListTitle: document.querySelector("#turn-list-title"),
  turnList: document.querySelector("#turn-list"),
  inspectorTitle: document.querySelector("#inspector-title"),
  inspectorOutput: document.querySelector("#inspector-output"),
  refreshJobsButton: document.querySelector("#refresh-jobs-button"),
  jobList: document.querySelector("#job-list"),
  jobLogTitle: document.querySelector("#job-log-title"),
  jobLogMeta: document.querySelector("#job-log-meta"),
  jobLogOutput: document.querySelector("#job-log-output"),
  refreshFilesButton: document.querySelector("#refresh-files-button"),
  artifactList: document.querySelector("#artifact-list"),
  fileSelect: document.querySelector("#file-select"),
  pageSizeSelect: document.querySelector("#page-size-select"),
  prevPageButton: document.querySelector("#prev-page-button"),
  nextPageButton: document.querySelector("#next-page-button"),
  rowList: document.querySelector("#row-list"),
  detailTitle: document.querySelector("#detail-title"),
  detailReviewStatus: document.querySelector("#detail-review-status"),
  reviewNotes: document.querySelector("#review-notes"),
  approveButton: document.querySelector("#approve-button"),
  flagButton: document.querySelector("#flag-button"),
  rejectButton: document.querySelector("#reject-button"),
  rowDetail: document.querySelector("#row-detail"),
};

function setStatus(message, tone = "loading") {
  elements.statusText.textContent = message;
  elements.statusPill.className = `status-pill status-${tone}`;
  elements.statusPill.textContent =
    tone === "ready" ? "Ready" : tone === "error" ? "Error" : "Working";
}

async function apiFetch(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${detail}`);
  }
  return response.json();
}

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }
  return Number(value).toFixed(digits);
}

function readJobPayload() {
  return {
    max_scenarios: Number.parseInt(elements.sampleCountInput.value, 10) || 10,
    seed: Number.parseInt(elements.seedInput.value, 10) || 7,
    model: elements.modelInput.value.trim() || "gemma4:latest",
    timeout: Number.parseFloat(elements.timeoutInput.value) || 180,
  };
}

function reviewLabel(review) {
  if (!review) {
    return "Unreviewed";
  }
  return review.decision.charAt(0).toUpperCase() + review.decision.slice(1);
}

function pickFailureTone(failure) {
  if (failure?.transport_error) {
    return "reject";
  }
  if (String(failure?.failure_bucket || "").startsWith("invalid_json")) {
    return "flag";
  }
  return "none";
}

function renderRuns() {
  if (!state.runs.length) {
    elements.runList.innerHTML = `<p class="empty-state">No tracked runs yet.</p>`;
    return;
  }

  elements.runList.innerHTML = state.runs
    .map((run) => {
      const activeClass = run.run_id === state.selectedRunId ? "is-active" : "";
      return `
        <button class="run-card ${activeClass}" data-run-id="${run.run_id}">
          <div class="job-card-top">
            <strong>${run.run_id}</strong>
            <span class="job-status job-status-${run.status}">${run.status}</span>
          </div>
          <span class="job-subline">${run.mode} • ${run.game_count ?? 0} games</span>
          <span class="job-subline">${run.accepted_gold_rows ?? 0}/${run.attempted_responses ?? 0} accepted</span>
          <span class="job-subline">${formatTimestamp(run.started_at || run.created_at)}</span>
        </button>
      `;
    })
    .join("");

  elements.runList.querySelectorAll("[data-run-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedRunId = button.dataset.runId;
      state.selectedGameId = null;
      state.selectedGameDetail = null;
      state.selectedFailureId = null;
      renderRuns();
      void loadRunDetail();
    });
  });
}

function renderRunSummary() {
  const detail = state.selectedRunDetail;
  if (!detail) {
    elements.runTitle.textContent = "Select a run";
    elements.runStatusPill.textContent = "Idle";
    elements.runStatusPill.className = "status-pill review-none";
    elements.metricAccepted.textContent = "-";
    elements.metricRpm.textContent = "-";
    elements.metricLatency.textContent = "-";
    elements.metricParseRate.textContent = "-";
    elements.metricGames.textContent = "-";
    elements.metricFailures.textContent = "-";
    elements.backendList.innerHTML = `<p class="empty-state">Choose a run to see backend stats.</p>`;
    elements.failureCounts.innerHTML = "";
    elements.failureList.innerHTML = `<p class="empty-state">No failure data loaded.</p>`;
    elements.gameList.innerHTML = `<p class="empty-state">No games loaded.</p>`;
    elements.turnListTitle.textContent = "Game Detail";
    elements.turnList.innerHTML = `<p class="empty-state">Choose a game to inspect turns.</p>`;
    return;
  }

  const run = detail.run;
  const metrics = detail.metrics || {};
  const failures = detail.failures || { items: [], counts: {}, total: 0 };
  elements.runTitle.textContent = run.run_id;
  elements.runStatusPill.textContent = run.status;
  elements.runStatusPill.className = `status-pill job-status-${run.status}`;
  elements.metricAccepted.textContent = `${metrics.accepted_gold_rows ?? 0} / ${metrics.attempted_responses ?? 0}`;
  elements.metricRpm.textContent = formatNumber(metrics.responses_per_minute);
  elements.metricLatency.textContent =
    metrics.avg_latency_ms === null || metrics.avg_latency_ms === undefined
      ? "-"
      : `${formatNumber(metrics.avg_latency_ms)} ms`;
  elements.metricParseRate.textContent =
    metrics.parse_failure_rate === null || metrics.parse_failure_rate === undefined
      ? "-"
      : `${formatNumber(metrics.parse_failure_rate)}%`;
  elements.metricGames.textContent = `${detail.games.length}`;
  elements.metricFailures.textContent = `${failures.total ?? 0}`;

  elements.backendList.innerHTML = detail.backends.length
    ? detail.backends
        .map(
          (backend) => `
            <article class="summary-card static-card">
              <span class="summary-title">${backend.name}</span>
              <strong>${backend.accepted_turns}/${backend.attempted_turns} accepted</strong>
              <span class="summary-meta">${backend.model}</span>
              <span class="summary-meta">${backend.api_style} • ${formatNumber(backend.avg_latency_ms)} ms avg</span>
            </article>
          `,
        )
        .join("")
    : `<p class="empty-state">No backend rows recorded for this run.</p>`;

  const failureCountEntries = Object.entries(failures.counts || {});
  elements.failureCounts.innerHTML = failureCountEntries.length
    ? failureCountEntries
        .map(
          ([key, value]) =>
            `<span class="failure-chip">${key.replaceAll("_", " ")}: <strong>${value}</strong></span>`,
        )
        .join("")
    : `<span class="muted-text">No exceptions or rejected turns recorded.</span>`;

  elements.failureList.innerHTML = failures.items?.length
    ? failures.items
        .map((failure) => {
          const activeClass = failure.failure_id === state.selectedFailureId ? "is-active" : "";
          return `
            <button class="row-card ${activeClass}" data-failure-id="${failure.failure_id}">
              <div class="row-card-top">
                <strong>${failure.backend_name || failure.backend_id || "backend"}</strong>
                <span class="review-pill review-${pickFailureTone(failure)}">${failure.phase || "-"}</span>
              </div>
              <span class="row-preview">${failure.failure_bucket || failure.transport_error || "Unknown failure"}</span>
              <span class="summary-meta">${failure.game_id || "-"} • turn ${failure.turn_id ?? "-"}</span>
            </button>
          `;
        })
        .join("")
    : `<p class="empty-state">No exceptions or rejected responses in this run.</p>`;

  elements.failureList.querySelectorAll("[data-failure-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const failure = failures.items.find((item) => item.failure_id === button.dataset.failureId);
      state.selectedFailureId = button.dataset.failureId;
      renderRunSummary();
      setInspector("Failure Detail", failure?.detail || failure || {});
    });
  });

  elements.gameList.innerHTML = detail.games.length
    ? detail.games
        .map((game) => {
          const activeClass = game.game_id === state.selectedGameId ? "is-active" : "";
          return `
            <button class="row-card ${activeClass}" data-game-id="${game.game_id}">
              <div class="row-card-top">
                <strong>${game.game_id}</strong>
                <span class="review-pill review-none">${game.backend_id}</span>
              </div>
              <span class="summary-meta">${game.accepted_turns}/${game.decision_turns} accepted</span>
              <span class="summary-meta">${game.skipped_forced_turns} forced skipped</span>
            </button>
          `;
        })
        .join("")
    : `<p class="empty-state">No games recorded for this run.</p>`;

  elements.gameList.querySelectorAll("[data-game-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedGameId = button.dataset.gameId;
      state.selectedFailureId = null;
      renderRunSummary();
      void loadGameDetail();
    });
  });
}

function setInspector(title, payload) {
  elements.inspectorTitle.textContent = title;
  elements.inspectorOutput.textContent = JSON.stringify(payload, null, 2);
}

function renderGameDetail() {
  const detail = state.selectedGameDetail;
  if (!detail) {
    elements.turnListTitle.textContent = "Game Detail";
    elements.turnList.innerHTML = `<p class="empty-state">Choose a game to inspect turns.</p>`;
    return;
  }

  elements.turnListTitle.textContent = detail.game.game_id;
  elements.turnList.innerHTML = detail.turns.length
    ? detail.turns
        .map(
          (turn) => `
            <button class="row-card" data-turn-index="${turn.turn_index}">
              <div class="row-card-top">
                <strong>Turn ${turn.turn_index}</strong>
                <span class="review-pill review-${turn.accepted ? "approve" : "reject"}">${turn.phase || "-"}</span>
              </div>
              <span class="summary-meta">${turn.output_move || "no move"} • ${turn.legal_move_count} legal</span>
              <span class="row-preview">${turn.reasoning_preview || turn.failure_bucket || turn.compact_state || ""}</span>
            </button>
          `,
        )
        .join("")
    : `<p class="empty-state">No decision turns were saved for this game.</p>`;

  elements.turnList.querySelectorAll("[data-turn-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const turn = detail.turns.find(
        (item) => String(item.turn_index) === String(button.dataset.turnIndex),
      );
      setInspector("Turn Detail", turn?.detail || turn || {});
    });
  });
}

function renderJobs() {
  if (!state.jobs.length) {
    elements.jobList.innerHTML = `<p class="empty-state">No jobs yet.</p>`;
    return;
  }

  elements.jobList.innerHTML = state.jobs
    .map((job) => {
      const activeClass = job.job_id === state.selectedJobId ? "is-active" : "";
      return `
        <button class="job-card ${activeClass}" data-job-id="${job.job_id}">
          <div class="job-card-top">
            <strong>${job.job_id}</strong>
            <span class="job-status job-status-${job.status}">${job.status}</span>
          </div>
          <span class="job-subline">${job.config?.model ?? "-"}</span>
          <span class="job-subline">${job.counts?.gold_rows ?? 0} gold / ${job.counts?.rejected_rows ?? 0} rejected</span>
        </button>
      `;
    })
    .join("");

  elements.jobList.querySelectorAll("[data-job-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedJobId = button.dataset.jobId;
      renderJobs();
      void loadJobDetail();
    });
  });
}

function renderJobDetail(job) {
  elements.jobLogTitle.textContent = `Job ${job.job_id}`;
  elements.jobLogMeta.textContent = `${job.status} • ${job.config?.max_scenarios ?? 0} samples`;
  elements.jobLogOutput.textContent = (job.log_tail || []).join("\n") || "No log output yet.";
}

async function loadJobs() {
  const data = await apiFetch("/api/jobs");
  state.jobs = data.jobs || [];
  if (!state.selectedJobId && state.jobs.length) {
    state.selectedJobId = state.jobs[0].job_id;
  }
  renderJobs();
  await loadJobDetail();
}

async function loadJobDetail() {
  if (!state.selectedJobId) {
    elements.jobLogTitle.textContent = "Job Log";
    elements.jobLogMeta.textContent = "Select a job.";
    elements.jobLogOutput.textContent = "No job selected.";
    return;
  }
  const job = await apiFetch(`/api/jobs/${state.selectedJobId}`);
  renderJobDetail(job);
}

async function loadRuns() {
  const data = await apiFetch("/api/runs");
  state.runs = data.runs || [];
  if (!state.selectedRunId && state.runs.length) {
    state.selectedRunId = state.runs[0].run_id;
  }
  renderRuns();
  await loadRunDetail();
}

async function loadRunDetail() {
  if (!state.selectedRunId) {
    state.selectedRunDetail = null;
    renderRunSummary();
    return;
  }
  state.selectedRunDetail = await apiFetch(`/api/runs/${state.selectedRunId}`);
  renderRunSummary();
  if (!state.selectedGameId && state.selectedRunDetail.games.length) {
    state.selectedGameId = state.selectedRunDetail.games[0].game_id;
  }
  await loadGameDetail();
  setInspector("Run Detail", state.selectedRunDetail);
}

async function loadGameDetail() {
  if (!state.selectedGameId) {
    state.selectedGameDetail = null;
    renderGameDetail();
    return;
  }
  state.selectedGameDetail = await apiFetch(`/api/games/${state.selectedGameId}`);
  renderGameDetail();
}

function renderArtifacts() {
  if (!state.files.length) {
    elements.artifactList.innerHTML = `<p class="empty-state">No JSONL files found yet.</p>`;
    elements.fileSelect.innerHTML = "";
    return;
  }

  elements.artifactList.innerHTML = state.files
    .map(
      (file) => `
        <button class="summary-card ${file.file_id === state.selectedFileId ? "is-active" : ""}" data-file-id="${file.file_id}">
          <span class="summary-title">${file.name}</span>
          <strong>${file.row_count} rows</strong>
          <span class="summary-meta">${file.reviews.reviewed} reviewed</span>
          <span class="summary-meta">${file.file_id}</span>
        </button>
      `,
    )
    .join("");

  elements.fileSelect.innerHTML = state.files
    .map(
      (file) =>
        `<option value="${file.file_id}" ${file.file_id === state.selectedFileId ? "selected" : ""}>${file.file_id}</option>`,
    )
    .join("");

  elements.artifactList.querySelectorAll("[data-file-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedFileId = button.dataset.fileId;
      state.currentOffset = 0;
      state.selectedRow = null;
      renderArtifacts();
      void loadRows();
    });
  });
}

async function loadFiles() {
  const data = await apiFetch("/api/files");
  state.files = data.files || [];
  if (!state.selectedFileId && state.files.length) {
    state.selectedFileId = state.files[0].file_id;
  }
  renderArtifacts();
  await loadRows();
}

function renderRowDetail() {
  if (!state.selectedRow) {
    elements.detailTitle.textContent = "Artifact Row";
    elements.detailReviewStatus.textContent = "Unreviewed";
    elements.detailReviewStatus.className = "review-pill review-none";
    elements.reviewNotes.value = "";
    elements.rowDetail.textContent = "Select an artifact row to inspect the saved JSON.";
    return;
  }

  elements.detailTitle.textContent = `${state.selectedRow.file_id} • row ${state.selectedRow.row_index}`;
  elements.detailReviewStatus.textContent = reviewLabel(state.selectedRow.review);
  elements.detailReviewStatus.className = `review-pill review-${state.selectedRow.review?.decision || "none"}`;
  elements.reviewNotes.value = state.selectedRow.review?.notes || "";
  elements.rowDetail.textContent = JSON.stringify(state.selectedRow.data, null, 2);
}

function renderRows(items, totalRows) {
  if (!items.length) {
    elements.rowList.innerHTML = `<p class="empty-state">No rows on this page.</p>`;
    renderRowDetail();
    return;
  }

  elements.rowList.innerHTML = items
    .map(
      (item) => `
        <button class="row-card ${state.selectedRow?.source_ref === item.source_ref ? "is-active" : ""}" data-source-ref="${item.source_ref}">
          <div class="row-card-top">
            <strong>Row ${item.row_index}</strong>
            <span class="review-pill review-${item.review?.decision || "none"}">${reviewLabel(item.review)}</span>
          </div>
          <span class="row-preview">${item.preview}</span>
        </button>
      `,
    )
    .join("");

  const lookup = new Map(
    items.map((item) => [item.source_ref, { ...item, file_id: state.selectedFileId }]),
  );
  elements.rowList.querySelectorAll("[data-source-ref]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedRow = lookup.get(button.dataset.sourceRef);
      renderRows(items, totalRows);
      renderRowDetail();
    });
  });

  elements.prevPageButton.disabled = state.currentOffset <= 0;
  elements.nextPageButton.disabled = state.currentOffset + state.currentLimit >= totalRows;
  renderRowDetail();
}

async function loadRows() {
  if (!state.selectedFileId) {
    elements.rowList.innerHTML = `<p class="empty-state">Select a file to browse.</p>`;
    renderRowDetail();
    return;
  }

  const data = await apiFetch(
    `/api/files/${state.selectedFileId}/rows?offset=${state.currentOffset}&limit=${state.currentLimit}`,
  );
  renderRows(data.items || [], data.total_rows || 0);
}

async function saveReview(decision) {
  if (!state.selectedRow) {
    return;
  }

  await apiFetch("/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_id: state.selectedFileId,
      row_index: state.selectedRow.row_index,
      decision,
      notes: elements.reviewNotes.value,
    }),
  });

  setStatus(`Saved ${decision} review for row ${state.selectedRow.row_index}.`, "ready");
  await loadFiles();
}

async function startJob(overrides = {}) {
  const payload = { ...readJobPayload(), ...overrides };
  setStatus(`Starting job for ${payload.max_scenarios} samples.`, "loading");
  const result = await apiFetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  state.selectedJobId = result.job_id;
  await loadJobs();
  setStatus(`Job ${result.job_id} started.`, "ready");
}

function bindEvents() {
  elements.refreshRunsButton.addEventListener("click", () => void loadRuns());
  elements.refreshJobsButton.addEventListener("click", () => void loadJobs());
  elements.refreshFilesButton.addEventListener("click", () => void loadFiles());
  elements.fileSelect.addEventListener("change", () => {
    state.selectedFileId = elements.fileSelect.value;
    state.currentOffset = 0;
    state.selectedRow = null;
    renderArtifacts();
    void loadRows();
  });
  elements.pageSizeSelect.addEventListener("change", () => {
    state.currentLimit = Number.parseInt(elements.pageSizeSelect.value, 10) || 20;
    state.currentOffset = 0;
    void loadRows();
  });
  elements.prevPageButton.addEventListener("click", () => {
    state.currentOffset = Math.max(0, state.currentOffset - state.currentLimit);
    state.selectedRow = null;
    void loadRows();
  });
  elements.nextPageButton.addEventListener("click", () => {
    state.currentOffset += state.currentLimit;
    state.selectedRow = null;
    void loadRows();
  });
  elements.runOneButton.addEventListener("click", () => void startJob({ max_scenarios: 1 }));
  elements.runTenButton.addEventListener("click", () => void startJob({ max_scenarios: 10 }));
  elements.startJobButton.addEventListener("click", () => void startJob());
  elements.approveButton.addEventListener("click", () => void saveReview("approve"));
  elements.flagButton.addEventListener("click", () => void saveReview("flag"));
  elements.rejectButton.addEventListener("click", () => void saveReview("reject"));
}

async function main() {
  bindEvents();
  try {
    await apiFetch("/api/health");
    setStatus("Backend connected. Loading runs, jobs, and artifacts.", "ready");
    await Promise.all([loadRuns(), loadJobs(), loadFiles()]);
  } catch (error) {
    console.error(error);
    setStatus(String(error), "error");
  }
}

main();
