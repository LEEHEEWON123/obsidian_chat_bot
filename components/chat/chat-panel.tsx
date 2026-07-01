"use client";

import { useEffect, useRef, useState } from "react";

export interface Source {
  path: string;
  title: string;
  startLine: number;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

interface HealthStatus {
  chunkCount: number;
  indexedAt: string | null;
  vaultPathConfigured: boolean;
  cursorApiKeyConfigured: boolean;
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadHealth() {
    const response = await fetch("/api/health");
    const data = (await response.json()) as HealthStatus;
    setHealth(data);
  }

  useEffect(() => {
    void loadHealth();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleIndex() {
    setIndexing(true);
    setError(null);

    try {
      const response = await fetch("/api/index", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Indexing failed");
      }

      await loadHealth();
    } catch (indexError) {
      setError(
        indexError instanceof Error ? indexError.message : "Indexing failed",
      );
    } finally {
      setIndexing(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: Message = {
      id: createId(),
      role: "user",
      content: trimmed,
    };

    const assistantId = createId();
    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? "Chat request failed");
      }

      if (!response.body) {
        throw new Error("No response stream");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantContent = "";
      let sources: Source[] = [];

      setMessages((current) => [
        ...current,
        { id: assistantId, role: "assistant", content: "", sources: [] },
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const payload = JSON.parse(line.slice(6)) as {
            type: string;
            content?: string;
            sources?: Source[];
            error?: string;
          };

          if (payload.type === "sources" && payload.sources) {
            sources = payload.sources;
          }

          if (payload.type === "text" && payload.content) {
            assistantContent += payload.content;
          }

          if (payload.type === "error") {
            throw new Error(payload.error ?? "Chat stream failed");
          }

          setMessages((current) =>
            current.map((message) =>
              message.id === assistantId
                ? {
                    ...message,
                    content: assistantContent,
                    sources,
                  }
                : message,
            ),
          );
        }
      }
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : "Chat failed");
      setMessages((current) => current.filter((message) => message.id !== assistantId));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-4xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Obsidian Chat Bot</h1>
          <p className="text-sm text-zinc-500">
            {health?.chunkCount
              ? `${health.chunkCount} chunks indexed`
              : "No index yet"}
            {health?.indexedAt
              ? ` · ${new Date(health.indexedAt).toLocaleString()}`
              : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleIndex()}
          disabled={indexing}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {indexing ? "Indexing..." : "Re-index vault"}
        </button>
      </header>

      {!health?.vaultPathConfigured || !health?.cursorApiKeyConfigured ? (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          `.env.local`에 `VAULT_PATH`와 `CURSOR_API_KEY`를 설정한 뒤 재인덱싱하세요.
        </div>
      ) : null}

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
            vault를 인덱싱한 뒤 회사 문서에 대해 질문해 보세요.
          </div>
        ) : null}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 whitespace-pre-wrap ${
                message.role === "user"
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-900"
              }`}
            >
              {message.content || (loading ? "..." : "")}
              {message.role === "assistant" && message.sources?.length ? (
                <div className="mt-3 border-t border-zinc-200 pt-3 text-xs text-zinc-600">
                  <p className="mb-1 font-medium">Sources</p>
                  <ul className="space-y-1">
                    {message.sources.map((source) => (
                      <li key={`${source.path}-${source.startLine}`}>
                        {source.path}
                        {source.startLine ? `#L${source.startLine}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(event) => void handleSubmit(event)}
        className="border-t border-zinc-200 px-5 py-4"
      >
        <div className="flex gap-3">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="회사 문서에 대해 질문하세요..."
            className="flex-1 rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none ring-zinc-900 focus:ring-2"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
