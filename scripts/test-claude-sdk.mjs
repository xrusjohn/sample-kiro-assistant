#!/usr/bin/env node
/**
 * Quick standalone test of the Claude Agent SDK.
 * Run: node scripts/test-claude-sdk.mjs
 */
import { query } from "@anthropic-ai/claude-agent-sdk";

const prompt = process.argv[2] || "Say hello in one sentence.";

console.log(`[test] prompt: "${prompt}"`);
console.log(`[test] CLAUDE_CODE_USE_BEDROCK=${process.env.CLAUDE_CODE_USE_BEDROCK || "not set"}`);
console.log(`[test] starting query...\n`);

const startTime = Date.now();

try {
  for await (const message of query({
    prompt,
    options: {
      model: "us.anthropic.claude-sonnet-4-6",
      cwd: process.cwd(),
      allowedTools: ["Read", "Bash", "Glob"],
      permissionMode: "bypassPermissions",
      maxTurns: 1,
    },
  })) {
    const type = message.type;
    const subtype = message.subtype || "";

    if (type === "system" && subtype === "init") {
      console.log(`[system] init — model=${message.model}, tools=${message.tools?.length}, session=${message.session_id}`);
    } else if (type === "assistant") {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text") {
            console.log(`[assistant] ${block.text}`);
          } else if (block.type === "tool_use") {
            console.log(`[tool_use] ${block.name}: ${JSON.stringify(block.input).slice(0, 200)}`);
          }
        }
      }
    } else if (type === "result") {
      console.log(`\n[result] subtype=${message.subtype}, cost=$${message.total_cost_usd?.toFixed(4)}, turns=${message.num_turns}, duration=${message.duration_ms}ms`);
      if (message.result) console.log(`[result] text: ${message.result.slice(0, 500)}`);
    } else {
      console.log(`[${type}${subtype ? ":" + subtype : ""}] ${JSON.stringify(message).slice(0, 200)}`);
    }
  }

  console.log(`\n[test] done in ${Date.now() - startTime}ms`);
} catch (err) {
  console.error(`[test] ERROR:`, err.message);
  console.error(err.stack);
  process.exit(1);
}
