import { html } from "lit";
import type { SettingsAppState } from "../settings-types.ts";
import type { PointsFilter } from "../settings-types.ts";
import { DEMO_POINTS_LEDGER } from "../settings-data.ts";
import { setPointsFilter } from "../settings-actions.ts";
import { iconRefreshCw, iconCreditCard } from "../icons-v2.ts";

export function renderSettingsPoints(app: SettingsAppState) {
  const filters: { key: PointsFilter; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "spend", label: "支出" },
    { key: "earn", label: "收入" },
  ];

  return html`
    <section class="settings-points-page">
      <header class="settings-page-header">
        <div class="settings-page-heading-group">
          <h1 class="settings-page-title">积分</h1>
        </div>
        <div class="settings-page-actions">
          <button class="settings-button settings-button-secondary">${iconRefreshCw("icon-sm")} 刷新</button>
          <button class="settings-button settings-button-primary">${iconCreditCard("icon-sm")} 充值</button>
        </div>
      </header>

      <div class="settings-points-balance">
        <div class="settings-points-balance-item">
          <span class="settings-points-balance-label">总积分</span>
          <span class="settings-points-balance-value">12,580</span>
        </div>
      </div>

      <div class="settings-points-filter-bar" role="tablist">
        ${filters.map(
          (f, i) => html`
            ${i > 0 ? html`<span class="settings-points-filter-divider"></span>` : ""}
            <button
              class="settings-points-filter-tab ${app.pointsFilter === f.key ? "active" : ""}"
              @click=${() => setPointsFilter(app, f.key)}
            >${f.label}</button>
          `
        )}
      </div>

      <div class="settings-points-ledger">
        ${DEMO_POINTS_LEDGER.map(
          (row) => html`
            <div class="settings-points-ledger-row">
              <div class="settings-points-ledger-info">
                <span class="settings-points-ledger-desc">${row.desc}</span>
                <span class="settings-points-ledger-time">${row.time}</span>
              </div>
              <span class="settings-points-ledger-amount ${row.type}">${row.amount}</span>
            </div>
          `
        )}
        <div class="settings-points-ledger-status">没有更多记录</div>
      </div>
    </section>
  `;
}
