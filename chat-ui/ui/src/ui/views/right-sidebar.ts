/**
 * 右侧边栏组件
 * Artifacts 显示文件操作产出物，Activity 显示真实事件日志
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state.ts";
import { iconBox, iconActivity, iconX } from "../icons-v2.ts";
import { icons } from "../icons.ts";
import { t } from "../i18n.ts";

/**
 * 切换右侧边栏面板
 * @param state - 应用视图状态
 * @param tab - 目标面板
 */
export function toggleRightSidebar(state: AppViewState, tab: "artifacts" | "activity") {
  if (state.rightSidebarOpen && state.rightSidebarTab === tab) {
    state.rightSidebarOpen = false;
  } else {
    state.rightSidebarOpen = true;
    state.rightSidebarTab = tab;
  }
}

/**
 * 渲染右侧边栏
 * @param state - 应用视图状态
 * @returns 右侧边栏模板，未打开时返回 nothing
 */
export function renderRightSidebar(state: AppViewState) {
  if (!state.rightSidebarOpen) return nothing;

  return html`
    <aside class="sidebar-right open" id="sidebarRight">
      <div class="sidebar-right-header">
        <button
          class="sidebar-right-tab ${state.rightSidebarTab === "artifacts" ? "active" : ""}"
          @click=${() => { state.rightSidebarTab = "artifacts"; }}
        >
          ${iconBox("icon-sm")} ${t("chatHeader.artifacts")}
        </button>
        <button
          class="sidebar-right-tab ${state.rightSidebarTab === "activity" ? "active" : ""}"
          @click=${() => { state.rightSidebarTab = "activity"; }}
        >
          ${iconActivity("icon-sm")} ${t("chatHeader.activity")}
        </button>
        <button class="sidebar-right-close"
          @click=${() => { state.rightSidebarOpen = false; }}>
          ${iconX("icon-sm")}
        </button>
      </div>

      ${state.rightSidebarTab === "artifacts" ? renderArtifacts(state) : nothing}
      ${state.rightSidebarTab === "activity" ? renderActivityLog(state) : nothing}
    </aside>
  `;
}

/** 产出物条目 */
type ArtifactEntry = {
  path: string;
  fileName: string;
  action: string;
  timestamp: number;
};

/** 文件操作相关的工具名集合 */
const FILE_TOOL_NAMES = new Set(["write", "edit", "apply_patch"]);

/**
 * 从消息数组中提取文件操作产出物
 */
function extractArtifacts(messages: unknown[]): ArtifactEntry[] {
  const byPath = new Map<string, ArtifactEntry>();

  for (const msg of messages) {
    const m = msg as Record<string, unknown>;
    const content = m.content;
    if (!Array.isArray(content)) continue;
    const ts = typeof m.timestamp === "number" ? m.timestamp : Date.now();

    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      const kind = (typeof b.type === "string" ? b.type : "").toLowerCase();
      const isToolCall =
        kind === "toolcall" || kind === "tool_call" ||
        kind === "tooluse" || kind === "tool_use" ||
        (typeof b.name === "string" && b.arguments != null);
      if (!isToolCall) continue;

      const name = (typeof b.name === "string" ? b.name : "").toLowerCase();
      if (!FILE_TOOL_NAMES.has(name)) continue;

      const args = (b.arguments ?? b.args) as Record<string, unknown> | undefined;
      const filePath = resolveFilePath(args);
      if (!filePath) continue;

      const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
      const existing = byPath.get(filePath);
      if (!existing || ts > existing.timestamp) {
        byPath.set(filePath, { path: filePath, fileName, action: name, timestamp: ts });
      }
    }
  }

  // 按时间倒序
  return Array.from(byPath.values()).sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * 从工具参数中解析文件路径
 */
function resolveFilePath(args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  let record = args as Record<string, unknown>;
  // 参数可能是 JSON 字符串
  if (typeof args === "string") {
    try { record = JSON.parse(args as string); } catch { return null; }
  }
  const path = record.path ?? record.file_path ?? record.filePath;
  return typeof path === "string" && path.trim() ? path.trim() : null;
}

/**
 * 缩短路径显示（替换 home 目录为 ~）
 */
