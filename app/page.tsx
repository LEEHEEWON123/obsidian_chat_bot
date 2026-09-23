export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6 py-12 text-zinc-800">
      <h1 className="text-2xl font-semibold tracking-tight">Obsidian Chat Bot</h1>
      <p className="text-sm leading-relaxed text-zinc-600">
        채팅 UI는 Hermes Workspace (<code className="text-xs">npm run workspace:dev</code> →
        localhost:3000)를 사용하세요. 이 서버(:3001)는 Obsidian 플러그인용{" "}
        <code className="text-xs">/api/search</code> · <code className="text-xs">/api/health</code>{" "}
        만 제공합니다.
      </p>
      <ul className="list-inside list-disc text-sm text-zinc-600">
        <li>
          <a className="underline" href="/api/health">
            /api/health
          </a>
        </li>
        <li>POST /api/search</li>
      </ul>
    </main>
  );
}
