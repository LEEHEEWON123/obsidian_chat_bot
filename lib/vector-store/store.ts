import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import type { DocumentChunk } from "@/lib/indexer/chunk";

export interface IndexedChunk extends DocumentChunk {
  embedding: number[];
}

interface StoreMeta {
  indexedAt: string;
  chunkCount: number;
}

interface StoreFile {
  meta: StoreMeta;
  chunks: IndexedChunk[];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

export class VectorStore {
  private chunks: IndexedChunk[] = [];
  private meta: StoreMeta = {
    indexedAt: "",
    chunkCount: 0,
  };

  constructor(private readonly dataDir: string) {}

  static async load(dataDir: string): Promise<VectorStore> {
    const store = new VectorStore(dataDir);
    await store.readFromDisk();
    return store;
  }

  private storePath(): string {
    return path.join(this.dataDir, "vectors.json");
  }

  private async readFromDisk(): Promise<void> {
    try {
      const raw = await readFile(this.storePath(), "utf8");
      const parsed = JSON.parse(raw) as StoreFile;
      this.chunks = parsed.chunks;
      this.meta = parsed.meta;
    } catch {
      this.chunks = [];
      this.meta = { indexedAt: "", chunkCount: 0 };
    }
  }

  replaceAll(chunks: IndexedChunk[]): void {
    this.chunks = chunks;
    this.meta = {
      indexedAt: new Date().toISOString(),
      chunkCount: chunks.length,
    };
  }

  getMeta(): StoreMeta {
    return this.meta;
  }

  getAllChunks(): IndexedChunk[] {
    return this.chunks;
  }

  /** All chunks from pages that match any of the given ISO dates (title or body). */
  findChunksForDates(dates: string[]): IndexedChunk[] {
    if (dates.length === 0) return [];

    const matches = this.chunks.filter((chunk) =>
      dates.some((date) => chunk.title.includes(date) || chunk.content.includes(date)),
    );
    if (matches.length === 0) return [];

    const paths = new Set(matches.map((chunk) => chunk.path));
    return this.chunks
      .filter((chunk) => paths.has(chunk.path))
      .sort(
        (a, b) =>
          a.path.localeCompare(b.path) || a.startLine - b.startLine,
      );
  }

  search(queryEmbedding: number[], topK: number): IndexedChunk[] {
    return [...this.chunks]
      .map((chunk) => ({
        chunk,
        score: cosineSimilarity(queryEmbedding, chunk.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ chunk }) => chunk);
  }

  async save(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const payload: StoreFile = {
      meta: this.meta,
      chunks: this.chunks,
    };
    await writeFile(this.storePath(), JSON.stringify(payload), "utf8");
  }
}
