import { pipeline, type FeatureExtractionPipeline } from "@xenova/transformers";

/** BGE-M3 dense vectors (multilingual, strong Korean retrieval). */
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "Xenova/bge-m3";
export const EMBEDDING_DIMENSION = 1024;

const EMBED_BATCH_SIZE = Number(process.env.EMBED_BATCH_SIZE ?? 8);

let extractor: FeatureExtractionPipeline | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", EMBEDDING_MODEL);
  }
  return extractor;
}

function tensorToVectors(output: { dims: number[]; data: ArrayLike<number> }): number[][] {
  const data = output.data;
  const dims = output.dims;

  if (dims.length === 1) {
    return [Array.from(data).map(Number)];
  }

  const hidden = dims[dims.length - 1];
  const batch = dims.length === 2 ? dims[0] : 1;
  const flat = Array.from(data);
  const vectors: number[][] = [];

  for (let i = 0; i < batch; i++) {
    const start = i * hidden;
    vectors.push(flat.slice(start, start + hidden));
  }

  return vectors;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const model = await getExtractor();
  const output = await model(texts, { pooling: "cls", normalize: true });
  return tensorToVectors(output as { dims: number[]; data: ArrayLike<number> });
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedBatch([text]);
  return vector;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    results.push(...(await embedBatch(batch)));
  }
  return results;
}
