import {
  AutoModelForSequenceClassification,
  AutoTokenizer,
  type PreTrainedModel,
  type PreTrainedTokenizer,
} from "@xenova/transformers";

import { getConfig } from "@/lib/config";
import { chunkToPassage } from "@/lib/rag/chunk-passage";
import type { IndexedChunk } from "@/lib/vector-store/store";

export interface RerankResult {
  chunk: IndexedChunk;
  score: number;
}

let tokenizer: PreTrainedTokenizer | null = null;
let model: PreTrainedModel | null = null;
let loadedModelId = "";

async function getReranker(): Promise<{
  tokenizer: PreTrainedTokenizer;
  model: PreTrainedModel;
}> {
  const config = getConfig();
  const modelId = config.rerankModel;

  if (tokenizer && model && loadedModelId === modelId) {
    return { tokenizer, model };
  }

  tokenizer = await AutoTokenizer.from_pretrained(modelId);
  model = await AutoModelForSequenceClassification.from_pretrained(modelId, {
    quantized: true,
  });
  loadedModelId = modelId;

  return { tokenizer, model };
}

function readLogitScore(
  logits: { data: ArrayLike<number>; dims: number[] },
  index: number,
): number {
  const numLabels = logits.dims[1] ?? 1;
  const data = logits.data;

  if (numLabels === 1) {
    return Number(data[index]);
  }

  return Number(data[index * numLabels + 1]);
}

export async function rerankChunks(options: {
  query: string;
  chunks: IndexedChunk[];
  topK: number;
}): Promise<RerankResult[]> {
  const { query, chunks, topK } = options;
  if (chunks.length === 0) return [];

  const config = getConfig();
  const { tokenizer, model } = await getReranker();
  const batchSize = config.rerankBatchSize;
  const scored: RerankResult[] = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const passages = batch.map((chunk) => chunkToPassage(chunk));
    const queries = passages.map(() => query);

    const inputs = tokenizer(queries, {
      text_pair: passages,
      padding: true,
      truncation: true,
    });

    const outputs = await model(inputs);
    const logits = outputs.logits as { data: ArrayLike<number>; dims: number[] };

    batch.forEach((chunk, batchIndex) => {
      scored.push({
        chunk,
        score: readLogitScore(logits, batchIndex),
      });
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}
