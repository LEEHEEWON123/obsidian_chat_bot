import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

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
      "Use obsidian_rag_search to find indexed vault chunks.",
      "Pass rootFolder (e.g. notion) or pathPrefix to limit search scope.",
      "Use read_vault_note to read the full markdown file before summarizing.",
      "For complex questions, search with different queries, read promising notes, then answer.",
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
