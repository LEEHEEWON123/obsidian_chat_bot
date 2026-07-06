import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadLocalEnv } from "../lib/env/load-local-env";
import { obsidianRagSearch, readVaultNote } from "../lib/mcp/vault-tools";

loadLocalEnv();

const server = new McpServer(
  {
    name: "obsidian-rag",
    version: "0.1.0",
  },
  {
    instructions: [
      "Use obsidian_rag_search to find indexed vault chunks.",
      "Use read_vault_note to read the full markdown file before summarizing.",
      "For complex questions, search with different queries, read promising notes, then answer.",
    ].join(" "),
  },
);

server.registerTool(
  "obsidian_rag_search",
  {
    description:
      "Hybrid semantic + keyword search over the indexed Obsidian/Notion vault. Call multiple times with different queries when the first pass is insufficient.",
    inputSchema: {
      query: z.string().describe("Natural-language search query"),
      topK: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Number of chunks to return (default from RAG_TOP_K)"),
      contextPath: z
        .string()
        .optional()
        .describe("Vault-relative path of the active note for graph-linked context"),
    },
  },
  async ({ query, topK, contextPath }) => {
    const result = await obsidianRagSearch({ query, topK, contextPath });
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

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
