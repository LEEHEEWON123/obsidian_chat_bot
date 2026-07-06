import { execSync } from "child_process";
import { existsSync } from "fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import os from "os";
import path from "path";

import { convert } from "@opendataloader/pdf";

import { sidecarPathForPdf } from "@/lib/pdf-export/scan-pdfs";

const PAGE_SEPARATOR = "\n\n## Page %page-number%\n\n";

export interface PdfExportOptions {
  vaultPath: string;
  pdfPaths: string[];
  indexDir: string;
  hybrid?: string;
  hybridUrl?: string;
}

export interface PdfExportResult {
  exported: number;
  skipped: number;
  warnings: string[];
}

/** Homebrew OpenJDK paths when `java` is not on PATH (common in IDE terminals). */
const MACOS_JAVA_HOME_CANDIDATES = [
  "/opt/homebrew/opt/openjdk@21",
  "/opt/homebrew/opt/openjdk@17",
  "/opt/homebrew/opt/openjdk@11",
  "/opt/homebrew/opt/openjdk",
  "/usr/local/opt/openjdk@21",
  "/usr/local/opt/openjdk@17",
  "/usr/local/opt/openjdk@11",
  "/usr/local/opt/openjdk",
];

function javaWorks(): boolean {
  try {
    execSync("java -version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Put Java on PATH for OpenDataLoader (JVM). Uses JAVA_HOME from env or Homebrew. */
function ensureJavaEnv(): void {
  if (javaWorks()) return;

  const candidates = [
    process.env.JAVA_HOME,
    ...MACOS_JAVA_HOME_CANDIDATES,
  ].filter(Boolean) as string[];

  for (const home of candidates) {
    const javaBin = path.join(home, "bin", "java");
    if (!existsSync(javaBin)) continue;

    process.env.JAVA_HOME = home;
    const binDir = path.join(home, "bin");
    const pathParts = (process.env.PATH ?? "").split(path.delimiter);
    if (!pathParts.includes(binDir)) {
      process.env.PATH = [binDir, ...pathParts].join(path.delimiter);
    }
    if (javaWorks()) return;
  }
}

function assertJavaAvailable(): void {
  ensureJavaEnv();
  if (javaWorks()) return;

  throw new Error(
    "Java 11+ is required for PDF export. Install JDK (e.g. brew install openjdk@21), " +
      "add to PATH or set JAVA_HOME in .env.local, then run `java -version`.",
  );
}

function titleFromMarkdown(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (match?.[1]?.trim()) return match[1].trim();
  return fallback.replace(/\.pdf$/i, "");
}

function wrapWithFrontmatter(options: {
  markdown: string;
  title: string;
  sourcePdf: string;
}): string {
  const { markdown, title, sourcePdf } = options;
  const body = markdown.trim();
  return [
    "---",
    `title: ${JSON.stringify(title)}`,
    `source_pdf: ${sourcePdf}`,
    "source_type: pdf",
    "---",
    "",
    body,
    "",
  ].join("\n");
}

async function findMarkdownOutput(
  outputDir: string,
  pdfBasename: string,
): Promise<string | null> {
  const candidates = [
    `${pdfBasename}.md`,
    `${pdfBasename}.markdown`,
  ];

  for (const name of candidates) {
    const candidatePath = path.join(outputDir, name);
    try {
      await readFile(candidatePath, "utf8");
      return candidatePath;
    } catch {
      // try next
    }
  }

  const entries = await readdir(outputDir);
  const md = entries.find(
    (entry) =>
      entry.endsWith(".md") &&
      entry.replace(/\.md$/i, "") === pdfBasename.replace(/\.pdf$/i, ""),
  );
  return md ? path.join(outputDir, md) : null;
}

export async function exportPdfsToVault(
  options: PdfExportOptions,
): Promise<PdfExportResult> {
  const { vaultPath, pdfPaths, indexDir, hybrid, hybridUrl } = options;
  const warnings: string[] = [];

  if (pdfPaths.length === 0) {
    return { exported: 0, skipped: 0, warnings };
  }

  assertJavaAvailable();

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "odp-export-"));
  let exported = 0;
  let skipped = 0;

  try {
    for (const pdfAbsolutePath of pdfPaths) {
      const pdfRelativePath = path
        .relative(vaultPath, pdfAbsolutePath)
        .split(path.sep)
        .join("/");
      const sidecarAbsolutePath = sidecarPathForPdf(
        vaultPath,
        pdfAbsolutePath,
        indexDir,
      );
      const tempOut = path.join(tempRoot, path.basename(pdfAbsolutePath, ".pdf"));

      try {
        await mkdir(tempOut, { recursive: true });

        await convert([pdfAbsolutePath], {
          outputDir: tempOut,
          format: "markdown",
          markdownPageSeparator: PAGE_SEPARATOR,
          quiet: true,
          ...(hybrid ? { hybrid, hybridUrl } : {}),
        });

        const mdPath = await findMarkdownOutput(
          tempOut,
          path.basename(pdfAbsolutePath),
        );
        if (!mdPath) {
          skipped++;
          warnings.push(`No markdown output for ${pdfRelativePath}`);
          continue;
        }

        const markdown = await readFile(mdPath, "utf8");
        const title = titleFromMarkdown(
          markdown,
          path.basename(pdfRelativePath),
        );
        const wrapped = wrapWithFrontmatter({
          markdown,
          title,
          sourcePdf: pdfRelativePath,
        });

        await mkdir(path.dirname(sidecarAbsolutePath), { recursive: true });
        await writeFile(sidecarAbsolutePath, wrapped, "utf8");
        exported++;
        console.log(`[pdf] ${pdfRelativePath} → ${path.relative(vaultPath, sidecarAbsolutePath)}`);
      } catch (error) {
        skipped++;
        const message =
          error instanceof Error ? error.message : String(error);
        warnings.push(`${pdfRelativePath}: ${message}`);
      } finally {
        await rm(tempOut, { recursive: true, force: true }).catch(() => {});
      }
    }
  } finally {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }

  return { exported, skipped, warnings };
}
