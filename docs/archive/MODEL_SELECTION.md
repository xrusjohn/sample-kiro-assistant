# Model Selection

Kiro Assistant launches `kiro-cli` with a single model per prompt. The selection order is:

1. Whatever you pick in **Settings → Default Model** (stored at `~/.kiro-assistant/assistant-settings.json`)
2. If nothing has been set yet, the built-in fallback `claude-sonnet-4.5` is used

The model is resolved immediately before every prompt, so changing the dropdown affects the very next run.

> **Limitation:** `kiro-cli` stores resume metadata per working directory. If you change the default model in the middle of a task, the current session keeps using the original model until you create a **new task** (which provisions a new workspace).

## Available Models

| Model ID | Notes |
|----------|-------|
| `claude-opus-4.6` | Experimental |
| `claude-opus-4.6-1m` | Experimental, 1M context |
| `claude-opus-4.5` | |
| `claude-sonnet-4.5` | **Default** |
| `claude-sonnet-4.5-1m` | 1M context |
| `claude-sonnet-4` | |
| `claude-haiku-4.5` | Fast, lightweight |

Coming soon (Amazon Bedrock): `deepseek-3.2`, `kimi-k2.5`, `minimax-m2.1`, `glm-4.7`, `qwen3-coder-next`

## Settings File

```
~/.kiro-assistant/assistant-settings.json
```

```json
{
  "defaultModel": "claude-sonnet-4.5"
}
```

This file is managed by the Settings UI. You can also edit it directly — changes take effect on the next prompt.

## API

```
GET  /api/model-settings   → { models: [...], defaultModel: "claude-sonnet-4.5" }
POST /api/set-default-model → { model: "claude-opus-4.5" }
```
