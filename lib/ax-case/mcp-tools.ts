import { runAssetQuery, type AssetQueryInput } from "@/lib/ax-case/asset-query";
import { searchAxClipImages } from "@/lib/ax-case/clip";
import { getAxCaseDir, getAxClipIndexPath } from "@/lib/ax-case/paths";

export async function axAssetQueryTool(
  input: AssetQueryInput,
): Promise<unknown> {
  return runAssetQuery(input);
}

export async function axImageSearchTool(options: {
  query: string;
  topK?: number;
  enrich?: boolean;
}): Promise<unknown> {
  return searchAxClipImages({
    query: options.query,
    topK: options.topK,
    enrich: options.enrich ?? true,
  });
}

export function axCaseStatus(): {
  caseDir: string;
  clipIndex: string;
} {
  return {
    caseDir: getAxCaseDir(),
    clipIndex: getAxClipIndexPath(),
  };
}
