import { html } from "lit";
import type { SettingsAppState } from "../settings-types.ts";
import { DEMO_USAGE_BREAKDOWN } from "../settings-data.ts";
import { iconRefreshCw } from "../icons-v2.ts";

export function renderSettingsUsage(_app: SettingsAppState) {
  return html`
    <section class="settings-usage-page">
      <header class="settings-page-header">
        <div class="settings-page-heading-group">
          <h1 class="settings-page-title">用量统计</h1>
          <div class="settings-page-description">汇总本设备上所有已保存对话的 Token 用量。输出 Token 为根据回复长度估算值（Gateway 不报告精确用量）。</div>
        </div>
        <div class="settings-page-actions">
          <button class="settings-button settings-button-secondary">
            ${iconRefreshCw("icon-sm")} 刷新
          </button>
        </div>
      </header>

      <div class="settings-usage-stats-grid">
        <div class="settings-usage-stat-card">
          <div class="settings-usage-stat-value">42</div>
          <div class="settings-usage-stat-label">会话数</div>
        </div>
        <div class="settings-usage-stat-card">
          <div class="settings-usage-stat-value">1,234</div>
          <div class="settings-usage-stat-label">消息数</div>
        </div>
        <div class="settings-usage-stat-card">
          <div class="settings-usage-stat-value">2.5 M</div>
          <div class="settings-usage-stat-label">总 Token</div>
        </div>
      </div>

      <div class="settings-usage-section-title">按模型</div>
      <div class="settings-usage-breakdown-card">
        ${DEMO_USAGE_BREAKDOWN.map(
          (row, i) => html`
            <div class="settings-usage-breakdown-row ${i > 0 ? "is-separated" : ""}">
              <div class="settings-usage-breakdown-head">
                <span class="settings-usage-breakdown-model">${row.model}</span>
                <span class="settings-usage-breakdown-meta">${row.msgs}</span>
              </div>
              <div class="settings-usage-bar-track">
                <div class="settings-usage-bar-total" style="width:${row.totalWidth};"></div>
                <div class="settings-usage-bar-input" style="width:${row.inputWidth};"></div>
              </div>
              <div class="settings-usage-breakdown-foot">
                <span>In: ${row.inputTokens}</span>
                <span>Out: ${row.outputTokens}</span>
                <span>Total: ${row.totalTokens}</span>
              </div>
            </div>
          `
        )}
      </div>

      <div class="settings-usage-legend">
        <span class="settings-usage-legend-item">
          <span class="settings-usage-legend-swatch input"></span>
          Input tokens
        </span>
        <span class="settings-usage-legend-item">
          <span class="settings-usage-legend-swatch output"></span>
          Output tokens
        </span>
      </div>
    </section>
  `;
}
