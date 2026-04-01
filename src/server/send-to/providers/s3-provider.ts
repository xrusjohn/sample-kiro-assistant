import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { DestinationProvider } from "../destination-provider.js";
import type { ConfigField, SendToResponse } from "../../../shared/send-to-types.js";

export class S3Provider implements DestinationProvider {
  readonly id = "s3";
  readonly label = "S3";
  readonly icon = "☁️";
  readonly supportedFileTypes = "all" as const;

  getConfigFields(): ConfigField[] {
    return [
      { name: "bucket", label: "S3 Bucket", type: "text", required: true, placeholder: "my-bucket" },
      { name: "keyPrefix", label: "Key Prefix (optional)", type: "text", required: false, placeholder: "uploads/" },
    ];
  }

  validateParams(params: Record<string, string>): string | null {
    if (!params.bucket?.trim()) return "S3 bucket name is required";
    return null;
  }

  async send(filePath: string, params: Record<string, string>): Promise<SendToResponse> {
    try {
      const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
      const content = await readFile(filePath);
      const fileName = basename(filePath);
      const prefix = params.keyPrefix?.trim() || "";
      const key = prefix ? `${prefix.replace(/\/+$/, "")}/${fileName}` : fileName;

      const client = new S3Client({});
      await client.send(new PutObjectCommand({
        Bucket: params.bucket.trim(),
        Key: key,
        Body: content,
      }));

      const uri = `s3://${params.bucket.trim()}/${key}`;
      return {
        success: true,
        message: `Uploaded to ${uri}`,
        data: { uri, bucket: params.bucket.trim(), key },
      };
    } catch (err: any) {
      const code = err.Code || err.name || "Unknown";
      return { success: false, message: `S3 upload failed: ${code} — ${err.message}` };
    }
  }
}
