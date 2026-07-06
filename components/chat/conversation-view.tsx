"use client";

import { useEffect, useRef, useState } from "react";

import type { Message, Source } from "./types";

function sourceLocation(source: Source): string | null {
  if (source.path.toLowerCase().endsWith(".pdf") && source.pageNumber) {
    return `#page=${source.pageNumber}`;
  }
  if (source.startLine) {
    return `#L${source.startLine}`;
  }
  return null;
}

interface ConversationViewProps {
  messages: Message[];
  loading: boolean;
  onSubmit: (message: string) => void;
}

export function ConversationView({
  messages,
  loading,
  onSubmit,
}: ConversationViewProps) {
  const [input, setInput] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading || isComposing) return;
    onSubmit(trimmed);
    setInput("");
  }

  return (
    <>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {messages.length === 0 && !loading ? (
          <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center text-sm text-zinc-500">
            회사 문서에 대해 질문해 보세요.
          </div>
        ) : null}

        {messages.map((message, index) => {
          const isPendingAssistant =
            loading &&
            message.role === "assistant" &&
            !message.content &&
            index === messages.length - 1;

          return (
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
              {message.content ? (
                message.content
              ) : isPendingAssistant ? (
                <span className="inline-flex gap-1 text-zinc-400">
                  <span className="animate-bounce [animation-delay:0ms]">·</span>
                  <span className="animate-bounce [animation-delay:150ms]">·</span>
                  <span className="animate-bounce [animation-delay:300ms]">·</span>
                </span>
              ) : null}
              {message.role === "assistant" && message.sources?.length ? (
                <div className="mt-3 border-t border-zinc-200 pt-3 text-xs text-zinc-600">
                  <p className="mb-2 font-medium">Sources</p>
                  <ol className="list-decimal space-y-1 pl-5">
                    {message.sources.map((source) => (
                      <li
                        key={`${source.path}-${source.startLine}`}
                        className="text-zinc-700"
                      >
                        <span className="font-medium text-zinc-800">
                          {source.title || source.path}
                        </span>
                        {sourceLocation(source) ? (
                          <span className="text-zinc-400">
                            {" "}
                            {sourceLocation(source)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>
          </div>
          );
        })}

        {loading &&
        messages.at(-1)?.role === "assistant" &&
        !messages.at(-1)?.content ? (
          <p className="text-center text-xs text-zinc-400">
            문서 검색 및 답변 생성 중… (보통 10~60초)
          </p>
        ) : null}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="border-t border-zinc-200 px-5 py-4"
      >
        <div className="flex gap-3">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={(event) => {
              setIsComposing(false);
              setInput(event.currentTarget.value);
            }}
            placeholder="회사 문서에 대해 질문하세요..."
            className="flex-1 rounded-xl border border-zinc-300 px-4 py-3 text-sm outline-none ring-zinc-900 focus:ring-2"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || isComposing || !input.trim()}
            className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "전송 중…" : "Send"}
          </button>
        </div>
      </form>
    </>
  );
}
