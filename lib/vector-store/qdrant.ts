import { createHash } from "crypto";

import { QdrantClient } from "@qdrant/js-client-rest";

import { EMBEDDING_DIMENSION } from "@/lib/embeddings/local";
import { DENSE_VECTOR_NAME, SPARSE_VECTOR_NAME } from "@/lib/sparse/bm25-text";

export { EMBEDDING_DIMENSION, DENSE_VECTOR_NAME, SPARSE_VECTOR_NAME };

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
  if (!exists) {
    await client.createCollection(collection, {
      vectors: {
        [DENSE_VECTOR_NAME]: {
          size: EMBEDDING_DIMENSION,
          distance: "Cosine",
        },
      },
      sparse_vectors: {
        [SPARSE_VECTOR_NAME]: {
          modifier: "idf",
        },
      },
    });
  }

  await ensurePayloadIndexes(client, collection);
}

async function ensurePayloadIndexes(
  client: QdrantClient,
  collection: string,
): Promise<void> {
  const textFields = ["path", "title", "content"] as const;
  for (const field of textFields) {
    try {
      await client.createPayloadIndex(collection, {
        field_name: field,
        field_schema: "text",
      });
    } catch {
      // Index already exists or collection is still warming up.
    }
  }

  try {
    await client.createPayloadIndex(collection, {
      field_name: "rootFolder",
      field_schema: "keyword",
    });
  } catch {
    // Index already exists.
  }
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
