#!/usr/bin/env node
const { spawn } = require("node:child_process");

const port = process.env.VITE_PORT || process.env.DEV_PORT || "5173";
const child = spawn("bun", ["x", "vite", "--port", port], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_PORT: port,
    DEV_PORT: port
  }
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
