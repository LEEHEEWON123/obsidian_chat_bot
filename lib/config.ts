import { parseNotionPageIds } from "@/lib/notion/client";

export interface AppConfig {
  vaultPath: string;
  cursorApiKey: string;
  cursorModel: string;
  indexInclude: string;
  topK: number;
  dataDir: string;
  notionApiKey: string;
  notionPageIds: string[];
  notionMaxPages: number;
}

export function getConfig(): AppConfig {
  const notionPageIdsRaw = process.env.NOTION_PAGE_IDS ?? "";

  return {
    vaultPath: process.env.VAULT_PATH ?? "",
    cursorApiKey: process.env.CURSOR_API_KEY ?? "",
    cursorModel: process.env.CURSOR_MODEL ?? "composer-2.5",
    indexInclude: process.env.INDEX_INCLUDE ?? "**/*.md",
    topK: Number(process.env.RAG_TOP_K ?? 5),
    dataDir: process.env.DATA_DIR ?? "data",
    notionApiKey: process.env.NOTION_API_KEY ?? "",
    notionPageIds: notionPageIdsRaw
      ? parseNotionPageIds(notionPageIdsRaw)
      : [],
    notionMaxPages: Number(process.env.NOTION_MAX_PAGES ?? 500),
  };
}

export function hasKnowledgeSource(config: AppConfig): boolean {
  return Boolean(config.vaultPath) || config.notionPageIds.length > 0;
}

export function assertConfig(config: AppConfig): void {
  if (!hasKnowledgeSource(config)) {
    throw new Error("Set VAULT_PATH and/or NOTION_PAGE_IDS");
  }
  if (!config.cursorApiKey) {
    throw new Error("CURSOR_API_KEY is not set");
  }
}

export function assertNotionConfig(config: AppConfig): void {
  if (!config.notionApiKey) {
    throw new Error("NOTION_API_KEY is not set");
  }
  if (config.notionPageIds.length === 0) {
    throw new Error("NOTION_PAGE_IDS is not set");
  }
}
