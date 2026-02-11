# Model Selection Logic

Kiro Assistant always launches `kiro-cli` with a single model per prompt. The selection order is simple:

1. Whatever you pick in Settings → Default Model (stored at `~/Library/Application Support/kiro-assistant/assistant-settings.json`).
2. If nothing has been set yet, the built-in fallback `claude-opus-4.5` is used.

The model is resolved immediately before every prompt (even `/continue`), so changing the dropdown affects the very next run. No environment variables are consulted. When a prompt starts, the runner emits a small “Model: …” system message so you can see exactly which model handled that response. Tool outputs are collapsed by default so you can focus on the final assistant transcript.

> **Limitation:** `kiro-cli` stores resume metadata per working directory. If you change the default model in the middle of a task, the current session keeps using the original model until you create a **new task** (which provisions a new workspace) and run the next prompt there. Plan your work accordingly.
