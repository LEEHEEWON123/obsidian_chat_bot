import { spawn } from "child_process";
import { existsSync } from "fs";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { sidecarPathForDocx } from "@/lib/docx-export/scan-docx";

export interface DocxExportOptions {
  vaultPath: string;
  docxPaths: string[];
  indexDir: string;
  pythonBin?: string;
}

export interface DocxExportResult {
  exported: number;
  skipped: number;
  warnings: string[];
}

function resolvePythonBin(explicit?: string): string {
  if (explicit) return explicit;
  if (process.env.MARKITDOWN_PYTHON) return process.env.MARKITDOWN_PYTHON;

  const venvPython = path.join(process.cwd(), ".venv-docx", "bin", "python3");
  if (existsSync(venvPython)) return venvPython;

  return "python3";
}

function titleFromMarkdown(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (match?.[1]?.trim()) return match[1].trim();
  return fallback.replace(/\.docx$/i, "");
}

function wrapWithFrontmatter(options: {
  markdown: string;
  title: string;
  sourceDocx: string;
}): string {
  const { markdown, title, sourceDocx } = options;
  const body = markdown.trim();
  return [
    "---",
    `title: ${JSON.stringify(title)}`,
    `source_docx: ${sourceDocx}`,
    "source_type: docx",
    "---",
    "",
    body,
    "",
  ].join("\n");
}

function runMarkitdown(
  pythonBin: string,
  scriptPath: string,
  inputPath: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, [scriptPath, inputPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(
          stderr.trim() ||
            `markitdown_convert.py exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

export async function exportDocxToVault(
  options: DocxExportOptions,
): Promise<DocxExportResult> {
  const {
    vaultPath,
    docxPaths,
    indexDir,
    pythonBin = resolvePythonBin(),
  } = options;
  const warnings: string[] = [];

  if (docxPaths.length === 0) {
    return { exported: 0, skipped: 0, warnings };
  }

  const scriptPath = path.join(
    process.cwd(),
    "scripts",
    "markitdown_convert.py",
  );

  let exported = 0;
  let skipped = 0;

  for (const docxAbsolutePath of docxPaths) {
    const docxRelativePath = path
      .relative(vaultPath, docxAbsolutePath)
      .split(path.sep)
      .join("/");
    const sidecarAbsolutePath = sidecarPathForDocx(
      vaultPath,
      docxAbsolutePath,
      indexDir,
    );

    try {
      const markdown = await runMarkitdown(
        pythonBin,
        scriptPath,
        docxAbsolutePath,
      );
      if (!markdown.trim()) {
        skipped++;
        warnings.push(`Empty markdown for ${docxRelativePath}`);
        continue;
      }

      const title = titleFromMarkdown(
        markdown,
        path.basename(docxRelativePath),
      );
      const wrapped = wrapWithFrontmatter({
        markdown,
        title,
        sourceDocx: docxRelativePath,
      });

      await mkdir(path.dirname(sidecarAbsolutePath), { recursive: true });
      await writeFile(sidecarAbsolutePath, wrapped, "utf8");
      exported++;
      console.log(
        `[docx] ${docxRelativePath} → ${path.relative(vaultPath, sidecarAbsolutePath)}`,
      );
    } catch (error) {
      skipped++;
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`${docxRelativePath}: ${message}`);
    }
  }

  return { exported, skipped, warnings };
}
