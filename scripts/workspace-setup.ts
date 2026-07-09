import { existsSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

import { loadLocalEnv } from "../lib/env/load-local-env";

loadLocalEnv();

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspaceDir = path.join(process.env.HOME ?? "", "hermes-workspace");
const workspaceRepo = "https://github.com/outsourc-e/hermes-workspace.git";
const hermesEnvPath = path.join(process.env.HOME ?? "", ".hermes", ".env");

function readApiKey(): string {
  const fromProject = process.env.HERMES_API_KEY?.trim();
  if (fromProject) return fromProject;

  if (existsSync(hermesEnvPath)) {
    const match = readFileSync(hermesEnvPath, "utf8").match(/^API_SERVER_KEY=(.+)$/m);
    if (match?.[1]?.trim()) return match[1].trim();
  }

  throw new Error(
    "HERMES_API_KEY not found. Run npm run hermes:setup first, or set HERMES_API_KEY in .env.local",
  );
}

function ensureApiServerEnabled(): void {
  const marker = "# --- obsidian_chat_bot api server ---";
  if (existsSync(hermesEnvPath) && readFileSync(hermesEnvPath, "utf8").includes("API_SERVER_ENABLED=true")) {
    return;
  }
  console.log("Run npm run hermes:setup to enable API_SERVER on gateway :8642");
}

function cloneWorkspace(): void {
  if (existsSync(path.join(workspaceDir, "package.json"))) {
    console.log(`Hermes Workspace already at ${workspaceDir}`);
    return;
  }

  console.log(`Cloning ${workspaceRepo} → ${workspaceDir}`);
  execSync(`git clone --depth 1 ${workspaceRepo} "${workspaceDir}"`, {
    stdio: "inherit",
  });
}

function writeWorkspaceEnv(apiKey: string): void {
  const envPath = path.join(workspaceDir, ".env");
  const block = `# --- obsidian_chat_bot hermes-workspace ---
# UI: http://localhost:3000
# Brain: Hermes gateway :8642 + dashboard :9119
# RAG: obsidian_chat_bot MCP (Qdrant + Documents vault)
HERMES_API_URL=http://127.0.0.1:8642
HERMES_DASHBOARD_URL=http://127.0.0.1:9119
HERMES_API_TOKEN=${apiKey}
OBSIDIAN_CHAT_BOT_ROOT=${projectRoot}
SHARE_LOG_FILE=${projectRoot}/data/share-log.jsonl
PORT=3000
# --- end obsidian_chat_bot ---
`;

  if (existsSync(envPath)) {
    const existing = readFileSync(envPath, "utf8");
    const start = existing.indexOf("# --- obsidian_chat_bot hermes-workspace ---");
    if (start >= 0) {
      const end = existing.indexOf("# --- end obsidian_chat_bot ---");
      if (end >= 0) {
        writeFileSync(
          envPath,
          `${existing.slice(0, start)}${block}${existing.slice(end + "# --- end obsidian_chat_bot ---".length).replace(/^\n/, "")}`,
          "utf8",
        );
        console.log(`Updated ${envPath}`);
        return;
      }
    }
    writeFileSync(envPath, `${existing.trimEnd()}\n\n${block}`, "utf8");
  } else {
    writeFileSync(envPath, block, "utf8");
  }
  console.log(`Wrote ${envPath}`);
}

function installDeps(): void {
  console.log("Installing Hermes Workspace dependencies (pnpm)…");
  execSync("npx pnpm install", { cwd: workspaceDir, stdio: "inherit" });
}

function main(): void {
  ensureApiServerEnabled();
  const apiKey = readApiKey();
  cloneWorkspace();
  writeWorkspaceEnv(apiKey);
  installDeps();

  console.log("");
  console.log("Hermes Workspace ready.");
  console.log("");
  console.log("Start (3 terminals):");
  console.log("  1. npm run qdrant:up && npm run index     # RAG index (when needed)");
  console.log("  2. npm run hermes:gateway                 # :8642 API server");
  console.log("  3. npm run hermes:dashboard               # :9119 sessions/skills");
  console.log("  4. npm run workspace:dev                  # :3000 UI ← open this");
  console.log("");
  console.log(`Project RAG lives in: ${projectRoot}`);
  console.log(`Workspace UI lives in: ${workspaceDir}`);
}

main();
