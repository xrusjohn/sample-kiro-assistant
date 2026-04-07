import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentProfile } from './a2a-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve relative to project root (two levels up from src/server/)
const PROFILES_PATH = path.resolve(__dirname, '../../resources/agent-profiles.json');
const PROFILES_TMP_PATH = PROFILES_PATH + '.tmp';

/**
 * Read all profiles from disk. Returns an empty array if the file is missing or unparseable.
 */
export function loadProfiles(): AgentProfile[] {
  try {
    const raw = fs.readFileSync(PROFILES_PATH, 'utf-8');
    return JSON.parse(raw) as AgentProfile[];
  } catch {
    return [];
  }
}

/**
 * Write the in-memory profile list back to agent-profiles.json atomically.
 * Writes to a temp file first, then renames to the final path.
 */
export function saveProfiles(profiles: AgentProfile[]): void {
  const json = JSON.stringify(profiles, null, 2) + '\n';
  fs.writeFileSync(PROFILES_TMP_PATH, json, 'utf-8');
  fs.renameSync(PROFILES_TMP_PATH, PROFILES_PATH);
}
