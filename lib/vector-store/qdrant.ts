import { createHash } from "crypto";

import { QdrantClient } from "@qdrant/js-client-rest";

export const EMBEDDING_DIMENSION = 384;

export function chunkToPointId(id: string): string {
  const hash = createHash("md5").update(id).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

export function createQdrantClient(url: string): QdrantClient {
  return new QdrantClient({ url });
}

export async function ensureCollection(
  client: QdrantClient,
  collection: string,
): Promise<void> {
  const collections = await client.getCollections();
  const exists = collections.collections.some((item) => item.name === collection);
  if (exists) return;

  await client.createCollection(collection, {
    vectors: {
      size: EMBEDDING_DIMENSION,
      distance: "Cosine",
    },
  });
}

export async function recreateCollection(
  client: QdrantClient,
  collection: string,
): Promise<void> {
  const collections = await client.getCollections();
  const exists = collections.collections.some((item) => item.name === collection);
  if (exists) {
    await client.deleteCollection(collection);
  }
  await ensureCollection(client, collection);
}
