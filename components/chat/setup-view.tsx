import type { PanelView } from "./types";

interface SetupViewProps {
  view: Exclude<PanelView, "chat">;
  healthError: string | null;
  onReindex: () => void;
}

export function SetupView({ view, healthError, onReindex }: SetupViewProps) {
  if (view === "loading") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-12 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
        <p className="text-sm text-zinc-500">서버 상태 확인 중…</p>
      </div>
    );
  }

  if (view === "health_error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-12 text-center">
        <p className="text-sm font-medium text-zinc-900">
          서버 상태를 확인하지 못했습니다
        </p>
        <p className="max-w-md text-sm text-zinc-500">
          {healthError ?? "알 수 없는 오류"}
        </p>
        <p className="max-w-md text-xs text-zinc-400">
          `npm run dev`가 실행 중인지 확인한 뒤 페이지를 새로고침하세요.
        </p>
      </div>
    );
  }

  if (view === "config_missing") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-12 text-center">
        <p className="text-sm font-medium text-zinc-900">환경 설정이 필요합니다</p>
        <div className="max-w-md rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-900">
          <p className="mb-2">`.env.local`에 아래 항목을 설정하세요.</p>
          <ul className="list-inside list-disc space-y-1 text-amber-800">
            <li>
              <code className="text-xs">CURSOR_API_KEY</code>
            </li>
            <li>
              <code className="text-xs">VAULT_PATH</code>
            </li>
          </ul>
          <p className="mt-3 text-xs text-amber-700">
            저장 후 dev 서버를 재시작하세요.
          </p>
        </div>
      </div>
    );
  }

  if (view === "indexing") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-12 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
        <p className="text-sm font-medium text-zinc-900">문서 인덱싱 중…</p>
        <p className="max-w-md text-sm text-zinc-500">
          vault 파일을 스캔하고 임베딩합니다. 첫 실행은 수 분 걸릴 수
          있습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-12 text-center">
      <p className="text-sm font-medium text-zinc-900">인덱스가 비어 있습니다</p>
      <p className="max-w-md text-sm text-zinc-500">
        채팅을 시작하려면 vault 문서를 먼저 인덱싱해야 합니다.
      </p>
      <button
        type="button"
        onClick={onReindex}
        className="rounded-xl bg-zinc-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-zinc-700"
      >
        Re-index 시작
      </button>
    </div>
  );
}
