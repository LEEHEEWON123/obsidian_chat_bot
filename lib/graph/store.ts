import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

export type GraphEdgeKind = "wikilink";

export interface GraphEdge {
  from: string;
  to: string;
  kind: GraphEdgeKind;
}

export interface GraphMeta {
  indexedAt: string;
  nodeCount: number;
  edgeCount: number;
}

export interface GraphFile {
  meta: GraphMeta;
  nodes: string[];
  edges: GraphEdge[];
}

export class GraphStore {
  private nodes = new Set<string>();
  private edges: GraphEdge[] = [];
  private meta: GraphMeta = {
    indexedAt: "",
    nodeCount: 0,
    edgeCount: 0,
  };

  constructor(private readonly dataDir: string) {}

  static async load(dataDir: string): Promise<GraphStore> {
    const store = new GraphStore(dataDir);
    await store.readFromDisk();
    return store;
  }

  private graphPath(): string {
    return path.join(this.dataDir, "graph.json");
  }

  private async readFromDisk(): Promise<void> {
    try {
      const raw = await readFile(this.graphPath(), "utf8");
      const parsed = JSON.parse(raw) as GraphFile;
      this.nodes = new Set(parsed.nodes);
      this.edges = parsed.edges;
      this.meta = parsed.meta;
    } catch {
      this.nodes = new Set();
      this.edges = [];
      this.meta = { indexedAt: "", nodeCount: 0, edgeCount: 0 };
    }
  }

  replaceAll(nodes: string[], edges: GraphEdge[]): void {
    this.nodes = new Set(nodes);
    this.edges = edges;
    this.meta = {
      indexedAt: new Date().toISOString(),
      nodeCount: nodes.length,
      edgeCount: edges.length,
    };
  }

  getMeta(): GraphMeta {
    return this.meta;
  }

  getNeighbors(node: string, direction: "out" | "in" | "both" = "both"): string[] {
    const normalized = node.replace(/\\/g, "/");
    const neighbors = new Set<string>();

    for (const edge of this.edges) {
      if (direction !== "in" && edge.from === normalized) {
        neighbors.add(edge.to);
      }
      if (direction !== "out" && edge.to === normalized) {
        neighbors.add(edge.from);
      }
    }

    return [...neighbors];
  }

  expandNodes(seeds: string[], hops = 1): string[] {
    const visited = new Set<string>();
    let frontier = seeds.map((s) => s.replace(/\\/g, "/"));

    for (let hop = 0; hop < hops; hop++) {
      const next: string[] = [];
      for (const node of frontier) {
        if (visited.has(node)) continue;
        visited.add(node);
        for (const neighbor of this.getNeighbors(node)) {
          if (!visited.has(neighbor)) next.push(neighbor);
        }
      }
      frontier = next;
    }

    for (const seed of seeds) {
      visited.delete(seed.replace(/\\/g, "/"));
    }

    return [...visited];
  }

  async save(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const payload: GraphFile = {
      meta: this.meta,
      nodes: [...this.nodes],
      edges: this.edges,
    };
    await writeFile(this.graphPath(), JSON.stringify(payload), "utf8");
  }
}
