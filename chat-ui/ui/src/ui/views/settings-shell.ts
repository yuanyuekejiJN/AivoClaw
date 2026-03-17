import { html, nothing } from "lit";
import type { SettingsAppState } from "../settings-types.ts";
import type { SettingsTab } from "../settings-types.ts";
import { SETTINGS_NAV } from "../settings-navigation.ts";
import { iconMap, iconArrowLeft } from "../icons-v2.ts";
import { closeSettings, setSettingsTab } from "../settings-actions.ts";
import { renderSettingsGeneral } from "./settings-general.ts";
import { renderSettingsUsage } from "./settings-usage.ts";
import { renderSettingsPoints } from "./settings-points.ts";
import { renderSettingsModels } from "./settings-models.ts";
import { renderSettingsMcp } from "./settings-mcp.ts";
import { renderSettingsSkills } from "./settings-skills.ts";
import { renderSettingsChannels } from "./settings-channels.ts";
import { renderSettingsWorkspace } from "./settings-workspace.ts";
import { renderSettingsPrivacy } from "./settings-privacy.ts";
import { renderSettingsFeedback } from "./settings-feedback.ts";
import { renderSettingsAbout } from "./settings-about.ts";

const panelMap: Record<SettingsTab, (app: SettingsAppState) => ReturnType<typeof html>> = {
  general: renderSettingsGeneral,
  usage: renderSettingsUsage,
  points: renderSettingsPoints,
  models: renderSettingsModels,
  mcp: renderSettingsMcp,
  skills: renderSettingsSkills,
  channels: renderSettingsChannels,
  workspace: renderSettingsWorkspace,
  privacy: renderSettingsPrivacy,
  feedback: renderSettingsFeedback,
  about: renderSettingsAbout,
};

export function renderSettingsShell(app: SettingsAppState) {
  const renderPanel = panelMap[app.settingsTab];

  return html`
    <div class="settings-view open">
      <nav class="settings-nav">
        <div class="settings-nav-top">
          <button class="settings-back-btn" @click=${() => closeSettings(app)}>
            ${iconArrowLeft()}
            <span>设置</span>
          </button>
        </div>
        <div class="settings-nav-list">
          ${SETTINGS_NAV.map(
            (entry) => html`
              <button
                class="settings-nav-item ${app.settingsTab === entry.key ? "active" : ""}"
                @click=${() => setSettingsTab(app, entry.key)}
              >
                ${iconMap[entry.icon]?.() ?? nothing}${entry.label}
              </button>
            `
          )}
        </div>
      </nav>

      <div class="settings-workbench">
        <div class="settings-workbench-scroll">
          <div class="settings-workbench-inner">
            <div class="settings-panel active">
              ${renderPanel ? renderPanel(app) : nothing}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
