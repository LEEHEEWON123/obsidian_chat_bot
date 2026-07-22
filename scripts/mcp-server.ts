import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  axAssetQueryTool,
  axImageSearchTool,
} from "../lib/ax-case/mcp-tools";
import { loadLocalEnv } from "../lib/env/load-local-env";
import { obsidianRagSearch, readVaultNote } from "../lib/mcp/vault-tools";
import {
  cancelShareDraftTool,
  confirmShareDraft,
  prepareShare,
} from "../lib/share/share-tools";

loadLocalEnv();

const server = new McpServer(
  {
    name: "obsidian-rag",
    version: "0.1.0",
  },
  {
    instructions: [
      "Prefer few tool calls: one focused obsidian_rag_search is enough for most vault lookups; re-search at most once.",
      "Pass rootFolder (e.g. notion) or pathPrefix to limit search scope.",
      "Use read_vault_note only when snippets are insufficient (1–2 paths).",
      "AX interview case: ax_asset_query for CSV metrics/filters; ax_image_search for visual concepts. Do not also vault-search unless asked.",
      "Mixed AX requests: at most one ax_asset_query + one ax_image_search, then answer.",
      "To share via NAVER Works (DM or group room), call prepare_share — it sends immediately.",
      "Recipient: person (share-people.json) or room (share-rooms.json).",
    ].join(" "),
  },
);

server.registerTool(
  "obsidian_rag_search",
  {
    description:
      "Hybrid dense (bge-m3) + BM25 sparse search over the indexed Obsidian/Notion vault. Call multiple times with different queries when the first pass is insufficient.",
    inputSchema: {
      query: z.string().describe("Natural-language search query"),
      topK: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Number of chunks to return (default from RAG_TOP_K)"),
      rootFolder: z
        .string()
        .optional()
        .describe(
          "Limit results to a vault top-level folder (e.g. dobedub)",
        ),
      pathPrefix: z
        .string()
        .optional()
        .describe(
          "Limit results to paths under this vault-relative prefix (e.g. dobedub/notion or dobedub/pudding_front)",
        ),
      contextPath: z
        .string()
        .optional()
        .describe("Vault-relative path of the active note for graph-linked context"),
    },
  },
  async ({ query, topK, rootFolder, pathPrefix, contextPath }) => {
    const result = await obsidianRagSearch({
      query,
      topK,
      rootFolder,
      pathPrefix,
      contextPath,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "read_vault_note",
  {
    description:
      "Read the full markdown content of a vault file by relative path (e.g. notion/foo.md). Use after obsidian_rag_search when you need the complete document for summarization.",
    inputSchema: {
      path: z.string().describe("Vault-relative path to the markdown file"),
    },
  },
  async ({ path: notePath }) => {
    const result = await readVaultNote(notePath);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "ax_asset_query",
  {
    description:
      "Query AX case CSV tables (assets, campaigns, reviews, performance). Use for structured asks: top performers, brand/period filters, review status, asset detail. Prefer this over vault RAG for metrics like CTR/conversions.",
    inputSchema: {
      operation: z
        .enum([
          "list_tables",
          "top_performers",
          "filter_assets",
          "asset_detail",
        ])
        .describe("Query operation"),
      metric: z
        .enum(["ctr", "conversions", "clicks", "spend", "cpa"])
        .optional()
        .describe("Ranking metric for top_performers (default conversions)"),
      limit: z.number().int().min(1).max(50).optional(),
      brand: z.string().optional().describe("Brand name contains, e.g. 가상브랜드A"),
      campaignId: z.string().optional(),
      assetId: z.string().optional().describe("Required for asset_detail"),
      fileType: z.enum(["image", "video"]).optional(),
      reviewStatus: z
        .enum(["approved", "rejected", "revision_required"])
        .optional(),
      tagContains: z.string().optional(),
      periodFrom: z.string().optional().describe("YYYY-MM-DD"),
      periodTo: z.string().optional().describe("YYYY-MM-DD"),
      confirmedOnly: z
        .boolean()
        .optional()
        .describe("Use only 확정 performance rows (default true)"),
    },
  },
  async (args) => {
    const result = await axAssetQueryTool(args);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "ax_image_search",
  {
    description:
      "CLIP text-to-image search over AX case thumbnails. Finds assets by visual concepts (e.g. 사용 장면, 얼굴 비교, 주방, 여성). Requires npm run ax:clip-index first. Enrich joins CSV metadata by default.",
    inputSchema: {
      query: z
        .string()
        .describe("Visual concept query in Korean or English"),
      topK: z.number().int().min(1).max(20).optional(),
      enrich: z
        .boolean()
        .optional()
        .describe("Attach CSV asset_detail for each hit (default true)"),
    },
  },
  async ({ query, topK, enrich }) => {
    const result = await axImageSearchTool({ query, topK, enrich });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "prepare_share",
  {
    description:
      "Send a summary to NAVER Works (DM or group room). Resolves recipient from share-people.json or share-rooms.json and sends immediately.",
    inputSchema: {
      recipient: z
        .string()
        .describe(
          "Person name/alias, room name/alias (e.g. 프론트, 프론트방), Works userId, or channelId",
        ),
      subject: z.string().describe("Short subject/title for the DM"),
      body: z.string().describe("Message body / document summary to share"),
      sourcePaths: z
        .array(z.string())
        .optional()
        .describe("Vault-relative source note paths cited in the summary"),
      channels: z
        .array(z.enum(["naver_works"]))
        .optional()
        .describe("Optional. Only naver_works is supported (default)."),
    },
  },
  async ({ recipient, subject, body, sourcePaths, channels }) => {
    const result = await prepareShare({
      recipient,
      subject,
      body,
      sourcePaths,
      channels,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "confirm_share_draft",
  {
    description:
      "Send a previously prepared share draft to NAVER Works (DM or group room). ONLY after explicit user confirm (보내/confirm).",
    inputSchema: {
      draftId: z.string().describe("draftId returned by prepare_share"),
      channels: z
        .array(z.enum(["naver_works"]))
        .optional()
        .describe("Optional. Only naver_works is supported."),
    },
  },
  async ({ draftId, channels }) => {
    const result = await confirmShareDraft({ draftId, channels });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "cancel_share_draft",
  {
    description: "Cancel a prepared share draft without sending.",
    inputSchema: {
      draftId: z.string().describe("draftId returned by prepare_share"),
    },
  },
  async ({ draftId }) => {
    const result = cancelShareDraftTool({ draftId });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
