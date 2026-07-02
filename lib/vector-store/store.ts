import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import type { DocumentChunk } from "@/lib/indexer/chunk";
import { getConfig } from "@/lib/config";
import {
  chunkToPointId,
  createQdrantClient,
  ensureCollection,
  recreateCollection,
} from "@/lib/vector-store/qdrant";

export interface IndexedChunk extends DocumentChunk {
  embedding: number[];
}

export interface StoreMeta {
  indexedAt: string;
  chunkCount: number;
}

interface VectorMetaFile {
  meta: StoreMeta;
}

interface ChunkPayload extends Record<string, unknown> {
  id: string;
  path: string;
  title: string;
  content: string;
  startLine: number;
}

const UPSERT_BATCH = 128;
const SCROLL_BATCH = 256;

function payloadFromChunk(chunk: IndexedChunk): ChunkPayload {
  return {
    id: chunk.id,
    path: chunk.path,
    title: chunk.title,
    content: chunk.content,
    startLine: chunk.startLine,
  };
}

function chunkFromRecord(
  payload: ChunkPayload,
  embedding: number[],
): IndexedChunk {
  return {
    id: payload.id,
    path: payload.path,
    title: payload.title,
    content: payload.content,
    startLine: payload.startLine,
    embedding,
  };
}

function normalizeScrollOffset(
  value: string | number | Record<string, unknown> | null | undefined,
): string | number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "number") return value;
  return undefined;
}

export class VectorStore {
  private meta: StoreMeta = {
    indexedAt: "",
    chunkCount: 0,
  };

  constructor(
    private readonly dataDir: string,
    private readonly qdrantUrl: string,
    private readonly collection: string,
  ) {}

  static async load(dataDir?: string): Promise<VectorStore> {
    const config = getConfig();
    const store = new VectorStore(
      dataDir ?? config.dataDir,
      config.qdrantUrl,
      config.qdrantCollection,
    );
    await store.readMetaFromDisk();
    await ensureCollection(store.client(), store.collection);
    return store;
  }

  private client() {
    return createQdrantClient(this.qdrantUrl);
  }

  private metaPath(): string {
    return path.join(this.dataDir, "vector-meta.json");
  }

  private async readMetaFromDisk(): Promise<void> {
    try {
      const raw = await readFile(this.metaPath(), "utf8");
      const parsed = JSON.parse(raw) as VectorMetaFile;
      this.meta = parsed.meta;
    } catch {
      this.meta = { indexedAt: "", chunkCount: 0 };
    }
  }

