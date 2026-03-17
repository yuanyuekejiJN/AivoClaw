import { html } from "lit";
import type { TemplateResult } from "lit";

export function renderSettingsCard(
  title: string,
  hint: string,
  content: TemplateResult,
  actions?: TemplateResult
) {
  return html`
    <div class="settings-surface-card">
      <div class="settings-surface-head">
        <div class="settings-surface-copy" style="flex:1;">
          <div class="settings-surface-title">${title}</div>
          ${hint ? html`<div class="settings-surface-hint">${hint}</div>` : ""}
        </div>
        ${actions ?? ""}
      </div>
      ${content}
    </div>
  `;
}
