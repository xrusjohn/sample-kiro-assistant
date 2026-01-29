import { readdir, stat } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import type { SkillInfo } from "../../shared/skills.js";

const KIRO_SKILLS_DIR = join(homedir(), ".kiro", "skills");

export async function loadSkills(): Promise<{ user: SkillInfo[]; project: SkillInfo[] }> {
  try {
    const entries = await readdir(KIRO_SKILLS_DIR, { withFileTypes: true });
    const user: SkillInfo[] = [];
    for (const entry of entries) {
      let isDirectory = entry.isDirectory();
      const fullPath = join(KIRO_SKILLS_DIR, entry.name);

      if (!isDirectory && entry.isSymbolicLink()) {
        try {
          const stats = await stat(fullPath);
          isDirectory = stats.isDirectory();
        } catch {
          isDirectory = false;
        }
      }

      if (!isDirectory) continue;
      user.push({
        name: entry.name,
        scope: "user",
        path: fullPath
      });
    }
    user.sort((a, b) => a.name.localeCompare(b.name));
    return { user, project: [] };
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return { user: [], project: [] };
    }
    return { user: [], project: [] };
  }
}
