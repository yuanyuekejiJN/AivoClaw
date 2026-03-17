import { html } from "lit";
import type { SettingsAppState } from "../settings-types.ts";
import { renderToggle } from "../components/toggle-switch.ts";
import { iconFolderOpen } from "../icons-v2.ts";

export function renderSettingsWorkspace(_app: SettingsAppState) {
  return html`
    <section class="settings-workspace-page">
      <header class="settings-page-header">
        <div class="settings-page-heading-group">
          <h1 class="settings-page-title">工作区</h1>
          <div class="settings-page-description">配置本地项目目录和上下文持久化方式。</div>
        </div>
      </header>

      <div class="settings-surface-card">
        <div class="settings-surface-head">
          <div class="settings-surface-copy">
            <div class="settings-surface-title">默认项目目录</div>
            <div class="settings-surface-hint">AivoClaw CE 项目和上下文文件的保存位置。</div>
          </div>
        </div>
        <div class="settings-inline-fields settings-inline-fields-row">
          <input class="settings-input" value="~/Documents/AivoClaw CE">
          <button class="settings-button settings-button-secondary">${iconFolderOpen("icon-sm")} 浏览</button>
        </div>
      </div>

      <div class="settings-general-card">
        ${renderWorkspaceToggle("限制文件访问", "启用后，Agent 的工作空间将限制在工作目录内，无法访问外部文件。", false)}
        <div class="settings-general-divider"></div>
        ${renderWorkspaceToggle("自动保存上下文", "自动将聊天记录和提取的产物保存到本地工作区文件夹。", true)}
        <div class="settings-general-divider"></div>
        ${renderWorkspaceToggle("文件监听", "监控本地文件变更，实时保持 Agent 上下文同步。", true)}
        <div class="settings-general-divider"></div>
        <div class="settings-general-row">
          <div class="settings-general-copy">
            <div class="settings-general-label">从 OpenClaw 迁移</div>
            <div class="settings-general-hint">从 OpenClaw 导入配置、会话、技能和其他数据到 AivoClaw CE。</div>
          </div>
          <button class="settings-button settings-button-secondary">开始迁移</button>
        </div>
      </div>
    </section>
  `;
}

function renderWorkspaceToggle(label: string, hint: string, active: boolean) {
  return html`
    <div class="settings-general-row">
      <div class="settings-general-copy">
        <div class="settings-general-label">${label}</div>
        <div class="settings-general-hint">${hint}</div>
      </div>
      ${renderToggle(active, (e: Event) => {
        (e.currentTarget as HTMLElement).classList.toggle("active");
      })}
    </div>
  `;
}
