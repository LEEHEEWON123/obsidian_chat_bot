import { createHash, randomBytes } from "crypto";

import type { ShareChannel } from "@/lib/share/channels";

export interface ShareDraft {
  draftId: string;
  createdAt: number;
  expiresAt: number;
  recipientAlias: string;
  recipientDisplayName: string;
  channels: ShareChannel[];
  naverWorksUserId?: string;
  subject: string;
  body: string;
  sourcePaths: string[];
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const drafts = new Map<string, ShareDraft>();

function ttlMs(): number {
  const raw = Number(process.env.SHARE_DRAFT_TTL_MS ?? DEFAULT_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MS;
}

function pruneExpired(now = Date.now()): void {
  for (const [id, draft] of Array.from(drafts.entries())) {
    if (draft.expiresAt <= now) drafts.delete(id);
  }
}

function newDraftId(): string {
  return createHash("sha256")
    .update(`${Date.now()}:${randomBytes(12).toString("hex")}`)
    .digest("hex")
    .slice(0, 16);
}

export function createShareDraft(input: {
  recipientAlias: string;
  recipientDisplayName: string;
  channels: ShareChannel[];
  naverWorksUserId?: string;
  subject: string;
  body: string;
  sourcePaths: string[];
}): ShareDraft {
  pruneExpired();
  const now = Date.now();
  const draft: ShareDraft = {
    draftId: newDraftId(),
    createdAt: now,
    expiresAt: now + ttlMs(),
    recipientAlias: input.recipientAlias,
    recipientDisplayName: input.recipientDisplayName,
    channels: input.channels,
    naverWorksUserId: input.naverWorksUserId,
    subject: input.subject.trim(),
    body: input.body.trim(),
    sourcePaths: Array.from(
      new Set(input.sourcePaths.map((item) => item.trim()).filter(Boolean)),
    ),
  };
  drafts.set(draft.draftId, draft);
  return draft;
}

export function getShareDraft(draftId: string): ShareDraft | null {
  pruneExpired();
  const draft = drafts.get(draftId);
  if (!draft) return null;
  if (draft.expiresAt <= Date.now()) {
    drafts.delete(draftId);
    return null;
  }
  return draft;
}

export function consumeShareDraft(draftId: string): ShareDraft | null {
  const draft = getShareDraft(draftId);
  if (!draft) return null;
  drafts.delete(draftId);
  return draft;
}

export function cancelShareDraft(draftId: string): boolean {
  pruneExpired();
  return drafts.delete(draftId);
}

export function restoreShareDraft(draft: ShareDraft): ShareDraft {
  pruneExpired();
  const restored: ShareDraft = {
    ...draft,
    expiresAt: Date.now() + ttlMs(),
  };
  drafts.set(restored.draftId, restored);
  return restored;
}

export function draftPreview(draft: ShareDraft): Record<string, unknown> {
  return {
    draftId: draft.draftId,
    expiresAt: new Date(draft.expiresAt).toISOString(),
    recipient: draft.recipientDisplayName,
    channels: draft.channels,
    naverWorksUserId: draft.naverWorksUserId ?? null,
    subject: draft.subject,
    body: draft.body,
    sourcePaths: draft.sourcePaths,
    instruction:
      "Show this draft to the user. Do NOT send yet. " +
      "Only after the user explicitly confirms (e.g. 보내 / 보내줘 / confirm), " +
      "call confirm_share_draft with this draftId.",
  };
}
