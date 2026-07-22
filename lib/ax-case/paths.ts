import path from "path";

import { getConfig } from "@/lib/config";

/** Root of ax_pre_interview_case_exercise (contains data/ and thumbnails/). */
export function getAxCaseDir(): string {
  const fromEnv = process.env.AX_CASE_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(
    process.env.HOME ?? "",
    "Downloads/ax_pre_interview_case_exercise",
  );
}

export function getAxClipIndexPath(): string {
  const fromEnv = process.env.AX_CLIP_INDEX?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  const dataDir = path.resolve(getConfig().dataDir);
  return path.join(dataDir, "ax-clip-index.json");
}

export function getAxClipImageModel(): string {
  return (
    process.env.AX_CLIP_IMAGE_MODEL?.trim() ||
    "sentence-transformers/clip-ViT-B-32"
  );
}

export function getAxClipTextModel(): string {
  return (
    process.env.AX_CLIP_TEXT_MODEL?.trim() ||
    process.env.AX_CLIP_MODEL?.trim() ||
    "sentence-transformers/clip-ViT-B-32-multilingual-v1"
  );
}

export function getAxPythonBin(): string {
  return (
    process.env.AX_PYTHON?.trim() ||
    process.env.DOCX_PYTHON?.trim() ||
    "python3"
  );
}
