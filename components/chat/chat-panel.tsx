"use client";

import { useEffect, useState } from "react";

import { ConversationView } from "./conversation-view";
import { SetupView } from "./setup-view";
import {
  type HealthStatus,
  type Message,
  type PanelView,
  type Source,
  resolvePanelView,
} from "./types";

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatIndexedAt(iso: string): string {
  return new Date(iso).toLocaleString();
}

function statusLabel(view: PanelView, health: HealthStatus | null): string {
  if (view === "loading") return "상태 확인 중…";
  if (view === "health_error") return "상태 확인 실패";
  if (view === "config_missing") return "환경 설정 필요";
  if (view === "indexing") return "인덱싱 중…";
  if (view === "no_index") return "인덱스 없음";
  if (health?.chunkCount) return `${health.chunkCount} chunks indexed`;
  return "준비됨";
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [indexedAtLabel, setIndexedAtLabel] = useState<string | null>(null);

  const view = resolvePanelView({
    healthLoading,
    healthError,
    health,
    indexing,
  });

  async function loadHealth() {
    setHealthLoading(true);
    setHealthError(null);

    try {
      const response = await fetch("/api/health", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Health check failed (${response.status})`);
      }
      const data = (await response.json()) as HealthStatus;
      setHealth(data);
    } catch (loadError) {
      setHealth(null);
      setHealthError(
        loadError instanceof Error
          ? loadError.message
          : "상태 확인에 실패했습니다",
      );
    } finally {
      setHealthLoading(false);
    }
  }

  useEffect(() => {
    void loadHealth();
  }, []);

  useEffect(() => {
    if (health?.indexedAt) {
      setIndexedAtLabel(formatIndexedAt(health.indexedAt));
    } else {
      setIndexedAtLabel(null);
    }
  }, [health?.indexedAt]);

  async function handleIndex() {
    setIndexing(true);
    setError(null);

    try {
      const response = await fetch("/api/index", { method: "POST" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Indexing failed");
      }

      if (Array.isArray(data.warnings) && data.warnings.length > 0 && !data.chunkCount) {
        setError(
          `인덱싱 실패 (0 chunks). VAULT_PATH와 md 파일 확인 후 Re-index 하세요.`,
        );
      } else if (Array.isArray(data.warnings) && data.warnings.length > 0) {
        setError(
          `인덱싱 완료 (${data.chunkCount ?? 0} chunks). 경고 ${data.warnings.length}건`,
        );
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

  async function handleChatSubmit(trimmed: string) {
    const userMessage: Message = {
      id: createId(),
      role: "user",
      content: trimmed,
    };

    const assistantId = createId();
    const nextMessages = [
      ...messages,
      userMessage,
      { id: assistantId, role: "assistant" as const, content: "", sources: [] },
    ];

    setMessages(nextMessages);
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: [...messages, userMessage].map(({ role, content }) => ({
            role,
            content,
          })),
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

  const showReindexButton =
    view !== "loading" && view !== "health_error" && view !== "config_missing";

  return (
    <div className="mx-auto flex h-[calc(100vh-2rem)] w-full max-w-4xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">Company Chat Bot</h1>
          <p className="text-sm text-zinc-500" suppressHydrationWarning>
            {statusLabel(view, health)}
            {indexedAtLabel ? ` · ${indexedAtLabel}` : ""}
          </p>
        </div>
        {showReindexButton ? (
          <button
            type="button"
            onClick={() => void handleIndex()}
            disabled={indexing}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {indexing ? "Indexing..." : "Re-index"}
          </button>
        ) : null}
      </header>

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {view === "chat" ? (
        <ConversationView
          messages={messages}
          loading={loading}
          onSubmit={(message) => void handleChatSubmit(message)}
        />
      ) : (
        <SetupView
          view={view}
          healthError={healthError}
          onReindex={() => void handleIndex()}
        />
      )}
    </div>
  );
}

export type { Message, Source } from "./types";
