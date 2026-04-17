const state = {
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
  refreshJobsButton: document.querySelector("#refresh-jobs-button"),
  refreshFilesButton: document.querySelector("#refresh-files-button"),
  jobList: document.querySelector("#job-list"),
  jobLogTitle: document.querySelector("#job-log-title"),
  jobLogMeta: document.querySelector("#job-log-meta"),
  jobLogOutput: document.querySelector("#job-log-output"),
  fileSummaryGrid: document.querySelector("#file-summary-grid"),
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

function readJobPayload() {
  return {
    max_scenarios: Number.parseInt(elements.sampleCountInput.value, 10) || 10,
    seed: Number.parseInt(elements.seedInput.value, 10) || 7,
    model: elements.modelInput.value.trim() || "gemma4:latest",
    timeout: Number.parseFloat(elements.timeoutInput.value) || 180,
  };
}

function formatTimestamp(value) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
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
          <span class="job-subline">${formatTimestamp(job.started_at)}</span>
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

function renderFileSummaries() {
  if (!state.files.length) {
    elements.fileSummaryGrid.innerHTML = `<p class="empty-state">No JSONL files found yet.</p>`;
    elements.fileSelect.innerHTML = "";
    return;
  }

  elements.fileSummaryGrid.innerHTML = state.files
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

  elements.fileSummaryGrid.querySelectorAll("[data-file-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedFileId = button.dataset.fileId;
      state.currentOffset = 0;
      state.selectedRow = null;
      renderFileSummaries();
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
  renderFileSummaries();
  await loadRows();
}

function reviewLabel(review) {
  if (!review) {
    return "Unreviewed";
  }
  return review.decision.charAt(0).toUpperCase() + review.decision.slice(1);
}

function renderRowDetail() {
  if (!state.selectedRow) {
    elements.detailTitle.textContent = "Row Detail";
    elements.detailReviewStatus.textContent = "Unreviewed";
    elements.detailReviewStatus.className = "review-pill";
    elements.reviewNotes.value = "";
    elements.rowDetail.textContent = "Select a row to inspect the saved JSON.";
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

  const lookup = new Map(items.map((item) => [item.source_ref, { ...item, file_id: state.selectedFileId }]));
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
  elements.refreshJobsButton.addEventListener("click", () => void loadJobs());
  elements.refreshFilesButton.addEventListener("click", () => void loadFiles());
  elements.fileSelect.addEventListener("change", () => {
    state.selectedFileId = elements.fileSelect.value;
    state.currentOffset = 0;
    state.selectedRow = null;
    renderFileSummaries();
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
    setStatus("Backend connected. Loading jobs and saved files.", "ready");
    await loadJobs();
    await loadFiles();
  } catch (error) {
    console.error(error);
    setStatus(String(error), "error");
  }
}

main();
