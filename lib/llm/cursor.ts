import type { SDKAgent } from "@cursor/sdk";

type AgentConstructor = typeof import("@cursor/sdk").Agent;

async function getAgentClass(): Promise<AgentConstructor> {
  const { Agent } = await import("@cursor/sdk");
  return Agent;
}

export async function* streamCursorPrompt(options: {
  apiKey: string;
  model: string;
  prompt: string;
}): AsyncGenerator<string> {
  const text = await askCursor(options);
  if (!text) return;

  const chunkSize = 24;
  for (let i = 0; i < text.length; i += chunkSize) {
    yield text.slice(i, i + chunkSize);
  }
}

export async function* streamCursorResponse(options: {
  apiKey: string;
  model: string;
  prompt: string;
}): AsyncGenerator<string> {
  const Agent = await getAgentClass();
  const agent: SDKAgent = await Agent.create({
    apiKey: options.apiKey,
    model: { id: options.model },
    local: { cwd: process.cwd() },
  });

  try {
    const run = await agent.send(options.prompt);

    for await (const event of run.stream()) {
      if (event.type !== "assistant") continue;

      for (const block of event.message.content) {
        if (block.type === "text" && block.text) {
          yield block.text;
        }
      }
    }

    await run.wait();
  } finally {
    await agent[Symbol.asyncDispose]();
  }
}

export async function askCursor(options: {
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<string> {
  const Agent = await getAgentClass();
  const result = await Agent.prompt(options.prompt, {
    apiKey: options.apiKey,
    model: { id: options.model },
    local: { cwd: process.cwd() },
  });

  return result.result ?? "";
}
