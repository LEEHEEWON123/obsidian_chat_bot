export interface GraphEdge {
  from: string;
  to: string;
  kind: "wikilink";
}

export interface GraphFile {
  meta: {
    indexedAt: string;
    nodeCount: number;
    edgeCount: number;
  };
  nodes: string[];
  edges: GraphEdge[];
}

export function parseGraph(raw: string): GraphFile | null {
  try {
    return JSON.parse(raw) as GraphFile;
  } catch {
    return null;
  }
}

export function getNeighbors(graph: GraphFile, node: string): string[] {
  const normalized = node.replace(/\\/g, "/");
  const neighbors = new Set<string>();

  for (const edge of graph.edges) {
    if (edge.from === normalized) neighbors.add(edge.to);
    if (edge.to === normalized) neighbors.add(edge.from);
  }

  return [...neighbors];
}

export function expandSeedPaths(graph: GraphFile, seeds: string[]): string[] {
  const expanded = new Set<string>();
  const seedSet = new Set(seeds.map((s) => s.replace(/\\/g, "/")));

  for (const seed of seedSet) {
    for (const neighbor of getNeighbors(graph, seed)) {
      if (!seedSet.has(neighbor)) expanded.add(neighbor);
    }
  }

  return [...expanded];
}
