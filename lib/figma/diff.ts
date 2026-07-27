import type { FlatNode } from "@/lib/figma/fingerprint";
import type { FigmaChange } from "@/lib/figma/types";

function key(n: FlatNode): string {
  return n.id;
}

export function diffFlatNodes(
  previous: FlatNode[] | null,
  next: FlatNode[],
): FigmaChange {
  if (!previous) {
    return { kind: "created" };
  }

  const prevMap = new Map(previous.map((n) => [key(n), n]));
  const nextMap = new Map(next.map((n) => [key(n), n]));

  const added: string[] = [];
  const removed: string[] = [];
  const renamed: Array<{ from: string; to: string; id: string }> = [];
  const textChanged: Array<{
    id: string;
    name: string;
    before: string;
    after: string;
  }> = [];
  const layoutChanged: Array<{ id: string; name: string; detail: string }> =
    [];
  const other: string[] = [];

  for (const [id, node] of nextMap) {
    if (!prevMap.has(id)) {
      added.push(`${node.type} ${node.name} (${id})`);
    }
  }
  for (const [id, node] of prevMap) {
    if (!nextMap.has(id)) {
      removed.push(`${node.type} ${node.name} (${id})`);
    }
  }

  for (const [id, curr] of nextMap) {
    const prev = prevMap.get(id);
    if (!prev) continue;

    if (prev.name !== curr.name) {
      renamed.push({ id, from: prev.name, to: curr.name });
    }
    if ((prev.characters ?? "") !== (curr.characters ?? "")) {
      textChanged.push({
        id,
        name: curr.name,
        before: prev.characters ?? "",
        after: curr.characters ?? "",
      });
    }

    const layoutBits: string[] = [];
    if (prev.width !== curr.width || prev.height !== curr.height) {
      layoutBits.push(
        `size ${prev.width}x${prev.height} → ${curr.width}x${curr.height}`,
      );
    }
    if (prev.layoutMode !== curr.layoutMode) {
      layoutBits.push(`layoutMode ${prev.layoutMode} → ${curr.layoutMode}`);
    }
    if (prev.itemSpacing !== curr.itemSpacing) {
      layoutBits.push(`gap ${prev.itemSpacing} → ${curr.itemSpacing}`);
    }
    if (prev.padding !== curr.padding) {
      layoutBits.push(`padding ${prev.padding} → ${curr.padding}`);
    }
    if (JSON.stringify(prev.fills) !== JSON.stringify(curr.fills)) {
      layoutBits.push("fills changed");
    }
    if (layoutBits.length > 0) {
      layoutChanged.push({
        id,
        name: curr.name,
        detail: layoutBits.join("; "),
      });
    }
  }

  const hasChanges =
    added.length +
      removed.length +
      renamed.length +
      textChanged.length +
      layoutChanged.length +
      other.length >
    0;

  if (!hasChanges) {
    return { kind: "unchanged" };
  }

  return {
    kind: "updated",
    added,
    removed,
    renamed,
    textChanged,
    layoutChanged,
    other,
  };
}

export function formatChangeMarkdown(change: FigmaChange): string {
  if (change.kind === "created") {
    return "- First export (no previous snapshot).";
  }
  if (change.kind === "unchanged") {
    return "- No changes vs last snapshot.";
  }

  const lines: string[] = [];
  if (change.added.length) {
    lines.push("### Added");
    for (const item of change.added) lines.push(`- ${item}`);
  }
  if (change.removed.length) {
    lines.push("### Removed");
    for (const item of change.removed) lines.push(`- ${item}`);
  }
  if (change.renamed.length) {
    lines.push("### Renamed");
    for (const item of change.renamed) {
      lines.push(`- \`${item.id}\`: ${item.from} → ${item.to}`);
    }
  }
  if (change.textChanged.length) {
    lines.push("### Text");
    for (const item of change.textChanged) {
      lines.push(
        `- **${item.name}** (\`${item.id}\`): "${item.before}" → "${item.after}"`,
      );
    }
  }
  if (change.layoutChanged.length) {
    lines.push("### Layout / style");
    for (const item of change.layoutChanged) {
      lines.push(`- **${item.name}** (\`${item.id}\`): ${item.detail}`);
    }
  }
  return lines.join("\n") || "- Updated (details unavailable).";
}
