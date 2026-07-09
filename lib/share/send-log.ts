import { appendFile, mkdir } from "fs/promises";
import path from "path";

import type { ShareDraft } from "@/lib/share/draft-store";

export interface ShareSendLogEntry {
  ts: string;
  status: "sent" | "error";
  draftId: string;
  recipient: string;
  recipientAlias: string;
  naverWorksUserId: string | null;
  subject: string;
  body: string;
  sourcePaths: string[];
  botId?: string;
  requestId?: string;
  error?: string;
}

function resolveLogPath(): string {
  const explicit = process.env.SHARE_LOG_FILE?.trim();
  if (explicit) return path.resolve(explicit);
  const dataDir = process.env.DATA_DIR?.trim() || "data";
  return path.resolve(process.cwd(), dataDir, "share-log.jsonl");
}

export async function appendShareSendLog(
  entry: ShareSendLogEntry,
): Promise<string> {
  const filePath = resolveLogPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  return filePath;
}

export async function logShareSend(options: {
  draft: ShareDraft;
  status: "sent" | "error";
  botId?: string;
  requestId?: string;
  error?: string;
}): Promise<string | null> {
  try {
    return await appendShareSendLog({
      ts: new Date().toISOString(),
      status: options.status,
      draftId: options.draft.draftId,
      recipient: options.draft.recipientDisplayName,
      recipientAlias: options.draft.recipientAlias,
      naverWorksUserId: options.draft.naverWorksUserId ?? null,
      subject: options.draft.subject,
      body: options.draft.body,
      sourcePaths: options.draft.sourcePaths,
      botId: options.botId,
      requestId: options.requestId,
      error: options.error,
    });
  } catch (error) {
    console.error(
      "[share-log] failed to append:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
