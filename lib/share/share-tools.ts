import { sendNaverWorksDm } from "@/lib/naver-works/client";
import {
  ALL_SHARE_CHANNELS,
  formatShareMessage,
  normalizeChannels,
  type ShareChannel,
} from "@/lib/share/channels";
import {
  cancelShareDraft,
  consumeShareDraft,
  createShareDraft,
  draftPreview,
  restoreShareDraft,
  type ShareDraft,
} from "@/lib/share/draft-store";
import { resolvePerson, type SharePerson } from "@/lib/share/people-directory";
import { logShareSend } from "@/lib/share/send-log";

function channelsForPerson(
  person: SharePerson,
  requested: ShareChannel[],
):
  | { ok: true; channels: ShareChannel[] }
  | { ok: false; error: string } {
  if (!person.naverWorksUserId) {
    return {
      ok: false,
      error:
        `Recipient "${person.displayName}" has no naverWorksUserId ` +
        "in config/share-people.json.",
    };
  }

  const selected = requested.filter((channel) => channel === "naver_works");
  if (selected.length === 0) {
    return {
      ok: false,
      error: `Only naver_works is supported. Got: [${requested.join(", ")}]`,
    };
  }

  return { ok: true, channels: ["naver_works"] };
}

export async function prepareShare(input: {
  recipient: string;
  subject: string;
  body: string;
  sourcePaths?: string[];
  channels?: string[] | "both";
}): Promise<Record<string, unknown>> {
  let requested: ShareChannel[];
  try {
    requested = normalizeChannels(input.channels);
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
      supportedChannels: ALL_SHARE_CHANNELS,
    };
  }

  const resolved = await resolvePerson(input.recipient);
  if (!resolved.ok) {
    return {
      status: "error",
      error: resolved.error,
      suggestions: resolved.suggestions,
    };
  }

  const body = input.body.trim();
  if (!body) {
    return { status: "error", error: "body is empty — summarize the document first" };
  }

  const channelPick = channelsForPerson(resolved.person, requested);
  if (!channelPick.ok) {
    return { status: "error", error: channelPick.error };
  }

  const draft = createShareDraft({
    recipientAlias: input.recipient,
    recipientDisplayName: resolved.person.displayName,
    channels: channelPick.channels,
    naverWorksUserId: resolved.person.naverWorksUserId,
    subject: input.subject || "문서 요약 공유",
    body,
    sourcePaths: input.sourcePaths ?? [],
  });

  return {
    status: "draft_ready",
    ...draftPreview(draft),
  };
}

async function deliverNaverWorks(
  draft: ShareDraft,
  text: string,
): Promise<Record<string, unknown>> {
  if (!draft.naverWorksUserId) {
    throw new Error("Draft missing naverWorksUserId");
  }
  const sent = await sendNaverWorksDm({
    userId: draft.naverWorksUserId,
    text,
  });
  return {
    channel: "naver_works",
    status: "sent",
    naverWorksUserId: draft.naverWorksUserId,
    botId: sent.botId,
    requestId: sent.requestId,
  };
}

export async function confirmShareDraft(input: {
  draftId: string;
  channels?: string[];
}): Promise<Record<string, unknown>> {
  const draft = consumeShareDraft(input.draftId);
  if (!draft) {
    return {
      status: "error",
      error:
        "Draft not found or expired. Call prepare_share again and ask the user to confirm.",
    };
  }

  let channels = draft.channels;
  if (input.channels && input.channels.length > 0) {
    try {
      channels = normalizeChannels(input.channels).filter((channel) =>
        draft.channels.includes(channel),
      );
    } catch (error) {
      restoreShareDraft(draft);
      return {
        status: "error",
        draftId: draft.draftId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    if (channels.length === 0) {
      restoreShareDraft(draft);
      return {
        status: "error",
        draftId: draft.draftId,
        error: "No overlapping channels between draft and confirm request",
      };
    }
  }

  const text = formatShareMessage({
    subject: draft.subject,
    body: draft.body,
    sourcePaths: draft.sourcePaths,
  });

  try {
    const result = await deliverNaverWorks(draft, text);
    const logPath = await logShareSend({
      draft,
      status: "sent",
      botId: typeof result.botId === "string" ? result.botId : undefined,
      requestId:
        typeof result.requestId === "string" ? result.requestId : undefined,
    });
    return {
      status: "sent",
      recipient: draft.recipientDisplayName,
      subject: draft.subject,
      sourcePaths: draft.sourcePaths,
      results: [result],
      logPath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const logPath = await logShareSend({
      draft,
      status: "error",
      error: message,
    });
    restoreShareDraft(draft);
    return {
      status: "error",
      draftId: draft.draftId,
      recipient: draft.recipientDisplayName,
      results: [
        {
          channel: "naver_works",
          status: "error",
          error: message,
        },
      ],
      logPath,
      hint:
        "NAVER Works send failed. Check NAVER_WORKS_CLIENT_ID/SECRET/SERVICE_ACCOUNT/BOT_ID + private key, " +
        "scopes (bot bot.message bot.read directory.read), and the recipient naverWorksUserId.",
    };
  }
}

export function cancelShareDraftTool(input: {
  draftId: string;
}): Record<string, unknown> {
  const cancelled = cancelShareDraft(input.draftId);
  return cancelled
    ? { status: "cancelled", draftId: input.draftId }
    : { status: "error", error: "Draft not found or already used/expired" };
}