function shortenPath(path: string): string {
  return path
    .replace(/\\/g, "/")
    .replace(/\/Users\/[^/]+/g, "~")
    .replace(/\/home\/[^/]+/g, "~")
    .replace(/[A-Z]:[/\\]Users[/\\][^/\\]+/gi, "~");
}

/**
 * 根据操作类型返回图标
 */
function actionIcon(action: string) {
  if (action === "write") return icons.fileCode;
  if (action === "edit" || action === "apply_patch") return icons.edit;
  return icons.fileText;
}

/**
 * 渲染 Artifacts 面板
 */
function renderArtifacts(state: AppViewState) {
  const allMessages = [
    ...(Array.isArray(state.chatMessages) ? state.chatMessages : []),
    ...(Array.isArray(state.chatToolMessages) ? state.chatToolMessages : []),
  ];
  const artifacts = extractArtifacts(allMessages);

  if (artifacts.length === 0) {
    return html`
      <div class="sidebar-right-content tab-content active" data-rpanel="artifacts">
        <div class="panel-empty">
          <div class="panel-empty-icon">${iconBox()}</div>
          <div class="panel-empty-text">${t("rightSidebar.noArtifacts")}</div>
        </div>
      </div>
    `;
  }

  return html`
    <div class="sidebar-right-content tab-content active" data-rpanel="artifacts">
      ${artifacts.map(
        (art) => html`
          <div class="artifact-item" title="${art.path}">
            <div class="artifact-icon">${actionIcon(art.action)}</div>
            <div class="artifact-info">
              <div class="artifact-name">${art.fileName}</div>
              <div class="artifact-path">${shortenPath(art.path)}</div>
            </div>
            <div class="artifact-action-tag">${art.action}</div>
          </div>
        `,
      )}
    </div>
  `;
}

/**
 * 渲染 Activity 日志（来自真实事件日志）
 * @param state - 应用视图状态
 */
function renderActivityLog(state: AppViewState) {
  const events = state.eventLog ?? [];

  if (events.length === 0) {
    return html`
      <div class="sidebar-right-content tab-content active" data-rpanel="activity">
        <div class="panel-empty">
          <div class="panel-empty-icon">${iconActivity()}</div>
          <div class="panel-empty-text">${t("rightSidebar.noActivity")}</div>
        </div>
      </div>
    `;
  }

  return html`
    <div class="sidebar-right-content tab-content active" data-rpanel="activity">
      ${events.slice().reverse().map(
        (entry) => html`
          <div class="activity-item">
            <div class="activity-time">${formatTime(entry.ts ?? Date.now())}</div>
            <div class="activity-text">
              <span class="activity-tag ${resolveTagClass(entry.event ?? "")}">${entry.event ?? ""}</span>
              ${formatPayload(entry)}
            </div>
          </div>
        `
      )}
    </div>
  `;
}

/**
 * 格式化时间戳
 */
function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/**
 * 根据事件类型返回 CSS 类名
 */
function resolveTagClass(kind: string): string {
  if (kind === "tool" || kind === "tool_use" || kind === "agent") return "tool";
  if (kind === "success" || kind === "result" || kind === "chat") return "success";
  if (kind === "thinking") return "thinking";
  return "";
}

/**
 * 从 EventLogEntry 提取可读摘要
 */
function formatPayload(entry: Record<string, unknown>): string {
  const payload = entry.payload as Record<string, unknown> | undefined;
  if (!payload) return String(entry.event ?? "");

  // agent 事件：显示工具名或流类型
  if (entry.event === "agent") {
    const data = payload.data as Record<string, unknown> | undefined;
    const stream = payload.stream as string | undefined;
    const name = data?.name as string | undefined;
    const phase = data?.phase as string | undefined;
    if (name) {
      return phase ? `${name} (${phase})` : name;
    }
    return stream ?? "agent";
  }

  // chat 事件：显示状态
  if (entry.event === "chat") {
    const state = payload.state as string | undefined;
    const sessionKey = payload.sessionKey as string | undefined;
    if (state) {
      const parts = [state];
      if (sessionKey) parts.push(sessionKey.split(":").pop() ?? sessionKey);
      return parts.join(" · ");
    }
  }

  // presence 事件
  if (entry.event === "presence") return "presence update";

  // 其他：返回事件名
  return String(entry.event ?? "event");
}
