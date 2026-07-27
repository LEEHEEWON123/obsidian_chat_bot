import type { ParsedFigmaTarget } from "@/lib/figma/types";

/** Normalize Figma node id to API form `1:2`. */
export function normalizeNodeId(raw: string): string {
  return raw.trim().replace(/-/g, ":");
}

/** Filename-safe node id `1-2`. */
export function safeNodeId(nodeId: string): string {
  return normalizeNodeId(nodeId).replace(/:/g, "-");
}

/**
 * Parse Figma design/file/proto URL or bare fileKey + node.
 * Examples:
 * - https://www.figma.com/design/ABC123/Name?node-id=1-2
 * - https://www.figma.com/file/ABC123/Name?node-id=1:2
 */
export function parseFigmaTarget(input: {
  urlOrKey?: string;
  fileKey?: string;
  nodeId?: string;
}): ParsedFigmaTarget {
  const fileKeyArg = input.fileKey?.trim();
  const nodeArg = input.nodeId?.trim();

  if (fileKeyArg && nodeArg) {
    return {
      fileKey: fileKeyArg,
      nodeId: normalizeNodeId(nodeArg),
    };
  }

  const raw = (input.urlOrKey ?? "").trim();
  if (!raw) {
    throw new Error("Provide a Figma URL or --file and --node");
  }

  // Bare file key + optional node via query-less form "KEY/1-2"
  if (!/^https?:\/\//i.test(raw) && !raw.includes("figma.com")) {
    const parts = raw.split(/[/?#]/);
    const key = parts[0];
    if (!key) throw new Error(`Invalid Figma file key: ${raw}`);
    if (nodeArg) {
      return { fileKey: key, nodeId: normalizeNodeId(nodeArg) };
    }
    throw new Error("Bare file key requires --node <nodeId>");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid Figma URL: ${raw}`);
  }

  const pathMatch = url.pathname.match(
    /\/(design|file|proto|board)\/([a-zA-Z0-9]+)/,
  );
  if (!pathMatch?.[2]) {
    throw new Error(`Could not parse file key from URL: ${raw}`);
  }

  const fileKey = pathMatch[2];
  const nodeFromQuery =
    url.searchParams.get("node-id") ?? url.searchParams.get("nodeId");
  const nodeId = normalizeNodeId(nodeArg || nodeFromQuery || "");
  if (!nodeId) {
    throw new Error(
      "URL missing node-id. Open the frame in Figma and copy the link with node-id, or pass --node",
    );
  }

  return {
    fileKey,
    nodeId,
    url: raw,
  };
}

export function figmaNodeUrl(fileKey: string, nodeId: string): string {
  const nid = safeNodeId(nodeId);
  return `https://www.figma.com/design/${fileKey}/?node-id=${nid}`;
}
