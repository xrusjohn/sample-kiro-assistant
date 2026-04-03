import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

const DATA_DIR = process.env.KIRO_ASSISTANT_DATA ?? join(homedir(), ".kiro-assistant");
const SESSIONS_S3_URI = process.env.SESSIONS_S3_URI; // e.g. s3://bucket/key

export function ensureDataDir(): string {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

export const DB_PATH = join(ensureDataDir(), "sessions.db");
export const SETTINGS_PATH = join(ensureDataDir(), "assistant-settings.json");

function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  const m = uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
  return m ? { bucket: m[1], key: m[2] } : null;
}

/** Pull sessions.db from S3 on startup (best-effort, sync). */
export function pullDbFromS3(): void {
  if (!SESSIONS_S3_URI || existsSync(DB_PATH)) return;
  const loc = parseS3Uri(SESSIONS_S3_URI);
  if (!loc) return;
  import("@aws-sdk/client-s3").then(({ S3Client, GetObjectCommand }) => {
    const client = new S3Client({});
    client.send(new GetObjectCommand({ Bucket: loc.bucket, Key: loc.key }))
      .then(async (res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of res.Body as any) chunks.push(Buffer.from(chunk));
        writeFileSync(DB_PATH, Buffer.concat(chunks));
        console.log(`[s3] Pulled sessions.db from ${SESSIONS_S3_URI}`);
      })
      .catch(() => console.log(`[s3] No sessions.db in S3 yet, starting fresh`));
  });
}

/** Push sessions.db to S3 (async, best-effort). */
export function pushDbToS3(): void {
  if (!SESSIONS_S3_URI || !existsSync(DB_PATH)) return;
  const loc = parseS3Uri(SESSIONS_S3_URI);
  if (!loc) return;
  import("@aws-sdk/client-s3").then(({ S3Client, PutObjectCommand }) => {
    const client = new S3Client({});
    client.send(new PutObjectCommand({
      Bucket: loc.bucket, Key: loc.key,
      Body: readFileSync(DB_PATH),
    })).catch((err: any) => console.warn(`[s3] Push failed: ${err.message}`));
  });
}
