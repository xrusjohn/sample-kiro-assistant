import { readFileSync, writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const PID_FILE = join(tmpdir(), "kiro-assistant-pids.json");

interface TrackedProcess {
  pid: number;
  sessionId: string;
  spawnedAt: number;
}

function load(): TrackedProcess[] {
  try { return JSON.parse(readFileSync(PID_FILE, "utf-8")); }
  catch { return []; }
}

function save(entries: TrackedProcess[]) {
  try { writeFileSync(PID_FILE, JSON.stringify(entries, null, 2)); }
  catch (e) { console.warn("[pid-tracker] write failed:", e); }
}

function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

export function addPid(pid: number, sessionId: string) {
  const entries = load();
  entries.push({ pid, sessionId, spawnedAt: Date.now() });
  save(entries);
}

export function removePid(pid: number) {
  save(load().filter(e => e.pid !== pid));
}

export function killStale() {
  const entries = load();
  let killed = 0;
  for (const entry of entries) {
    if (!isAlive(entry.pid)) continue;
    console.log(`[pid-tracker] killing stale kiro-cli process ${entry.pid} (session: ${entry.sessionId})`);
    try { process.kill(entry.pid, "SIGTERM"); } catch { /* already gone */ }
    // Escalate after 2s if still alive
    setTimeout(() => {
      if (isAlive(entry.pid)) {
        console.log(`[pid-tracker] SIGKILL ${entry.pid}`);
        try { process.kill(entry.pid, "SIGKILL"); } catch { /* ok */ }
      }
    }, 2000);
    killed++;
  }
  if (killed) console.log(`[pid-tracker] cleaned up ${killed} stale process(es)`);
  save([]);
}

export function cleanup() {
  try { unlinkSync(PID_FILE); } catch { /* ok */ }
}
