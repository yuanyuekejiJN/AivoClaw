import { html } from "lit";
import type { SettingsAppState } from "../settings-types.ts";
import { iconSend, iconLoader } from "../icons-v2.ts";

export function renderSettingsFeedback(app: SettingsAppState) {
  return html`
    <section class="settings-workspace-page">
      <header class="settings-page-header">
        <div class="settings-page-heading-group">
          <h1 class="settings-page-title">提交反馈</h1>
          <div class="settings-page-description">描述您遇到的问题或建议。本地日志（包括 RPA 日志）默认附带以加速调试。</div>
        </div>
      </header>

      <div class="settings-surface-card">
        <textarea class="settings-feedback-textarea" id="feedbackTextarea"
          placeholder="请描述复现步骤、预期行为和实际行为" maxlength="5000"></textarea>
      </div>

      <div class="settings-page-actions">
        <button class="settings-button settings-button-primary"
          ?disabled=${app.submittingFeedback}
          @click=${() => submitFeedback(app)}>
          ${app.submittingFeedback ? html`${iconLoader("icon-sm")} 提交中...` : html`${iconSend("icon-sm")} 提交`}
        </button>
      </div>
    </section>
  `;
}

function submitFeedback(app: SettingsAppState) {
  const textarea = document.getElementById("feedbackTextarea") as HTMLTextAreaElement | null;
  if (!textarea || !textarea.value.trim()) return;

  app.submittingFeedback = true;
  setTimeout(() => {
    if (textarea) textarea.value = "";
    app.submittingFeedback = false;
    alert("反馈提交成功，感谢您的反馈！");
  }, 1000);
}
