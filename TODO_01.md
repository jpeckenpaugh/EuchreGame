This instructional write-up is designed for a developer or a coding agent to integrate the **Gemma 4 2B IT (LiteRT/WebGPU)** model into your existing `EuchreGameHtml` sandbox.

The goal is to transition from **Random Moves** $\rightarrow$ **AI-Driven Moves** to establish a performance baseline (The Smoke Test).

***

# Integration Guide: Gemma 4 AI Baseline Smoke Test

## 1. Objective
Replace the `random.choice()` logic in the `GameBridge` with an inference call to a local Gemma 4 2B IT model running via WebGPU. We will measure the **Move Validity Rate**: the percentage of turns where the AI produces valid JSON containing a legal game move.

## 2. Technical Stack
- **Engine:** `EuchreGame` (Python/Pyodide)
- **Inference:** `WebLLM` (JavaScript library for running LiteRT/WebGPU models)
- **Model:** `Gemma-4-2B-IT-INT4`
- **Communication:** JS $\leftrightarrow$ Pyodide Bridge

---

## 3. Implementation Steps

### Phase 1: Infrastructure Setup
Add the WebLLM library to your `index.html` to enable GPU-accelerated inference.

1.  **Add Script Tag:**
    ```html
    <script type="module">
      import * as webllm from "https://esm.run/@mlc-ai/web-llm";
      window.webllm = webllm;
    </script>
    ```
2.  **Initialize Model:** In `main.js`, create an async function to load the model into VRAM during the Pyodide bootstrapping phase.
    - **Model ID:** Use the official Gemma 4 2B IT INT4 identifier.
    - **UI Update:** Update the `status-pill` to show "Loading AI Brain..." until `engine.load()` resolves.

### Phase 2: The "Compact State" Serializer
To maximize the IT model's accuracy, we must avoid verbose text. Add a method to `game_bridge.py` to convert the game state into a token-efficient shorthand.

**Implement `format_for_llm(self)` in `GameBridge`:**
- **Trump:** `T:[S/H/D/C]`
- **Active Player:** `P:[0-3]`
- **Lead Card:** `L:[Rank][Suit]` (e.g., `L:SK`)
- **Hand:** `H:[Card,Card...]`
- **Legal Moves:** `Leg:[Move,Move...]`

**Example Output:**
`T:H | P:1 | L:SK | H:[HJ,HQ,DA,S10,C2] | Leg:[S10]`

### Phase 3: The Inference Loop (The Bridge)
Modify the interaction flow in `main.js` to handle the asynchronous nature of LLM inference.

**Current Flow:** `JS Click` $\rightarrow$ `Python step_random()` $\rightarrow$ `JS Update`
**New Flow:** 
1.  **JS:** Call `BRIDGE.get_snapshot()` $\rightarrow$ Extract `visible_state`.
2.  **JS:** Construct the **Instruction Prompt** using the Chat Template:
    - `<start_of_turn>user\nYou are a Euchre AI. Respond ONLY with JSON. Format: {"move": "CARD", "reason": "..."}\nState: [Compact State]\nMove:<end_of_turn>\n<start_of_turn>model\n`
3.  **JS:** Call `webllm.engine.chat.completions.create()` $\rightarrow$ Receive response.
4.  **JS:** Send the resulting `move` string back to Python via `call_from_js("apply_move", payload)`.

### Phase 4: The Smoke Test Metrics
Create a `BaselineTracker` object in `main.js` to capture the accuracy data in real-time.

**Metrics to track:**
- `total_turns`: Total attempts by the AI.
- `valid_json_count`: Number of times the model returned a parseable JSON object.
- `legal_move_count`: Number of times the move was accepted by `game.apply_move()` without an `IllegalMoveError`.

**The "Fallback" Logic:**
If the AI fails (Invalid JSON or Illegal Move), the system must:
1.  Log the failure.
2.  Call `BRIDGE.step_random()` to ensure the game doesn't freeze.
3.  Continue the simulation.

---

## 4. Testing Protocol (The "Smoke Test")

To obtain a statistically valid baseline, run the following experiment:

1.  **Set-up:** Initialize a new match with a fixed seed.
2.  **Execution:** Enable "Auto Play" at "Fast" speed.
3.  **Observation:** Let the game run for 10 complete hands.
4.  **Analysis:** Calculate the **Baseline Success Rate**:
    $$\text{Success Rate} = \frac{\text{legal\_move\_count}}{\text{total\_turns}} \times 100$$

## 5. Success Criteria
The PoC is considered a success if:
- [ ] The model loads in the browser via WebGPU without crashing the tab.
- [ ] The model consistently recognizes the `Leg` (Legal Moves) list.
- [ ] The JSON output is stable enough to be parsed in $>70\%$ of turns.
- [ ] The `internal_monologue` (reasoning) shows an understanding of the current trump suit.

***

### Developer Note: Memory Management
The **Gemma 4 2B IT** model will occupy $\sim 1.5\text{ GB}$ of VRAM. If the browser tab crashes, ensure that `God View` is turned off (to reduce DOM overhead) and that no other GPU-heavy applications are running.
