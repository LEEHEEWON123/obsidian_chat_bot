import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { loadLocalEnv } from "../lib/env/load-local-env";
import { getConfig } from "../lib/config";

loadLocalEnv();

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hermesDir = path.join(process.env.HOME ?? "", ".hermes");
const configPath = path.join(hermesDir, "config.yaml");
const fragmentPath = path.join(projectRoot, "hermes", "config.fragment.yaml");
const agentsSource = path.join(projectRoot, "hermes", "AGENTS.md");
const agentsTarget = path.join(hermesDir, "AGENTS.md");

function substitute(template: string): string {
  const config = getConfig();
  const map: Record<string, string> = {
    PROJECT_ROOT: projectRoot,
    VAULT_PATH: config.vaultPath,
    DATA_DIR: config.dataDir,
    QDRANT_URL: config.qdrantUrl,
    QDRANT_COLLECTION: config.qdrantCollection,
    RAG_TOP_K: String(config.topK),
    RAG_RECALL_K: String(config.recallK),
    RERANK_ENABLED: config.rerankEnabled ? "true" : "false",
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => map[key] ?? "");
}

function mergeYamlBlock(existing: string, block: string): string {
  const marker = "# --- obsidian_chat_bot hermes integration ---";
  const endMarker = "# --- end obsidian_chat_bot ---";
  const wrapped = `${marker}\n${block.trim()}\n${endMarker}`;

  const start = existing.indexOf(marker);
  if (start >= 0) {
    const end = existing.indexOf(endMarker);
    if (end < 0) {
      throw new Error("Found integration start marker but no end marker in config.yaml");
    }
    return `${existing.slice(0, start)}${wrapped}\n${existing.slice(end + endMarker.length).replace(/^\n/, "")}`;
  }

  const trimmed = existing.trimEnd();
  return trimmed.length > 0 ? `${trimmed}\n\n${wrapped}\n` : `${wrapped}\n`;
}

function main(): void {
  if (!getConfig().vaultPath) {
    throw new Error("VAULT_PATH is not set in .env.local");
  }

  if (!existsSync(fragmentPath)) {
    throw new Error(`Missing fragment: ${fragmentPath}`);
  }

  mkdirSync(hermesDir, { recursive: true });

  const fragment = substitute(readFileSync(fragmentPath, "utf8"));
  const block = fragment
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n")
    .trim();

  if (existsSync(configPath)) {
    const backup = `${configPath}.bak-${Date.now()}`;
    copyFileSync(configPath, backup);
    const merged = mergeYamlBlock(readFileSync(configPath, "utf8"), block);
    writeFileSync(configPath, merged, "utf8");
    console.log(`Updated ${configPath} (backup: ${backup})`);
  } else {
    writeFileSync(configPath, `${block}\n`, "utf8");
    console.log(`Created ${configPath}`);
  }

  copyFileSync(agentsSource, agentsTarget);
  console.log(`Copied agent instructions to ${agentsTarget}`);
  console.log("");
  console.log("Next:");
  console.log("  1. Ensure Qdrant is running and index is built (npm run index)");
  console.log("  2. hermes chat --toolsets web,terminal,mcp-obsidian_rag,session_search");
  console.log("     or: npm run hermes:chat");
}

main();
