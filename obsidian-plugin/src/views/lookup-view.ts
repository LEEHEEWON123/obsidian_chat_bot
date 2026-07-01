import { ItemView, Notice, TFile, WorkspaceLeaf, requestUrl } from "obsidian";

import type CompanyRagPlugin from "../main";
import { parseGraph, type GraphFile } from "../rag/graph";
import {
  expandLocalWithGraph,
  parseStore,
  scoreToPercent,
  searchLocalStore,
} from "../rag/search";
import type { SearchResult, StoreFile } from "../types";

export const LOOKUP_VIEW_TYPE = "company-rag-lookup";

export class LookupView extends ItemView {
  private queryInput!: HTMLInputElement;
  private statusEl!: HTMLDivElement;
  private resultsEl!: HTMLDivElement;
  private store: StoreFile | null = null;
  private graph: GraphFile | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: CompanyRagPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return LOOKUP_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Company RAG";
  }

  getIcon(): string {
    return "search";
  }

  async onOpen(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("company-rag-root");

    const header = containerEl.createDiv({ cls: "company-rag-header" });
    header.createEl("h4", { text: "시멘틱 + 그래프 검색" });

    this.statusEl = containerEl.createDiv({ cls: "company-rag-status" });
    this.statusEl.setText("인덱스 로딩 중...");

    const form = containerEl.createEl("form", { cls: "company-rag-form" });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void this.runSearch();
    });

    this.queryInput = form.createEl("input", {
      cls: "company-rag-input",
      attr: { type: "text", placeholder: "회사 문서에 대해 질문하세요..." },
    });

    form.createEl("button", { cls: "company-rag-button", text: "검색", attr: { type: "submit" } });

    this.resultsEl = containerEl.createDiv({ cls: "company-rag-results" });

    await this.reloadIndex();
  }

  async reloadIndex(): Promise<void> {
    const folder = this.plugin.settings.indexFolder;
    const vectorsFile = `${folder}/vectors.json`;
    const graphFile = `${folder}/graph.json`;

    const vectorsAbstract = this.app.vault.getAbstractFileByPath(vectorsFile);
    if (!(vectorsAbstract instanceof TFile)) {
      this.store = null;
      this.graph = null;
      this.statusEl.setText(
        `인덱스 없음 — npm run sync-index 후 Reload 실행`,
      );
      return;
    }

    this.store = parseStore(await this.app.vault.read(vectorsAbstract));

    const graphAbstract = this.app.vault.getAbstractFileByPath(graphFile);
    if (graphAbstract instanceof TFile) {
      this.graph = parseGraph(await this.app.vault.read(graphAbstract));
    } else {
      this.graph = null;
    }

    if (!this.store || this.store.meta.chunkCount === 0) {
      this.statusEl.setText("인덱스가 비어 있습니다.");
      return;
    }

    const indexedAt = this.store.meta.indexedAt
      ? new Date(this.store.meta.indexedAt).toLocaleString()
      : "unknown";
    const graphInfo = this.graph
      ? ` · graph ${this.graph.meta.edgeCount} edges`
      : " · graph 없음 (npm run build-graph)";
    this.statusEl.setText(
      `${this.store.meta.chunkCount} chunks · ${indexedAt}${graphInfo}`,
    );
  }

  private async runSearch(): Promise<void> {
    const query = this.queryInput.value.trim();
    if (!query) return;

    this.resultsEl.empty();
    this.resultsEl.createDiv({ cls: "company-rag-loading", text: "검색 중..." });

    try {
      const results = await this.searchSemantic(query);
      this.renderResults(results);
    } catch (error) {
      this.resultsEl.empty();
      const message = error instanceof Error ? error.message : "Search failed";
      this.resultsEl.createDiv({ cls: "company-rag-error", text: message });
    }
  }

  private async searchSemantic(query: string): Promise<SearchResult[]> {
    const topK = this.plugin.settings.topK;
    const baseUrl = this.plugin.settings.apiBaseUrl.replace(/\/$/, "");

    try {
      const response = await requestUrl({
        url: `${baseUrl}/api/search`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, topK }),
        throw: false,
      });

      if (response.status >= 200 && response.status < 300) {
        const data = response.json as { results?: SearchResult[] };
        if (Array.isArray(data.results) && data.results.length > 0) {
          return data.results;
        }
      }
    } catch {
      // fall through to local
    }

    if (!this.store) {
      throw new Error(
        "API 연결 실패 + 로컬 인덱스 없음. npm run dev 및 npm run sync-index 확인",
      );
    }

    let local = searchLocalStore({ query, store: this.store, topK });
    if (local.length === 0) {
      throw new Error("로컬 키워드 검색 결과 없음. npm run dev 로 시멘틱 검색 사용");
    }

    if (this.graph) {
      local = expandLocalWithGraph({
        results: local,
        graph: this.graph,
        store: this.store,
        maxAdds: topK,
      });
    }

    new Notice("API offline — 로컬 검색 + 그래프 확장");
    return local;
  }

  private renderResults(results: SearchResult[]): void {
    this.resultsEl.empty();

    if (results.length === 0) {
      this.resultsEl.createDiv({ cls: "company-rag-empty", text: "결과 없음" });
      return;
    }

    for (const result of results) {
      const card = this.resultsEl.createDiv({ cls: "company-rag-card" });
      const percent = scoreToPercent(result.score);

      const top = card.createDiv({ cls: "company-rag-card-top" });
      top.createEl("strong", { text: result.title || result.path });

      const badges = top.createDiv({ cls: "company-rag-badges" });
      badges.createSpan({ cls: "company-rag-score", text: `${percent}%` });
      if (result.source === "graph") {
        badges.createSpan({ cls: "company-rag-badge-graph", text: "🔗 연결" });
      }

      const barTrack = card.createDiv({ cls: "company-rag-bar-track" });
      const barFill = barTrack.createDiv({ cls: "company-rag-bar-fill" });
      barFill.style.width = `${percent}%`;
      if (result.source === "graph") {
        barFill.addClass("company-rag-bar-graph");
      }

      card.createDiv({
        cls: "company-rag-path",
        text: result.path,
      });

      const preview = result.content.replace(/^#+\s+/gm, "").slice(0, 180);
      if (preview) {
        card.createDiv({ cls: "company-rag-preview", text: preview });
      }

      card.createEl("button", { text: "노트 열기", cls: "company-rag-open" });
      card.querySelector(".company-rag-open")?.addEventListener("click", () => {
        void this.openResult(result);
      });
    }
  }

  private async openResult(result: SearchResult): Promise<void> {
    let path = result.path;

    if (path.startsWith("notion://")) {
      new Notice("Notion 경로 — vault md 파일을 여세요: notion/...");
      return;
    }

    if (!path.endsWith(".md")) {
      path = `${path}.md`;
    }

    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      new Notice(`파일 없음: ${path}`);
      return;
    }

    await this.app.workspace.openLinkText(path, "", false);
  }
}
