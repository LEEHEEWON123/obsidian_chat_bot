import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";

import type { DocumentChunk } from "@/lib/indexer/chunk";
import { getConfig } from "@/lib/config";
import {
  hasPathScope,
  matchesPathScope,
  rootFoldersFromScope,
  type PathScope,
} from "@/lib/rag/path-scope";
import { scoreKeywordMatch } from "@/lib/rag/query-hints";
import {
  chunkToPointId,
  createQdrantClient,
  ensureCollection,
  recreateCollection,
} from "@/lib/vector-store/qdrant";
import { rootFolderFromPath } from "@/lib/vector-store/payload";

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
  pageNumber?: number;
  rootFolder?: string;
}

const UPSERT_BATCH = 32;
const SCROLL_BATCH = 256;

/** Strip chars that break Qdrant's JSON parser (Rust serde). */
function sanitizePayloadText(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += text[i] + text[i + 1];
        i++;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) continue;
    out += text[i];
  }
  return out;
}

function payloadFromChunk(chunk: IndexedChunk): ChunkPayload {
  const path = sanitizePayloadText(chunk.path);
  const payload: ChunkPayload = {
    id: chunk.id,
    path,
    title: sanitizePayloadText(chunk.title),
    content: sanitizePayloadText(chunk.content),
    startLine: chunk.startLine,
    rootFolder: rootFolderFromPath(path),
  };
  if (chunk.pageNumber !== undefined) {
    payload.pageNumber = chunk.pageNumber;
  }
  return payload;
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
    pageNumber:
      typeof payload.pageNumber === "number" ? payload.pageNumber : undefined,
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

  private async upsertChunksInternal(chunks: IndexedChunk[]): Promise<number> {
    if (chunks.length === 0) return 0;

    const client = this.client();
    await ensureCollection(client, this.collection);

    let upserted = 0;
    for (let i = 0; i < chunks.length; i += UPSERT_BATCH) {
      const batch = chunks.slice(i, i + UPSERT_BATCH);
      try {
        await client.upsert(this.collection, {
          wait: true,
          points: batch.map((chunk) => ({
            id: chunkToPointId(chunk.id),
            vector: chunk.embedding,
            payload: payloadFromChunk(chunk),
          })),
        });
        upserted += batch.length;
      } catch {
        console.warn(
          `[qdrant] batch upsert failed at ${i}, retrying one-by-one...`,
        );
        for (const chunk of batch) {
          try {
            await client.upsert(this.collection, {
              wait: true,
              points: [
                {
                  id: chunkToPointId(chunk.id),
                  vector: chunk.embedding,
                  payload: payloadFromChunk(chunk),
                },
              ],
            });
            upserted++;
          } catch (pointError) {
            const message =
              pointError instanceof Error ? pointError.message : String(pointError);
            console.warn(`[qdrant] skip point path=${chunk.path}: ${message}`);
          }
        }
      }

      if (upserted > 0 && upserted % 512 < UPSERT_BATCH) {
        console.log(`[qdrant] upserted ${upserted}/${chunks.length}`);
      }
    }

    return upserted;
  }

  async upsertChunks(chunks: IndexedChunk[]): Promise<void> {
    const upserted = await this.upsertChunksInternal(chunks);
    if (upserted === 0) return;

    this.meta = {
      indexedAt: new Date().toISOString(),
      chunkCount: this.meta.chunkCount + upserted,
    };
    await this.saveMeta();
  }

  async deleteByPaths(paths: string[]): Promise<void> {
    if (paths.length === 0) return;

    const normalized = [...new Set(paths.map((item) => item.replace(/\\/g, "/")))];
    const client = this.client();
    await ensureCollection(client, this.collection);

    const existing = await this.getChunksByPaths(normalized);
    if (existing.length === 0) return;

    await client.delete(this.collection, {
      wait: true,
      filter: {
        should: normalized.map((filePath) => ({
          key: "path",
          match: { value: filePath },
        })),
      },
    });

    this.meta = {
      indexedAt: new Date().toISOString(),
      chunkCount: Math.max(0, this.meta.chunkCount - existing.length),
    };
    await this.saveMeta();
  }

  async patchChunks(options: {
    deletePaths: string[];
    upsert: IndexedChunk[];
  }): Promise<void> {
    await this.deleteByPaths(options.deletePaths);
    const upserted = await this.upsertChunksInternal(options.upsert);
    if (upserted > 0) {
      this.meta = {
        indexedAt: new Date().toISOString(),
        chunkCount: this.meta.chunkCount + upserted,
      };
      await this.saveMeta();
    }
  }

  async replaceAll(chunks: IndexedChunk[]): Promise<void> {
    const client = this.client();
    await recreateCollection(client, this.collection);

    const upserted = await this.upsertChunksInternal(chunks);

    this.meta = {
      indexedAt: new Date().toISOString(),
      chunkCount: upserted,
    };
    await this.saveMeta();
  }

  async search(
    queryEmbedding: number[],
    topK: number,
    scope?: PathScope,
  ): Promise<IndexedChunk[]> {
    if (this.meta.chunkCount === 0) return [];

    const client = this.client();
    const rootFolder = rootFoldersFromScope(scope ?? {})[0];
    const oversample = hasPathScope(scope ?? {}) ? 4 : 1;
    const response = await client.search(this.collection, {
      vector: queryEmbedding,
      limit: topK * oversample,
      with_payload: true,
      with_vector: true,
      ...(rootFolder
        ? {
            filter: {
              must: [{ key: "rootFolder", match: { value: rootFolder } }],
            },
          }
        : {}),
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
      .filter((chunk): chunk is IndexedChunk => chunk !== null)
      .filter((chunk) => matchesPathScope(chunk.path, scope ?? {}))
      .slice(0, topK);
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

  /** Keyword scan: all terms must appear in path, title, or content. */
  async findChunksByKeywords(options: {
    terms: string[];
    rootFolders?: string[];
    pathScope?: PathScope;
    limit: number;
  }): Promise<IndexedChunk[]> {
    const { terms, limit } = options;
    const pathScope = options.pathScope ?? {};
    const rootFolders =
      options.rootFolders ?? rootFoldersFromScope(pathScope);
    if (terms.length === 0 || this.meta.chunkCount === 0) return [];

    const client = this.client();
    const scored: Array<{ chunk: IndexedChunk; score: number }> = [];
    let offset: string | number | undefined;
    const scoped = hasPathScope(pathScope) || rootFolders.length > 0;
    const maxBatches = scoped ? 200 : 80;

    for (let batch = 0; batch < maxBatches; batch++) {
      const response = await client.scroll(this.collection, {
        limit: SCROLL_BATCH,
        offset,
        with_payload: true,
        with_vector: true,
        ...(rootFolders.length === 1
          ? {
              filter: {
                must: [{ key: "rootFolder", match: { value: rootFolders[0] } }],
              },
            }
          : {}),
      });

      for (const point of response.points) {
        const payload = point.payload as ChunkPayload | null | undefined;
        if (!payload || !point.vector) continue;

        if (!matchesPathScope(payload.path, pathScope)) continue;

        const embedding = Array.isArray(point.vector)
          ? point.vector.map(Number)
          : Object.values(point.vector as Record<string, number>).map(Number);
        const chunk = chunkFromRecord(payload, embedding);
        const score = scoreKeywordMatch(chunk, terms);
        if (score > 0) scored.push({ chunk, score });
      }

      if (response.points.length < SCROLL_BATCH) break;
      offset = normalizeScrollOffset(response.next_page_offset);
      if (offset === undefined) break;
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((item) => item.chunk);
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
