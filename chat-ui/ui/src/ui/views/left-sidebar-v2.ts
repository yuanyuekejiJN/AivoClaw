/**
 * 新左侧边栏组件（3-tab 设计）
 * 基于原型视觉设计，使用真实数据源
 */
import { html, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import type { AppViewState } from "../app-view-state.ts";
import {
  iconPanelLeftClose,
  iconPlus,
  iconSettings,
  iconZap,
} from "../icons-v2.ts";
import { icons } from "../icons.ts";
import { t } from "../i18n.ts";

// 左侧边栏 tab 类型
export type LeftSidebarTab = "agents" | "schedule";

/**
 * 左侧边栏属性接口
 */
export type LeftSidebarV2Props = {
  connected: boolean;
  currentSessionKey: string;
  sessionOptions: Array<{ key: string; label: string; updatedAt?: number }>;
  settingsActive: boolean;
  updateStatus: "hidden" | "available" | "downloading";
  updateVersion: string | null;
  updatePercent: number | null;
  updateShowBadge: boolean;
  refreshDisabled: boolean;
  // 新 3-tab 状态
  leftSidebarTab: LeftSidebarTab;
  leftSidebarCollapsed: boolean;
  // 频道和定时任务数据
  channelsStatus: any;
  cronJobs: any[];
  // 回调
  onSelectSession: (sessionKey: string) => void;
  onNewChat: () => void;
  onRenameSession: (key: string, newLabel: string) => void;
  onDeleteSession: (key: string) => void;
  onRefresh: () => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  onOpenSettingsTab?: (tab: string) => void;
  onOpenWebUI: () => void;
  onOpenWebUIPath?: (path: string) => void;
  onOpenDocs: () => void;
  onApplyUpdate: () => void;
  onSetLeftSidebarTab: (tab: LeftSidebarTab) => void;
};

// 双击会话名触发内联重命名
function startInlineRename(
  span: HTMLSpanElement,
  sessionKey: string,
  currentLabel: string,
  onRename: (key: string, newLabel: string) => void,
) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "aivoclaw-sidebar__session-edit";
  input.value = currentLabel;
  let saved = false;
  const save = () => {
    if (saved) return;
    saved = true;
    const val = input.value.trim();
    if (val && val !== currentLabel) {
      onRename(sessionKey, val);
    }
    input.replaceWith(span);
  };
  input.addEventListener("keydown", (ev: KeyboardEvent) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      save();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      saved = true;
      input.replaceWith(span);
    }
  });
  input.addEventListener("blur", save);
  span.replaceWith(input);
  input.focus();
  input.select();
}

/**
 * 根据当前 tab 返回加号按钮的 tooltip
 */
function resolveAddButtonTitle(tab: LeftSidebarTab): string {
  if (tab === "agents") return t("sidebar.newChat");
  if (tab === "schedule") return t("leftSidebar.addSchedule");
  return "";
}

/**
 * 根据当前 tab 执行加号按钮的对应操作
 */
function handleAddButton(props: LeftSidebarV2Props) {
  if (props.leftSidebarTab === "agents") {
    props.onNewChat();
  } else if (props.leftSidebarTab === "schedule") {
    props.onOpenWebUIPath?.("/cron");
  }
}

/**
 * 渲染新左侧边栏
 * @param props - 侧边栏属性
 * @returns 左侧边栏模板
 */
