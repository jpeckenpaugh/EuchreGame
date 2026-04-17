# Data Factory TODO

This checklist is the implementation plan for standing up the local synthetic-data pipeline on this AMD Windows machine.

## Phase 0: Environment Bring-Up

- [x] Confirm native `Ollama` runs locally on Windows and responds at `http://localhost:11434`
- [ ] Confirm the AMD driver and Ollama configuration can use GPU acceleration on this machine
- [x] Choose the exact teacher model name/tag to use for the first pass
- [x] Pull or register the teacher model in Ollama
- [x] Create a Python module layout under `factory/` for scenario generation, trajectory generation, and filtering
- [x] Decide where generated artifacts will live
- [x] Add ignored output folders for local JSONL artifacts if needed

## Phase 1: Scenario Generation

- [x] Create `factory/gen_scenarios.py`
- [x] Generate masked-state snapshots from the acting player at each turn
- [x] Include stable identifiers such as `session_id`, `hand_id`, and `turn_id`
- [x] Store legal moves with each scenario so later validation is easy to inspect
- [x] Write newline-delimited JSON output to `factory/output/scenarios.jsonl`
- [x] Add CLI arguments for seed count, max scenarios, and output path
- [x] Add a tiny smoke mode that emits only `1` scenario
- [x] Add a small test mode that emits only `10` scenarios

## Phase 2: Compact State Serialization

- [x] Create a helper that converts a masked state into the compact prompt string
- [ ] Standardize card formatting and move-token formatting
- [x] Ensure the serializer includes trump, acting player, lead card, hand, and legal moves
- [ ] Verify the serializer is deterministic for the same state
- [ ] Add a few fixture-style checks for expected compact output

## Phase 3: Teacher Prompting via Ollama

- [x] Create `factory/generate_trajectories.py`
- [x] Implement the strict system prompt described in `DATA_FACTORY.md`
- [x] Format requests so the model returns JSON only
- [x] Add Ollama API retry handling for timeouts and transient failures
- [x] Parse the model response into normalized `reasoning` and `move` fields
- [x] Write newline-delimited JSON output to `factory/output/raw_responses.jsonl`
- [x] Record latency, failures, and parse errors for each sample

## Phase 4: Validation and Gold Filtering

- [x] Create `factory/filter_gold_data.py`
- [x] Rebuild the game state from each saved scenario
- [x] Verify the proposed move is present in the legal move list for that state
- [x] Save legal rows to `factory/output/gold_dataset.jsonl`
- [x] Save rejected rows to a separate failure log for later analysis
- [x] Report legal rate, illegal rate, and parse-failure rate

## Phase 5: First Local Smoke Tests

- [x] Run scenario generation for `1` scenario
- [x] Run trajectory generation for `1` scenario
- [x] Run validation for `1` response
- [x] Inspect the raw response manually for formatting and move quality
- [x] Confirm the first sample survives filtering into the gold dataset
- [x] Repeat the full pipeline for `10` scenarios/responses
- [x] Confirm the scripts can complete this small batch reliably on the local machine

## Phase 6: Hardening

- [ ] Add structured logging across all scripts
- [ ] Add resumable processing so long runs can restart cleanly
- [ ] Add batching controls for throughput experiments
- [ ] Add configurable output paths and run manifests
- [ ] Add summary stats at the end of every run
- [ ] Add basic tests for serializer, parser, and validator behavior

## Phase 7: Scale-Up Readiness

- [ ] Benchmark throughput for `10`, `100`, and `1000` scenario batches
- [ ] Estimate time and disk usage for `100,000` scenarios
- [ ] Estimate time and acceptance rate for `50,000` gold samples
- [ ] Decide whether the chosen teacher model is fast enough on this machine
- [ ] Tune prompt shape, batch size, and retry strategy based on early results
- [ ] Freeze the dataset schema before large production runs

## First Execution Goal

- [x] Produce `1` end-to-end validated sample locally
- [x] Produce `10` end-to-end responses locally
- [x] Review quality before scaling further
