import { html } from "lit";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import type { SettingsAppState } from "../settings-types.ts";
import { CHANGELOG_TEXT } from "../settings-data.ts";
import {
  openChangelogModal,
  closeChangelogModal,
} from "../app-modals.ts";
import { renderModal } from "../components/modal.ts";
import { iconRefreshCw, iconFileText, iconLoader, iconX } from "../icons-v2.ts";
import {
  checkForUpdates,
  getUpdateState,
  downloadAndInstallUpdate,
} from "../settings-backend.ts";
import aivologo from "../../assets/aivologo.png";

/**
 * 检查更新（调用真实 IPC）
 */
async function handleCheckUpdate(app: SettingsAppState) {
  app.checkingUpdate = true;
  app.updateStatus = "checking";
  app.requestUpdate();

  checkForUpdates();

  // 轮询获取更新状态
  let attempts = 0;
  const poll = setInterval(async () => {
    attempts++;
    const state = await getUpdateState();
    if (state) {
      app.updateStatus = state.status;
      app.updateVersion = state.version;
    }

    // 超时或状态已确定时停止轮询
    if (attempts > 15 || (state && state.status !== "hidden")) {
      clearInterval(poll);
      app.checkingUpdate = false;
      app.requestUpdate();
    }
  }, 1000);
}

/**
 * 下载并安装更新
 */
async function handleDownloadUpdate(app: SettingsAppState) {
  app.updateStatus = "downloading";
  app.requestUpdate();
  await downloadAndInstallUpdate();
}

export function renderSettingsAbout(app: SettingsAppState) {
  const version = app.aivoClawVersion || "未知";
  const openClawVer = app.openClawVersion || "未知";
  const updateStatus = app.updateStatus || "hidden";

  // 状态文本
  let statusText = "点击检查是否有新版本";
  let statusClass = "";
  if (app.checkingUpdate) {
    statusText = "正在检查更新...";
  } else if (updateStatus === "available") {
    statusText = `发现新版本 ${app.updateVersion || ""}`;
    statusClass = "warn";
  } else if (updateStatus === "downloading") {
    statusText = "正在下载更新...";
  } else if (updateStatus === "done") {
    statusText = "更新已下载，重启即可生效";
    statusClass = "success";
  } else if (updateStatus === "hidden") {
    statusText = "当前已是最新版本";
    statusClass = "success";
  }

  return html`
    <section class="settings-about-page">
      <div class="settings-about-header">
        <img src="${aivologo}" alt="AivoClaw CE" class="settings-about-icon">
        <div class="settings-about-heading">
          <h1 class="settings-page-title" style="font-size:20px;">AivoClaw CE</h1>
          <div class="settings-about-version">Version ${version}</div>
        </div>
      </div>

      <div class="settings-surface-card">
        <div class="settings-surface-head">
          <div class="settings-surface-copy" style="flex:1;">
            <div class="settings-surface-title">检查更新</div>
            <div class="settings-about-status ${statusClass}">
              ${statusText}
            </div>
          </div>
          ${updateStatus === "available"
            ? html`
                <button class="settings-button settings-button-primary"
                  @click=${() => handleDownloadUpdate(app)}>
                  下载更新
                </button>
              `
            : html`
                <button class="settings-button settings-button-secondary"
                  ?disabled=${app.checkingUpdate || updateStatus === "downloading"}
                  @click=${() => handleCheckUpdate(app)}>
                  ${app.checkingUpdate
                    ? html`${iconLoader("icon-sm icon-spin")} 检查中...`
                    : html`${iconRefreshCw("icon-sm")} 检查更新`}
                </button>
              `}
        </div>
      </div>

      <div class="settings-surface-card">
        <div class="settings-surface-head">
          <div class="settings-surface-copy" style="flex:1;">
            <div class="settings-surface-title">版本信息</div>
            <div class="settings-surface-hint">
              AivoClaw CE ${version}
            </div>
          </div>
          <button class="settings-button settings-button-secondary"
            @click=${() => openChangelogModal(app)}>
            ${iconFileText("icon-sm")} Changelog
          </button>
        </div>
      </div>

      ${renderModal(
        app.changelogModalOpen,
        () => closeChangelogModal(app),
        html`
          <div class="channel-modal-header">
            <h2 class="channel-modal-title">更新日志 · v${version}</h2>
            <button class="channels-btn channels-btn-sm" @click=${() => closeChangelogModal(app)}>${iconX()}</button>
          </div>
          <div class="channel-modal-body">
            <div class="settings-about-changelog-body">
              ${unsafeHTML(CHANGELOG_TEXT)}
            </div>
          </div>
          <div class="channel-modal-footer">
            <div style="flex:1;"></div>
            <button class="channels-btn channels-btn-outline" @click=${() => closeChangelogModal(app)}>关闭</button>
          </div>
        `,
        "520px"
      )}

      <div class="settings-about-footer">
        &copy; 2026 AivoClaw CE Team
      </div>
    </section>
  `;
}
