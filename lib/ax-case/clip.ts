import { spawn } from "child_process";
import { access } from "fs/promises";
import path from "path";

import { runAssetQuery } from "@/lib/ax-case/asset-query";
import {
  getAxCaseDir,
  getAxClipImageModel,
  getAxClipIndexPath,
  getAxClipTextModel,
  getAxPythonBin,
} from "@/lib/ax-case/paths";

function repoRoot(): string {
  return path.resolve(process.cwd());
}

function clipScriptPath(): string {
  return path.join(repoRoot(), "scripts/ax_clip.py");
}

async function runPythonJson(
  args: string[],
): Promise<Record<string, unknown>> {
  const python = getAxPythonBin();
  const script = clipScriptPath();

  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(python, [script, ...args], {
      cwd: repoRoot(),
      env: process.env,
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `ax_clip.py failed (code ${code}): ${err.trim() || out.trim()}`,
          ),
        );
        return;
      }
      resolve(out);
    });
  });

  const lines = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) throw new Error("ax_clip.py returned empty stdout");
  return JSON.parse(last) as Record<string, unknown>;
}

export async function indexAxClipImages(): Promise<Record<string, unknown>> {
  const caseDir = getAxCaseDir();
  const out = getAxClipIndexPath();
  await access(path.join(caseDir, "data", "assets.csv"));
  return runPythonJson([
    "index",
    "--case-dir",
    caseDir,
    "--out",
    out,
    "--image-model",
    getAxClipImageModel(),
    "--text-model",
    getAxClipTextModel(),
  ]);
}

export async function searchAxClipImages(options: {
  query: string;
  topK?: number;
  enrich?: boolean;
}): Promise<unknown> {
  const query = options.query.trim();
  if (!query) throw new Error("query is required");

  const indexPath = getAxClipIndexPath();
  try {
    await access(indexPath);
  } catch {
    throw new Error(
      `CLIP index missing at ${indexPath}. Run: npm run ax:clip-index`,
    );
  }

  const topK = options.topK ?? 5;
  const raw = await runPythonJson([
    "search",
    "--index",
    indexPath,
    "--query",
    query,
    "--top-k",
    String(topK),
    "--text-model",
    getAxClipTextModel(),
  ]);

  if (!options.enrich) return raw;

  const results = Array.isArray(raw.results) ? raw.results : [];
  const enriched = [];
  for (const item of results) {
    const assetId =
      item && typeof item === "object" && "assetId" in item
        ? String((item as { assetId: string }).assetId)
        : "";
    if (!assetId) {
      enriched.push(item);
      continue;
    }
    try {
      const detail = await runAssetQuery({
        operation: "asset_detail",
        assetId,
      });
      enriched.push({ ...(item as object), detail });
    } catch {
      enriched.push(item);
    }
  }

  return { ...raw, results: enriched };
}
