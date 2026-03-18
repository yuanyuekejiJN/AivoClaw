import { html } from "lit";
import type { SettingsAppState } from "../settings-types.ts";
import { renderToggle } from "../components/toggle-switch.ts";
import { iconFolderOpen, iconExternalLink } from "../icons-v2.ts";

export function renderSettingsPrivacy(_app: SettingsAppState) {
  return html`
    <section class="settings-privacy-page">
      <header class="settings-page-header">
        <div class="settings-page-heading-group">
          <h1 class="settings-page-title">数据与隐私</h1>
          <div class="settings-page-description">查看数据存储位置以及 AivoClaw 发出的网络请求。</div>
        </div>
      </header>

      <div class="settings-surface-card">
        <div class="settings-surface-head">
          <div class="settings-surface-copy">
            <div class="settings-surface-title">本地数据路径</div>
            <div class="settings-surface-hint">所有工作区文件、会话和 Agent 输出均保存在此本地目录中。</div>
          </div>
        </div>
        <div class="settings-inline-fields settings-inline-fields-row">
          <input class="settings-input" value="~/Documents/AivoClaw">
          <button class="settings-button settings-button-secondary">${iconFolderOpen("icon-sm")} 浏览</button>
        </div>
      </div>

      <div class="settings-surface-card">
        <div class="settings-surface-head">
          <div class="settings-surface-copy" style="flex:1;">
            <div class="settings-surface-title">优化计划</div>
            <div class="settings-surface-hint">启用后，您的对话内容将被脱敏处理后用于模型优化。数据经过严格匿名化处理，不包含任何个人身份信息。</div>
          </div>
          ${renderToggle(false, (e: Event) => {
            (e.currentTarget as HTMLElement).classList.toggle("active");
          })}
        </div>
      </div>

      <div class="settings-surface-card">
        <div class="settings-surface-head">
          <div class="settings-surface-copy">
            <div class="settings-surface-title">备案信息</div>
          </div>
        </div>
        <div class="settings-privacy-filing-grid">
          <span class="settings-privacy-filing-label">ICP 许可证</span>
          <span class="settings-privacy-filing-value">京ICP备20011824号-21</span>
          <span class="settings-privacy-filing-label">算法备案</span>
          <span class="settings-privacy-filing-value">智谱 ChatGLM 生成算法</span>
          <span class="settings-privacy-filing-label"></span>
          <span class="settings-privacy-filing-value">智谱 ChatGLM 搜索算法</span>
          <span class="settings-privacy-filing-label">大模型备案</span>
          <span class="settings-privacy-filing-value">Beijing-AutoGLM-20250606S0053</span>
        </div>
        <div class="settings-privacy-legal-links">
          <a href="#" class="settings-privacy-legal-link">${iconExternalLink("icon-sm")} 隐私政策</a>
          <a href="#" class="settings-privacy-legal-link">${iconExternalLink("icon-sm")} 用户协议</a>
        </div>
      </div>
    </section>
  `;
}