  private async saveMeta(): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const payload: VectorMetaFile = { meta: this.meta };
    await writeFile(this.metaPath(), JSON.stringify(payload, null, 2), "utf8");
  }

  getMeta(): StoreMeta {
    return this.meta;
  }

  async replaceAll(chunks: IndexedChunk[]): Promise<void> {
    const client = this.client();
    await recreateCollection(client, this.collection);

    for (let i = 0; i < chunks.length; i += UPSERT_BATCH) {
      const batch = chunks.slice(i, i + UPSERT_BATCH);
      await client.upsert(this.collection, {
        wait: true,
        points: batch.map((chunk) => ({
          id: chunkToPointId(chunk.id),
          vector: chunk.embedding,
          payload: payloadFromChunk(chunk),
        })),
      });
      if (i > 0 && i % 512 === 0) {
        console.log(`[qdrant] upserted ${Math.min(i + UPSERT_BATCH, chunks.length)}/${chunks.length}`);
      }
    }

    this.meta = {
      indexedAt: new Date().toISOString(),
      chunkCount: chunks.length,
    };
    await this.saveMeta();
  }

  async search(queryEmbedding: number[], topK: number): Promise<IndexedChunk[]> {
    if (this.meta.chunkCount === 0) return [];

    const client = this.client();
    const response = await client.search(this.collection, {
      vector: queryEmbedding,
      limit: topK,
      with_payload: true,
      with_vector: true,
    });

    return response
      .map((point) => {
        const payload = point.payload as ChunkPayload | null | undefined;
        if (!payload || !point.vector) return null;
        const embedding = Array.isArray(point.vector)
          ? point.vector.map(Number)
          : Object.values(point.vector as Record<string, number>).map(Number);
        return chunkFromRecord(payload, embedding);
      })
      .filter((chunk): chunk is IndexedChunk => chunk !== null);
  }

  async getChunksByPaths(paths: string[]): Promise<IndexedChunk[]> {
    if (paths.length === 0 || this.meta.chunkCount === 0) return [];

    const normalized = [...new Set(paths.map((item) => item.replace(/\\/g, "/")))];
    const client = this.client();
    const chunks: IndexedChunk[] = [];

    for (let i = 0; i < normalized.length; i += 32) {
      const batch = normalized.slice(i, i + 32);
      const response = await client.scroll(this.collection, {
        filter: {
          should: batch.map((filePath) => ({
            key: "path",
            match: { value: filePath },
          })),
        },
        limit: SCROLL_BATCH,
        with_payload: true,
        with_vector: true,
      });

      for (const point of response.points) {
        const payload = point.payload as ChunkPayload | null | undefined;
        if (!payload || !point.vector) continue;
        const embedding = Array.isArray(point.vector)
          ? point.vector.map(Number)
          : Object.values(point.vector as Record<string, number>).map(Number);
        chunks.push(chunkFromRecord(payload, embedding));
      }
    }

    return chunks.sort(
      (a, b) => a.path.localeCompare(b.path) || a.startLine - b.startLine,
    );
  }

  async getAllChunks(): Promise<IndexedChunk[]> {
    if (this.meta.chunkCount === 0) return [];

    const client = this.client();
    const chunks: IndexedChunk[] = [];
    let offset: string | number | undefined;

    while (true) {
      const response = await client.scroll(this.collection, {
        limit: SCROLL_BATCH,
        offset,
        with_payload: true,
        with_vector: true,
      });

      for (const point of response.points) {
        const payload = point.payload as ChunkPayload | null | undefined;
        if (!payload || !point.vector) continue;
        const embedding = Array.isArray(point.vector)
          ? point.vector.map(Number)
          : Object.values(point.vector as Record<string, number>).map(Number);
        chunks.push(chunkFromRecord(payload, embedding));
      }

      if (response.points.length < SCROLL_BATCH) break;
      offset = normalizeScrollOffset(response.next_page_offset);
      if (offset === undefined) break;
    }

    return chunks;
  }

  /** All chunks from pages that match any of the given ISO dates (title or body). */
  async findChunksForDates(dates: string[]): Promise<IndexedChunk[]> {
    if (dates.length === 0 || this.meta.chunkCount === 0) return [];

    const all = await this.scrollPayloadOnly();
    const matches = all.filter((chunk) =>
      dates.some((date) => chunk.title.includes(date) || chunk.content.includes(date)),
    );
    if (matches.length === 0) return [];

    const paths = new Set(matches.map((chunk) => chunk.path));
    return all
      .filter((chunk) => paths.has(chunk.path))
      .map((chunk) => ({ ...chunk, embedding: [] as number[] }))
      .sort(
        (a, b) => a.path.localeCompare(b.path) || a.startLine - b.startLine,
      );
  }

  private async scrollPayloadOnly(): Promise<IndexedChunk[]> {
    const client = this.client();
    const chunks: IndexedChunk[] = [];
    let offset: string | number | undefined;

    while (true) {
      const response = await client.scroll(this.collection, {
        limit: SCROLL_BATCH,
        offset,
        with_payload: true,
        with_vector: false,
      });

      for (const point of response.points) {
        const payload = point.payload as ChunkPayload | null | undefined;
        if (!payload) continue;
        chunks.push({ ...payload, embedding: [] });
      }

      if (response.points.length < SCROLL_BATCH) break;
      offset = normalizeScrollOffset(response.next_page_offset);
      if (offset === undefined) break;
    }

    return chunks;
  }

  /** Export snapshot for Obsidian plugin offline mode. */
  async exportSnapshot(): Promise<{ meta: StoreMeta; chunks: IndexedChunk[] }> {
    const chunks = await this.getAllChunks();
    return { meta: this.meta, chunks };
  }
}
