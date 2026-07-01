import { App, PluginSettingTab, Setting } from "obsidian";

import type CompanyRagPlugin from "./main";
import { DEFAULT_SETTINGS, type CompanyRagSettings } from "./types";

export class CompanyRagSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: CompanyRagPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Company RAG" });

    new Setting(containerEl)
      .setName("API base URL")
      .setDesc("Semantic search server (npm run dev). Offline = local keyword fallback.")
      .addText((text) =>
        text
          .setPlaceholder("http://localhost:3000")
          .setValue(this.plugin.settings.apiBaseUrl)
          .onChange(async (value) => {
            this.plugin.settings.apiBaseUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Top K results")
      .setDesc("Maximum search results to show")
      .addText((text) =>
        text
          .setPlaceholder("8")
          .setValue(String(this.plugin.settings.topK))
          .onChange(async (value) => {
            const parsed = Number(value);
            this.plugin.settings.topK = Number.isFinite(parsed) && parsed > 0 ? parsed : 8;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Index folder")
      .setDesc("Vault folder with vectors.json (npm run sync-index)")
      .addText((text) =>
        text
          .setPlaceholder(".company-rag")
          .setValue(this.plugin.settings.indexFolder)
          .onChange(async (value) => {
            this.plugin.settings.indexFolder = value.trim() || DEFAULT_SETTINGS.indexFolder;
            await this.plugin.saveSettings();
          }),
      );
  }
}

export async function loadSettings(plugin: CompanyRagPlugin): Promise<CompanyRagSettings> {
  return { ...DEFAULT_SETTINGS, ...(await plugin.loadData()) };
}

export async function saveSettings(
  plugin: CompanyRagPlugin,
  settings: CompanyRagSettings,
): Promise<void> {
  await plugin.saveData(settings);
}
