import type {
  FigmaImagesResponse,
  FigmaNodesResponse,
} from "@/lib/figma/types";

const FIGMA_API = "https://api.figma.com/v1";

function getToken(): string {
  const token = process.env.FIGMA_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new Error("FIGMA_ACCESS_TOKEN is not set");
  }
  return token;
}

async function figmaFetch<T>(path: string): Promise<T> {
  const token = getToken();
  const response = await fetch(`${FIGMA_API}${path}`, {
    headers: {
      "X-Figma-Token": token,
    },
  });

  if (response.status === 429) {
    await new Promise((r) => setTimeout(r, 1500));
    const retry = await fetch(`${FIGMA_API}${path}`, {
      headers: { "X-Figma-Token": token },
    });
    if (!retry.ok) {
      const body = await retry.text();
      throw new Error(`Figma API ${retry.status}: ${body.slice(0, 400)}`);
    }
    return (await retry.json()) as T;
  }

  if (!response.ok) {
    const body = await response.text();
    const hint =
      response.status === 403
        ? " (check token scopes / file access)"
        : response.status === 404
          ? " (file or node not found)"
          : "";
    throw new Error(`Figma API ${response.status}${hint}: ${body.slice(0, 400)}`);
  }

  return (await response.json()) as T;
}

export async function fetchFigmaNodes(
  fileKey: string,
  nodeIds: string[],
): Promise<FigmaNodesResponse> {
  const ids = encodeURIComponent(nodeIds.join(","));
  return figmaFetch<FigmaNodesResponse>(
    `/files/${encodeURIComponent(fileKey)}/nodes?ids=${ids}`,
  );
}

export async function fetchFigmaImageUrls(
  fileKey: string,
  nodeIds: string[],
  options?: { format?: "png" | "svg"; scale?: number },
): Promise<FigmaImagesResponse> {
  const ids = encodeURIComponent(nodeIds.join(","));
  const format = options?.format ?? "png";
  const scale = options?.scale ?? 2;
  return figmaFetch<FigmaImagesResponse>(
    `/images/${encodeURIComponent(fileKey)}?ids=${ids}&format=${format}&scale=${scale}`,
  );
}