export function renderLeftSidebarV2(props: LeftSidebarV2Props) {
  const tabs: LeftSidebarTab[] = ["agents", "schedule"];
  const tabLabels: Record<LeftSidebarTab, string> = {
    agents: "会话",
    schedule: t("leftSidebar.scheduleTab"),
  };

  const statusClass = props.connected ? "ok" : "";
  const statusText = props.connected ? t("sidebar.connected") : t("sidebar.disconnected");

  const showUpdateAction = props.updateStatus !== "hidden";
  const updateLabel = props.updateStatus === "downloading"
    ? t("sidebar.updateDownloading").replace(
        "{percent}",
        String(Math.max(0, Math.min(100, Math.round(props.updatePercent ?? 0)))),
      )
    : t("sidebar.updateReady");

  return html`
    <aside class="sidebar-left ${props.leftSidebarCollapsed ? "collapsed" : ""}" id="sidebarLeft">
      <div class="sidebar-header">
        <button class="sidebar-header-btn" title="${t("sidebar.collapse")}"
          @click=${props.onToggleSidebar}>
          ${iconPanelLeftClose()}
        </button>
        <button class="sidebar-header-btn new-chat-btn" title="${resolveAddButtonTitle(props.leftSidebarTab)}"
          @click=${() => handleAddButton(props)}>
          ${iconPlus()}
        </button>
      </div>

      <div class="sidebar-tabs">
        ${tabs.map(
          (tab) => html`
            <button
              class="sidebar-tab ${props.leftSidebarTab === tab ? "active" : ""}"
              @click=${() => props.onSetLeftSidebarTab(tab)}
            >${tabLabels[tab]}</button>
          `
        )}
      </div>

      ${props.leftSidebarTab === "agents" ? renderAgentsList(props) : nothing}
      ${props.leftSidebarTab === "schedule" ? renderScheduleList(props) : nothing}

      <div class="sidebar-footer">
        <!-- 底部功能区 -->
        <div class="sidebar-footer-actions">
          ${showUpdateAction
            ? html`
                <button
                  class="aivoclaw-sidebar__item aivoclaw-sidebar__item--update ${props.updateStatus === "downloading" ? "is-loading" : ""}"
                  type="button"
                  @click=${props.onApplyUpdate}
                  title=${props.updateVersion ? `${updateLabel} (${props.updateVersion})` : updateLabel}
                  ?disabled=${props.updateStatus === "downloading"}
                >
                  <span class="aivoclaw-sidebar__icon">
                    ${props.updateStatus === "downloading" ? icons.loader : icons.zap}
                  </span>
                  <span class="aivoclaw-sidebar__label">${updateLabel}</span>
                  ${props.updateShowBadge
                    ? html`<span class="aivoclaw-sidebar__update-dot" aria-hidden="true"></span>`
                    : nothing}
                </button>
              `
            : nothing}

          <div class="sidebar-footer-row">
            <div class="aivoclaw-sidebar__status">
              <span class="statusDot ${statusClass}"></span>
              <span class="aivoclaw-sidebar__status-text">${statusText}</span>
            </div>
            <div class="sidebar-footer-btns">
              <button class="sidebar-header-btn" title="${t("sidebar.settings")}"
                @click=${props.onOpenSettings}>
                ${iconSettings()}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  `;
}

/**
 * 渲染 Agents 会话列表
 */
function renderAgentsList(props: LeftSidebarV2Props) {
  return html`
    <div class="session-list tab-content active" data-panel="agents">
      ${repeat(
        props.sessionOptions,
        (s) => s.key,
        (s) => {
          const isActive = s.key === props.currentSessionKey;
          return html`
            <div
              class="session-item ${isActive ? "active" : ""}"
              @click=${() => props.onSelectSession(s.key)}
            >
              <div class="session-info">
                <span
                  class="session-name aivoclaw-sidebar__session-name"
                  title=${s.label}
                >${s.label}</span>
              </div>
              <div class="session-meta-actions">
                <button
                  class="aivoclaw-sidebar__session-action"
                  type="button"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    const item = (e.currentTarget as HTMLElement).closest(".session-item")!;
                    const span = item.querySelector(".aivoclaw-sidebar__session-name") as HTMLSpanElement;
                    startInlineRename(span, s.key, s.label, props.onRenameSession);
                  }}
                  title=${t("sidebar.rename")}
                >
                  ${icons.edit}
                </button>
                <button
                  class="aivoclaw-sidebar__session-action"
                  type="button"
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    props.onDeleteSession(s.key);
                  }}
                  title=${t("sidebar.delete")}
                >
                  ${icons.x}
                </button>
              </div>
            </div>
          `;
        },
      )}
    </div>
  `;
}

/**
 * 渲染定时任务列表
 */
function renderScheduleList(props: LeftSidebarV2Props) {
  const jobs = props.cronJobs ?? [];
  if (jobs.length === 0) {
    return html`
      <div class="session-list tab-content active" data-panel="schedule">
        <div class="panel-empty">
          <div class="panel-empty-icon">${iconZap()}</div>
          <div class="panel-empty-text">${t("leftSidebar.noSchedule")}</div>
        </div>
      </div>
    `;
  }

  return html`
    <div class="session-list tab-content active" data-panel="schedule">
      ${jobs.map((job: any) => html`
        <div class="session-item">
          <div class="session-avatar im-avatar"
            style="background: var(--theme-success); display:flex; align-items:center; justify-content:center;">
            ${iconZap("icon-sm")}
          </div>
          <div class="session-info">
            <div class="session-name">${job.name ?? job.id ?? "Task"}</div>
            <div class="session-preview">${job.schedule ?? ""}</div>
          </div>
          <span class="session-meta" style="font-size:11px;">
            ${job.enabled !== false ? t("leftSidebar.running") : t("leftSidebar.paused")}
          </span>
        </div>
      `)}
    </div>
  `;
}
