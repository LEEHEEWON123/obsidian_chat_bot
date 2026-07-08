export type ShareChannel = "naver_works";

export const ALL_SHARE_CHANNELS: ShareChannel[] = ["naver_works"];

export function normalizeChannels(
  input?: string[] | ShareChannel[] | "both" | ShareChannel,
): ShareChannel[] {
  if (!input || input === "both") return [...ALL_SHARE_CHANNELS];
  if (typeof input === "string") {
    if (input === "naver_works") return [input];
    throw new Error(`Unknown channel: ${input}. Only naver_works is supported.`);
  }
  const unique = Array.from(new Set(input));
  for (const channel of unique) {
    if (channel !== "naver_works") {
      throw new Error(`Unknown channel: ${channel}. Only naver_works is supported.`);
    }
  }
  if (unique.length === 0) return [...ALL_SHARE_CHANNELS];
  return unique as ShareChannel[];
}

export function formatShareMessage(options: {
  subject: string;
  body: string;
  sourcePaths: string[];
}): string {
  const lines: string[] = [];
  if (options.subject) {
    lines.push(`*${options.subject}*`, "");
  }
  lines.push(options.body.trim());
  if (options.sourcePaths.length > 0) {
    lines.push("", "*출처*", ...options.sourcePaths.map((path) => `• \`${path}\``));
  }
  lines.push("", "_via Company RAG_");
  return lines.join("\n");
}
