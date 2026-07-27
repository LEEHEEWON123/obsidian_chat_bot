import type { FigmaNode } from "@/lib/figma/types";

function rgbToHex(color: {
  r: number;
  g: number;
  b: number;
  a?: number;
}): string {
  const to = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(color.r)}${to(color.g)}${to(color.b)}`;
}

function solidFillClass(fills: unknown[] | undefined): string | undefined {
  if (!Array.isArray(fills)) return undefined;
  for (const fill of fills) {
    if (!fill || typeof fill !== "object") continue;
    const f = fill as {
      type?: string;
      visible?: boolean;
      color?: { r: number; g: number; b: number; a?: number };
    };
    if (f.visible === false) continue;
    if (f.type === "SOLID" && f.color) {
      return `text-[${rgbToHex(f.color)}]`;
    }
  }
  return undefined;
}

function solidBgClass(fills: unknown[] | undefined): string | undefined {
  if (!Array.isArray(fills)) return undefined;
  for (const fill of fills) {
    if (!fill || typeof fill !== "object") continue;
    const f = fill as {
      type?: string;
      visible?: boolean;
      color?: { r: number; g: number; b: number; a?: number };
    };
    if (f.visible === false) continue;
    if (f.type === "SOLID" && f.color) {
      return `bg-[${rgbToHex(f.color)}]`;
    }
  }
  return undefined;
}

function layoutClasses(node: FigmaNode): string[] {
  const classes: string[] = [];
  if (node.layoutMode === "HORIZONTAL") {
    classes.push("flex", "flex-row");
  } else if (node.layoutMode === "VERTICAL") {
    classes.push("flex", "flex-col");
  }
  if (node.itemSpacing != null && node.itemSpacing > 0) {
    classes.push(`gap-[${Math.round(node.itemSpacing)}px]`);
  }
  const pt = node.paddingTop ?? 0;
  const pr = node.paddingRight ?? 0;
  const pb = node.paddingBottom ?? 0;
  const pl = node.paddingLeft ?? 0;
  if (pt || pr || pb || pl) {
    classes.push(`p-[${Math.round(pt)}px_${Math.round(pr)}px_${Math.round(pb)}px_${Math.round(pl)}px]`);
  }
  const box = node.absoluteBoundingBox;
  if (box && !node.layoutMode) {
    classes.push(`w-[${Math.round(box.width)}px]`, `min-h-[${Math.round(box.height)}px]`);
  }
  return classes;
}

function escapeJsxText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;");
}

function toComponentName(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const base = cleaned || "FigmaFrame";
  return /^[A-Z]/.test(base) ? base : `Figma${base}`;
}

function renderNode(node: FigmaNode, depth: number, maxDepth: number): string {
  const indent = "  ".repeat(depth + 1);
  const classes = [
    ...layoutClasses(node),
    solidBgClass(node.fills as unknown[] | undefined) ?? "",
  ].filter(Boolean);

  if (node.type === "TEXT") {
    const textClasses = [
      solidFillClass(node.fills as unknown[] | undefined) ?? "text-neutral-900",
      node.style?.fontSize
        ? `text-[${Math.round(node.style.fontSize)}px]`
        : "",
      node.style?.fontWeight && node.style.fontWeight >= 600 ? "font-semibold" : "",
    ].filter(Boolean);
    const text = escapeJsxText(node.characters ?? "");
    return `${indent}<p className="${textClasses.join(" ")}" data-figma-id="${node.id}">${text}</p>`;
  }

  const childDepth = depth + 1;
  const children =
    depth < maxDepth
      ? (node.children ?? [])
          .map((child) => renderNode(child, childDepth, maxDepth))
          .join("\n")
      : `${indent}  {/* truncated: max depth */}`;

  const tag = "div";
  const className = classes.join(" ") || "relative";
  if (!children.trim()) {
    return `${indent}<${tag} className="${className}" data-figma-id="${node.id}" data-figma-name="${escapeJsxText(node.name)}" />`;
  }
  return [
    `${indent}<${tag} className="${className}" data-figma-id="${node.id}" data-figma-name="${escapeJsxText(node.name)}">`,
    children,
    `${indent}</${tag}>`,
  ].join("\n");
}

export function generateReactTailwind(options: {
  root: FigmaNode;
  fileKey: string;
  nodeId: string;
  url?: string;
  maxDepth: number;
}): string {
  const { root, fileKey, nodeId, url, maxDepth } = options;
  const componentName = toComponentName(root.name);
  const link = url ?? `https://www.figma.com/design/${fileKey}/?node-id=${nodeId.replace(/:/g, "-")}`;
  const body = renderNode(root, 0, maxDepth);

  return `/** Auto-generated publishing scaffold from Figma. Not pixel-perfect. */
// Figma: ${fileKey} ${nodeId}
// ${link}

export function ${componentName}() {
  return (
${body}
  );
}

export default ${componentName};
`;
}
