---
inclusion: always
---

# AI boundaries

## The rule

The model never computes, rounds, converts or edits a numeric value. Numbers come from the parser and the deterministic engine only. The model explains and proposes.

## What the model may do

- Explain a macro in plain English, given the parsed macro text and its step list.
- Suggest what an unknown opcode or @function might be, with a rationale and a confidence label.

## What the model may not do

- Produce, change or "fix" any cell value, cached value, formula result or tolerance.
- Decide that a cell is matched.
- Write to the workbook or the provenance report directly.
- Execute macros.

## Approval queue

- Every suggestion becomes a queue item: input, suggestion, rationale, status (pending, approved, rejected), reviewer action and time.
- Nothing from the model takes effect until a human approves it. Approved suggestions are recorded in the provenance report as human-approved, with the model's name.
- Unknown opcodes route to the queue and stay `unverifiable` until approved. Even after approval, a cell is only `matched` if the engine reproduces the cached value.
- Rejected or pending items leave the cell `unverifiable`.

## Where the model runs

- Local Ollama through the OpenAI-compatible API at `http://localhost:11434/v1`, or a recorded fixture replayed for tests and demos.
- Never a paid API. No remote endpoints. No API keys in the repo.
- Send the minimum: the macro text or opcode bytes, not whole files or unrelated cell values.
- If Ollama is unreachable, degrade gracefully: show the deterministic step list without prose and say the explanation is unavailable.

## Testing

- Tests use recorded fixtures, never a live model.
- A test asserts that no value in the output workbook changes as a result of any model response.
