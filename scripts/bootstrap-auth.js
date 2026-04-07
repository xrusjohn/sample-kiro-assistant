#!/usr/bin/env node
/**
 * bootstrap-auth.js — Cross-platform auth bootstrap for kiro-cli
 * 
 * Pulls kiro-cli credentials from one of:
 *   1. KIRO_AUTH_JSON env var (inline JSON)
 *   2. KIRO_AUTH_SECRET_ARN (AWS Secrets Manager)
 *   3. KIRO_AUTH_S3_URI (S3 sqlite DB copy)
 *
 * Then writes them to kiro-cli's auth DB and execs the given command.
 *
 * Usage:
 *   node bootstrap-auth.js node a2a-adapter.js
 *   KIRO_AUTH_SECRET_ARN=arn:... node bootstrap-auth.js node a2a-adapter.js
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.local', 'share', 'kiro-cli');
const DB_PATH = path.join(DATA_DIR, 'data.sqlite3');

function run(cmd) { return execSync(cmd, { encoding: 'utf-8' }).trim(); }

function writeAuthRows(rows) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  run(`sqlite3 "${DB_PATH}" "CREATE TABLE IF NOT EXISTS auth_kv (key TEXT PRIMARY KEY, value TEXT);"`);
  for (const { key, value } of rows) {
    const k = key.replace(/'/g, "''");
    const v = value.replace(/'/g, "''");
    run(`sqlite3 "${DB_PATH}" "INSERT OR REPLACE INTO auth_kv (key, value) VALUES ('${k}', '${v}');"`);
  }
}

function dbHasAuth() {
  try {
    run(`sqlite3 "${DB_PATH}" "SELECT 1 FROM auth_kv LIMIT 1;"`);
    return true;
  } catch { return false; }
}

async function bootstrap() {
  const { KIRO_AUTH_JSON, KIRO_AUTH_SECRET_ARN, KIRO_AUTH_S3_URI } = process.env;

  // Skip if already authed and no external source
  if (!KIRO_AUTH_JSON && !KIRO_AUTH_SECRET_ARN && !KIRO_AUTH_S3_URI) {
    if (fs.existsSync(DB_PATH) && dbHasAuth()) {
      console.log('[bootstrap] Auth DB exists, skipping.');
      return;
    }
  }

  // Source 1: Inline JSON
  if (KIRO_AUTH_JSON) {
    console.log('[bootstrap] Loading from KIRO_AUTH_JSON...');
    writeAuthRows(JSON.parse(KIRO_AUTH_JSON));
    console.log('[bootstrap] Done.');
    return;
  }

  // Source 2: Secrets Manager
  if (KIRO_AUTH_SECRET_ARN) {
    console.log(`[bootstrap] Fetching from Secrets Manager: ${KIRO_AUTH_SECRET_ARN}`);
    const region = process.env.AWS_REGION || 'us-east-1';
    const secret = run(`aws secretsmanager get-secret-value --secret-id "${KIRO_AUTH_SECRET_ARN}" --region ${region} --query SecretString --output text`);
    writeAuthRows(JSON.parse(secret));
    console.log('[bootstrap] Done.');
    return;
  }

  // Source 3: S3
  if (KIRO_AUTH_S3_URI) {
    console.log(`[bootstrap] Fetching from S3: ${KIRO_AUTH_S3_URI}`);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    run(`aws s3 cp "${KIRO_AUTH_S3_URI}" "${DB_PATH}"`);
    console.log('[bootstrap] Done.');
    return;
  }

  console.error('[bootstrap] ERROR: No auth source. Set KIRO_AUTH_JSON, KIRO_AUTH_SECRET_ARN, or KIRO_AUTH_S3_URI');
  process.exit(1);
}

// --- Main ---
bootstrap().then(() => {
  const args = process.argv.slice(2);
  if (args.length === 0) { console.log('[bootstrap] No command to exec.'); return; }

  const child = spawn(args[0], args.slice(1), { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code) => process.exit(code ?? 0));
}).catch((err) => {
  console.error('[bootstrap] Fatal:', err.message);
  process.exit(1);
});
