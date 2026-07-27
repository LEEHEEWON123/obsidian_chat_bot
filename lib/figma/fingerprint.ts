import { createHash } from "crypto";

import type { FigmaNode } from "@/lib/figma/types";

export type FlatNode = {
  id: string;
  name: string;
  type: string;
  characters?: string;
  width?: number;
  height?: number;
  layoutMode?: string;
  itemSpacing?: number;
  padding?: string;
  fills?: unknown;
  strokes?: unknown;
  fontSize?: number;
  fontWeight?: number;
  parentId?: string;
};

function round(n: number | undefined): number | undefined {
  if (n == null || !Number.isFinite(n)) return undefined;
  return Math.round(n * 10) / 10;
}

function normalizeFills(fills: unknown): unknown {
  if (!Array.isArray(fills)) return undefined;
  return fills.map((fill) => {
    if (!fill || typeof fill !== "object") return fill;
    const f = fill as Record<string, unknown>;
    return {
      type: f.type,
      visible: f.visible,
      opacity: f.opacity,
      color: f.color,
    };
  });
}

export function flattenNodes(
  root: FigmaNode,
  maxDepth: number,
): FlatNode[] {
  const out: FlatNode[] = [];

  const walk = (node: FigmaNode, depth: number, parentId?: string) => {
    const box = node.absoluteBoundingBox;
    out.push({
      id: node.id,
      name: node.name,
      type: node.type,
      characters: node.characters,
      width: round(box?.width),
      height: round(box?.height),
      layoutMode: node.layoutMode,
      itemSpacing: round(node.itemSpacing),
      padding:
        node.paddingLeft != null
          ? [
              round(node.paddingTop) ?? 0,
              round(node.paddingRight) ?? 0,
              round(node.paddingBottom) ?? 0,
              round(node.paddingLeft) ?? 0,
            ].join(",")
          : undefined,
      fills: normalizeFills(node.fills),
      strokes: normalizeFills(node.strokes),
      fontSize: round(node.style?.fontSize),
      fontWeight: node.style?.fontWeight,
      parentId,
    });

    if (depth >= maxDepth) return;
    for (const child of node.children ?? []) {
      walk(child, depth + 1, node.id);
    }
  };

  walk(root, 0);
  return out;
}

export function summarizeTree(nodes: FlatNode[]): {
  nodeCount: number;
  textCount: number;
  componentCount: number;
} {
  return {
    nodeCount: nodes.length,
    textCount: nodes.filter((n) => n.type === "TEXT").length,
    componentCount: nodes.filter(
      (n) => n.type === "COMPONENT" || n.type === "INSTANCE",
    ).length,
  };
}

export function fingerprintNodes(nodes: FlatNode[]): string {
  const payload = JSON.stringify(nodes);
  return createHash("sha256").update(payload).digest("hex");
}
