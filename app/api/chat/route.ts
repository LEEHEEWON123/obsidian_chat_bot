import { NextResponse } from "next/server";

import { assertConfig, getConfig } from "@/lib/config";
import { streamCursorPrompt } from "@/lib/llm/cursor";
import {
  buildRagPrompt,
  retrieveRelevantChunksWithMeta,
  toSourcesFromMeta,
  type ChatMessage,
} from "@/lib/rag/pipeline";

export const runtime = "nodejs";

interface ChatRequestBody {
  message?: string;
  history?: ChatMessage[];
  /** Vault-relative path of the active note (Obsidian). Linked pages are included via graph. */
  contextPath?: string;
}

function sse(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  try {
    const config = getConfig();
    assertConfig(config);

    const body = (await request.json()) as ChatRequestBody;
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const retrieved = await retrieveRelevantChunksWithMeta({
      query: message,
      dataDir: config.dataDir,
      topK: config.topK,
      contextPath: body.contextPath?.trim() || undefined,
    });

    const chunks = retrieved.map((item) => item.chunk);

    const prompt = buildRagPrompt({
      question: message,
      chunks,
      history: body.history,
    });

    const sources = toSourcesFromMeta(retrieved);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        controller.enqueue(
          encoder.encode(sse({ type: "sources", sources })),
        );

        try {
          for await (const delta of streamCursorPrompt({
            apiKey: config.cursorApiKey,
            model: config.cursorModel,
            prompt,
          })) {
            if (delta) {
              controller.enqueue(
                encoder.encode(sse({ type: "text", content: delta })),
              );
            }
          }

          controller.enqueue(encoder.encode(sse({ type: "done" })));
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Chat failed";
          controller.enqueue(
            encoder.encode(sse({ type: "error", error: errorMessage })),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chat failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
