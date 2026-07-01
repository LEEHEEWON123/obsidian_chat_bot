import { Plugin, WorkspaceLeaf } from "obsidian";

import { CompanyRagSettingTab, loadSettings, saveSettings } from "./settings";
import type { CompanyRagSettings } from "./types";
import { LOOKUP_VIEW_TYPE, LookupView } from "./views/lookup-view";

export default class CompanyRagPlugin extends Plugin {
  settings!: CompanyRagSettings;

  async onload(): Promise<void> {
    this.settings = await loadSettings(this);

    this.registerView(LOOKUP_VIEW_TYPE, (leaf) => new LookupView(leaf, this));

    this.addRibbonIcon("search", "Company RAG", () => {
      void this.activateLookup();
    });

    this.addCommand({
      id: "open-company-rag",
      name: "Open semantic search",
      callback: () => {
        void this.activateLookup();
      },
    });

    this.addCommand({
      id: "reload-company-rag-index",
      name: "Reload search index",
      callback: () => {
        void this.reloadLookupIndex();
      },
    });

    this.addSettingTab(new CompanyRagSettingTab(this.app, this));
  }

  async saveSettings(): Promise<void> {
    await saveSettings(this, this.settings);
  }

  private async activateLookup(): Promise<void> {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(LOOKUP_VIEW_TYPE)[0];

    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (!leaf) return;
      await leaf.setViewState({ type: LOOKUP_VIEW_TYPE, active: true });
    }

    workspace.revealLeaf(leaf);
  }

  private async reloadLookupIndex(): Promise<void> {
    const leaf = this.app.workspace.getLeavesOfType(LOOKUP_VIEW_TYPE)[0];
    if (!leaf) return;
    const view = leaf.view;
    if (view instanceof LookupView) {
      await view.reloadIndex();
    }
  }
}
