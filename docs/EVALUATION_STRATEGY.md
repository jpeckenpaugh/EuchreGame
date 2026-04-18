# Evaluation Strategy

## Purpose

This note captures discussion points around how to evaluate model quality for `EuchreGame`
distillation work. It is intentionally exploratory. The goal is to record candidate scoring
ideas, tradeoffs, and terminology before locking into a formal benchmark harness or execution
plan.

## Why This Matters

The current data factory can already measure whether a generated move is:

- parseable
- legal
- accepted into the gold dataset

Those are necessary checks, but they are not enough to establish playing strength. A model can
produce legal moves while still being strategically weak, brittle, or exploitable.

The broader evaluation problem is therefore:

- how to measure whether a move is merely valid
- how to measure whether a move is strategically strong
- how to measure whether a full model is competitive over many games

## Deterministic And Non-Deterministic Evaluation

One of the main open questions is how much of the evaluation stack should be deterministic.

Deterministic evaluation has clear benefits:

- reproducible comparisons across model versions
- stable regression testing
- easier diagnosis when a score changes
- lower variance when comparing small improvements

A deterministic evaluation stack would likely use:

- fixed deal sets
- fixed seat rotations
- fixed partner rotations
- frozen opponent policies
- temperature `0` or other constrained inference settings

Non-deterministic evaluation also has value:

- tests robustness rather than just replay performance
- exposes instability from sampling
- may better reflect real-world deployment conditions

A likely long-term approach is:

- deterministic evaluation for scorekeeping and comparisons
- non-deterministic evaluation for robustness and stress testing

## Benchmark Family 1: Model Versus Random Play

One simple benchmark idea is to measure how a model performs against randomized players.

Example framing:

- seat four players in a normal Euchre hand
- let three players choose random legal actions
- let the evaluated model control the fourth player
- measure win rate, point differential, trick differential, and contract outcomes

Why this is attractive:

- simple
- objective
- cheap to run at scale
- easy to explain
- useful as a competence floor

Why this is limited:

- human players do not play randomly
- weak policies may still beat random opponents reliably
- the benchmark may saturate quickly once the model reaches basic competence

Discussion point:

- beating random play is likely a good sanity check, but not a sufficient definition of quality

## Benchmark Family 2: Model Versus Scripted Or Heuristic Players

Another idea is to benchmark against established computer-player policies with different
difficulty levels such as low, medium, and high.

Potential advantages:

- more realistic than random play
- repeatable and stable
- easier to construct a ladder of difficulty
- useful for tracking practical game-playing strength

Potential risks:

- overfitting to specific heuristic quirks
- learning opponent-specific patterns rather than general Euchre skill
- false confidence if the heuristic players are themselves weak or narrow

Discussion point:

- this may be the most useful near-term benchmark family, as long as multiple heuristic
  policies or styles are eventually included

## Benchmark Family 3: Model Versus Model

A third idea is direct head-to-head evaluation between learned models.

Examples:

- smaller distilled model versus larger teacher-like model
- current checkpoint versus previous checkpoint
- student model versus alternate student model trained on different data

Why this is compelling:

- directly measures relative playing strength
- supports a long-term goal such as getting a `2B` model closer to an `8B` model
- naturally fits iterative model improvement

Risks and caveats:

- results are relative, not absolute
- shared blind spots can hide genuine weaknesses
- evaluation can become noisy if seats, partners, and deals are not carefully controlled

Discussion point:

- model-vs-model evaluation likely becomes more valuable after baseline random and heuristic
  benchmarks are already in place

## Partnership-Game Evaluation Complications

Euchre is a partnership game, which makes evaluation design more subtle than in a pure
single-agent setting.

Raw win rate can accidentally reflect:

- partner quality
- seat position effects
- deal variance
- interaction quirks between two policies

Reasonable discussion principles for fair evaluation:

