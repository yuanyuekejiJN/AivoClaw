import { html } from "lit";
import type { SettingsAppState } from "../settings-types.ts";
import { handleThemeToggle } from "../settings-actions.ts";
import { renderToggle } from "../components/toggle-switch.ts";
import {
  saveAdvancedSettings,
  installCli,
  uninstallCli,
} from "../settings-backend.ts";
import { loadSettings, saveSettings } from "../storage.ts";
import { t } from "../i18n.ts";

/**
 * 切换开机自启
 */
async function handleLaunchAtLoginToggle(app: SettingsAppState) {
  const next = !app.launchAtLogin;
  app.launchAtLogin = next;
  app.requestUpdate();
  const result = await saveAdvancedSettings({ launchAtLogin: next });
  if (!result.success) {
    // 回滚
    app.launchAtLogin = !next;
    app.requestUpdate();
  }
}

/**
 * 切换工具调用详情显示
 */
function handleToolDetailsToggle(app: SettingsAppState) {
  const current = loadSettings();
  const next = !current.chatShowToolDetails;
  if (app.applyMainSettings) {
    app.applyMainSettings({ chatShowToolDetails: next });
  } else {
    saveSettings({ ...current, chatShowToolDetails: next });
  }
  app.requestUpdate();
}

/**
 * 安装/卸载 CLI
 */
async function handleCliToggle(app: SettingsAppState) {
  if (app.cliLoading) return;
  app.cliLoading = true;
  app.requestUpdate();

  const result = app.cliInstalled
    ? await uninstallCli()
    : await installCli();

  if (result.success) {
    app.cliInstalled = !app.cliInstalled;
  }
  app.cliLoading = false;
  app.requestUpdate();
}

export function renderSettingsGeneral(app: SettingsAppState) {
  return html`
    <section class="settings-workspace-page">
      <header class="settings-page-header">
        <div class="settings-page-heading-group">
          <h1 class="settings-page-title">通用设置</h1>
          <div class="settings-page-description">管理应用的基本行为和外观偏好</div>
        </div>
      </header>

      <div class="settings-general-card">
        <div class="settings-general-row">
          <div class="settings-general-copy">
            <div class="settings-general-label">深色模式</div>
            <div class="settings-general-hint">切换应用的明暗主题</div>
          </div>
          ${renderToggle(app.theme === "dark", () => handleThemeToggle(app))}
        </div>
        <div class="settings-general-divider"></div>
        <div class="settings-general-row">
          <div class="settings-general-copy">
            <div class="settings-general-label">语言</div>
            <div class="settings-general-hint">当前语言：简体中文</div>
          </div>
          <span style="color:var(--theme-text-sec);font-size:14px;font-weight:500;">简体中文</span>
        </div>
        <div class="settings-general-divider"></div>
        <div class="settings-general-row">
          <div class="settings-general-copy">
            <div class="settings-general-label">开机自启</div>
            <div class="settings-general-hint">
              ${app.launchAtLoginSupported
                ? "系统启动时自动运行 AivoClaw CE"
                : "当前系统不支持此功能"}
            </div>
          </div>
          ${renderToggle(
            app.launchAtLogin,
            () => handleLaunchAtLoginToggle(app),
            !app.launchAtLoginSupported
          )}
        </div>
        <div class="settings-general-divider"></div>
        <div class="settings-general-row">
          <div class="settings-general-copy">
            <div class="settings-general-label">CLI 命令行工具</div>
            <div class="settings-general-hint">
              ${app.cliInstalled
                ? "openclaw 命令已安装到 PATH"
                : "安装 openclaw 命令到系统 PATH"}
            </div>
          </div>
          <button
            class="settings-button ${app.cliInstalled ? 'settings-button-secondary' : 'settings-button-primary'}"
            style="min-width:80px;"
            ?disabled=${app.cliLoading}
            @click=${() => handleCliToggle(app)}>
            ${app.cliLoading
              ? "处理中..."
              : app.cliInstalled ? "卸载" : "安装"}
          </button>
        </div>
        <div class="settings-general-divider"></div>
        <div class="settings-general-row">
          <div class="settings-general-copy">
            <div class="settings-general-label">${t("settings.showToolDetails")}</div>
            <div class="settings-general-hint">${t("settings.showToolDetailsDesc")}</div>
          </div>
          ${renderToggle(
            loadSettings().chatShowToolDetails,
            () => handleToolDetailsToggle(app),
          )}
        </div>
      </div>
    </section>
  `;
}