- rotate seats
- rotate partnerships
- reuse the same deal sets when comparing models
- compare point differential as well as win rate
- run enough hands to reduce variance

Discussion point:

- the benchmark harness should probably compare models under mirrored seat and partner
  assignments, not just a single fixed role

## Quality Of A Single Decision

A separate but related question is how to measure the quality of one move in a specific state.

The simplest current label is:

- legal versus illegal

That is useful for filtering, but it does not tell us whether the chosen move is good.

Possible stronger labels for a single decision:

- whether the move is optimal among legal moves
- how much worse it is than the best legal move
- where it ranks among legal moves
- whether it preserves favorable downstream outcomes

This leads to a more mathematical discussion around exact-state evaluation and backward
induction.

## Perfect-Information Quality

For a fully dealt hand, the evaluator can know all four hands and the exact game state.

In that setting, the remaining hand can be viewed as a finite game tree:

- current state
- legal actions
- successor states
- terminal utility at the end of the hand

Discussion idea:

- solve the remainder of the hand by walking forward over all legal continuations and then
  backing up values from terminal states

This suggests a value function like:

- `Q(state, action)` for the value of a legal action
- `V(state)` for the best achievable value at a state

Possible outputs for each legal move:

- expected point differential
- trick differential
- maker success versus euchre outcome
- rank among legal moves
- regret relative to the best move

Discussion point:

- "number of positive downstream branches" is intuitive, but expected utility is probably a
  stronger metric than simply counting favorable continuations

## Imperfect-Information Quality

The training problem is not actually perfect-information play. The acting player only sees a
masked state.

That creates a distinction between:

- the best move given the true full deal
- the best move given only legally visible information

This suggests an information-set quality concept:

- average the value of an action over all hidden-card assignments consistent with the visible
  state

Possible approach in principle:

- enumerate or sample hidden-state completions consistent with the masked observation
- solve each resulting fully dealt state
- aggregate the action values

Discussion point:

- this is likely closer to the true learning objective for the distilled model than
  perfect-information labels alone

## Candidate Quality Metrics

Possible metrics worth tracking for individual decisions or datasets include:

- legal move rate
- parse-valid rate
- oracle top-1 rate
- mean regret relative to the best legal action
- median regret
- move-rank percentile
- contract success contribution
- point differential contribution

Possible model-level metrics include:

- game win rate
- hand win rate
- point differential
- trick differential
- maker success rate
- defense / euchre rate
- latency
- invalid-output rate

Discussion point:

- a useful future model report card may need both decision-level metrics and game-level metrics

## Relative Roles Of The Three Benchmark Families

A practical framing is that the three benchmark families are complementary rather than
competitive.

Possible roles:

- random opponents: sanity check and competence floor
- heuristic opponents: practical strength benchmark
- model-vs-model: long-term capability comparison

Discussion point:

- no single benchmark family should probably be treated as the sole definition of quality

## Current Working Intuition

At this stage, a reasonable working intuition is:

- legality tells us whether a model can operate inside the engine
- benchmark win rates tell us whether it can compete
- exact-state or information-set quality metrics tell us whether its decisions are strong

That combination is likely more informative than any single metric alone.

## Open Questions

- What should the canonical terminal utility be for backward evaluation: points, tricks,
  contract outcome, or match win probability?
- Should the first benchmark harness prioritize deterministic scorekeeping or robustness under
  stochastic inference?
- What mix of random, heuristic, and model opponents best avoids overfitting?
- How many hands are needed for stable comparative results?
- How should seat and partner rotations be structured for fair evaluation?
- How tractable is full backward solving for partially played Euchre hands in practice?
- Should future distillation targets be hard labels only, or richer labels such as regret or
  action rankings?

## Non-Goals For This Note

This note does not yet define:

- a final benchmark harness
- a final metric suite
- an implementation plan
- a release gate for future model versions

It is a discussion artifact meant to preserve evaluation ideas and tradeoffs before those
choices are finalized.
