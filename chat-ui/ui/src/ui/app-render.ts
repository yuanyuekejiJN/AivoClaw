/**
 * AivoClaw app-render.ts
 * 原型 3 列布局：topnav + 左侧边栏 + 聊天区 + 右侧边栏
 */
import { html, nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { parseAgentSessionKey } from "../../../src/routing/session-key.js";
import { refreshChat, refreshChatAvatar } from "./app-chat.ts";
import { syncUrlWithSessionKey } from "./app-settings.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import { getLocale, t } from "./i18n.ts";
import { iconBox, iconActivity, iconPanelLeftOpen } from "./icons-v2.ts";
import { renderLeftSidebarV2, type LeftSidebarTab } from "./views/left-sidebar-v2.ts";
import { renderTopnav } from "./views/topnav.ts";
import { renderRightSidebar, toggleRightSidebar } from "./views/right-sidebar.ts";
import { renderChat } from "./views/chat.ts";
import { renderSettingsShell } from "./views/settings-shell.ts";
import type { SettingsAppState } from "./settings-types.ts";
import { patchSession, loadSessions } from "./controllers/sessions.ts";
import {
  loadAdvancedSettings,
  loadProviderConfig,
  loadChannelsSummary,
  loadAboutInfo,
  loadCliStatus,
  getGatewayPort as fetchGatewayPort,
} from "./settings-backend.ts";

const AVATAR_DATA_RE = /^data:/i;
const AVATAR_HTTP_RE = /^https?:\/\//i;

/**
 * 解析助手头像 URL
 */
function resolveAssistantAvatarUrl(state: AppViewState): string | undefined {
  const list = state.agentsList?.agents ?? [];
  const parsed = parseAgentSessionKey(state.sessionKey);
  const agentId = parsed?.agentId ?? state.agentsList?.defaultId ?? "main";
  const agent = list.find((entry) => entry.id === agentId);
  const identity = agent?.identity;
  const candidate = identity?.avatarUrl ?? identity?.avatar;
  if (!candidate) {
    return undefined;
  }
  if (AVATAR_DATA_RE.test(candidate) || AVATAR_HTTP_RE.test(candidate)) {
    return candidate;
  }
  return identity?.avatarUrl;
}

/**
 * 切换当前会话
 */
function applySessionKey(state: AppViewState, next: string, syncUrl = false) {
  if (!next || next === state.sessionKey) {
    return;
  }
  state.sessionKey = next;
  state.chatMessage = "";
  state.chatAttachments = [];
  state.chatStream = null;
  (state as any).chatStreamStartedAt = null;
  state.chatRunId = null;
  state.chatQueue = [];
  (state as any).resetToolStream();
  (state as any).resetChatScroll();
  state.applySettings({
    ...state.settings,
    sessionKey: next,
    lastActiveSessionKey: next,
  });
  if (syncUrl) {
    syncUrlWithSessionKey(
      state as unknown as Parameters<typeof syncUrlWithSessionKey>[0],
      next,
      true,
    );
  }
  void state.loadAssistantIdentity();
  void loadChatHistory(state as any);
  void refreshChatAvatar(state as any);
}

/**
 * 解析会话显示名称
 */
function resolveSessionOptionLabel(
  key: string,
  row?: (NonNullable<AppViewState["sessionsResult"]>["sessions"][number] | undefined),
): string {
  const displayName = typeof row?.displayName === "string" ? row.displayName.trim() : "";
  const label = typeof row?.label === "string" ? row.label.trim() : "";
  if (label && label !== key) {
    return label;
  }
  if (displayName && displayName !== key) {
    return displayName;
  }
  return key;
}

/**
 * 构建会话列表选项
 */
function resolveSessionOptions(
  state: AppViewState,
): Array<{ key: string; label: string; updatedAt?: number }> {
  const sessions = state.sessionsResult?.sessions ?? [];
  const current = state.sessionKey?.trim() || "main";
  const seen = new Set<string>();
  const options: Array<{ key: string; label: string; updatedAt?: number }> = [];

  const pushOption = (
    key: string,
    row?: NonNullable<AppViewState["sessionsResult"]>["sessions"][number],
    isCurrentSession = false,
  ) => {
    const trimmedKey = String(key || "").trim();
    if (!trimmedKey || seen.has(trimmedKey)) {
      return;
    }
    seen.add(trimmedKey);
    options.push({
      key: trimmedKey,
      label: resolveSessionOptionLabel(trimmedKey, row),
      updatedAt: row?.updatedAt ?? (isCurrentSession ? Date.now() : undefined),
    });
  };

  const currentSession = sessions.find((entry) => entry.key === current);
  pushOption(current, currentSession, true);
  for (const session of sessions) {
    pushOption(session.key, session);
  }

  options.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  if (options.length === 0) {
    return [{ key: current, label: current }];
  }
  return options;
}

/**
 * 侧边栏点击会话：切换 session 并回到对话视图
 */
function handleSessionChange(state: AppViewState, nextSessionKey: string) {
  if (!nextSessionKey.trim()) {
    return;
  }
  setAivoClawView(state, "chat");
  applySessionKey(state, nextSessionKey, true);
}

/**
 * 侧边栏重命名回调
 */
async function patchSessionFromSidebar(state: AppViewState, key: string, newLabel: string) {
  await patchSession(state as any, key, { label: newLabel || null });
}

/**
 * 侧边栏删除回调：归档对话 → 删除会话 → UI 即时更新
 */
async function deleteSessionFromSidebar(state: AppViewState, key: string) {
  const s = state as any;
  if (!s.client || !s.connected) {
    return;
  }
  const confirmed = window.confirm(t("sidebar.deleteSession"));
  if (!confirmed) {
    return;
  }

  const sessions = state.sessionsResult?.sessions ?? [];
  state.sessionsResult = {
    ...state.sessionsResult,
    sessions: sessions.filter((entry) => entry.key !== key),
  };

  if (key === state.sessionKey) {
    const remaining = state.sessionsResult?.sessions ?? [];
    const nextKey = remaining[0]?.key ?? "main";
    applySessionKey(state, nextKey, true);
  }

  try {
    await s.client.request("sessions.reset", { key, reason: "new" });
  } catch {
    // 忽略
  }

  try {
    await s.client.request("sessions.delete", { key, deleteTranscript: true });
  } catch {
    // 忽略
  }

  await loadSessions(s);
}

/**
 * 切换视图
 */
function setAivoClawView(state: AppViewState, next: "chat" | "settings") {
  if ((state.settings.aivoclawView ?? "chat") === next) {
    return;
  }
  state.applySettings({
    ...state.settings,
    aivoclawView: next,
  });
}

/**
 * 打开内嵌设置页
 */
function openSettingsView(state: AppViewState, tabHint: string | null = null) {
  (state as any).settingsTabHint = tabHint;
  setAivoClawView(state, "settings");
}

/**
 * 新建会话
 */
function createNewSession(state: AppViewState) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const newKey = `agent:main:${id}`;
  const label = t("chat.newSession");
  setAivoClawView(state, "chat");
  const sessions = state.sessionsResult?.sessions ?? [];
  state.sessionsResult = {
    ...state.sessionsResult,
    sessions: [{ key: newKey, label, updatedAt: Date.now() }, ...sessions],
  };
  applySessionKey(state, newKey, true);
}

/**
 * 确认后新建会话
 */
function confirmAndCreateNewSession(state: AppViewState) {
  const ok = window.confirm(t("chat.confirmNewSession"));
  if (!ok) {
    return;
  }
  setAivoClawView(state, "chat");
  return state.handleSendChat("/new", { restoreDraft: true });
}

/**
 * 刷新聊天
 */
async function handleRefreshChat(state: AppViewState) {
  if (state.chatLoading || !state.connected) {
    return;
  }
  const app = state as any;
  app.chatManualRefreshInFlight = true;
  app.chatNewMessagesBelow = false;
  await state.updateComplete;
  app.resetToolStream();
  try {
    await refreshChat(state as unknown as Parameters<typeof refreshChat>[0], {
      scheduleScroll: false,
    });
    app.scrollToBottom({ smooth: true });
  } finally {
    requestAnimationFrame(() => {
      app.chatManualRefreshInFlight = false;
      app.chatNewMessagesBelow = false;
    });
  }
}

/**
 * 打开原版 Web UI
 */
async function handleOpenWebUI(state: AppViewState, path = "/") {
  if (!path.startsWith("/")) path = `/${path}`;
  if (window.aivoclaw?.openExternal) {
    let port = 18789;
    try {
      if (window.aivoclaw.getGatewayPort) {
        port = await window.aivoclaw.getGatewayPort();
      }
    } catch { /* use default */ }
    const token = state.settings.token.trim();
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    window.aivoclaw.openExternal(`http://127.0.0.1:${port}${path}${query}`);
  } else if (window.aivoclaw?.openWebUI) {
    window.aivoclaw.openWebUI();
  }
}

/**
 * 触发更新下载安装
 */
async function handleApplyUpdate(state: AppViewState) {
  const current = state.updateBannerState;
  if (current.status !== "available") {
    return;
  }
  try {
    await window.aivoclaw?.downloadAndInstallUpdate?.();
  } catch {
    // 忽略
  }
}

/**
 * 关闭设置页，回到聊天视图
 */
function closeSettingsView(state: AppViewState) {
  setAivoClawView(state, "chat");
}

// 设置页状态对象（惰性初始化）
let _settingsState: SettingsAppState | null = null;

/**
 * 从后端加载设置页所需数据
 */
async function loadSettingsData(s: SettingsAppState): Promise<void> {
  if (s.settingsLoaded) return;
  s.settingsLoaded = true;

  // 并行加载所有数据
  const [advanced, provider, channels, about, cli, port] = await Promise.all([
    loadAdvancedSettings(),
    loadProviderConfig(),
    loadChannelsSummary(),
    loadAboutInfo(),
    loadCliStatus(),
    fetchGatewayPort(),
  ]);

  // 通用设置
  if (advanced) {
    s.launchAtLogin = advanced.launchAtLogin;
    s.launchAtLoginSupported = advanced.launchAtLoginSupported;
  }

  // CLI
  if (cli) {
    s.cliInstalled = cli.installed;
  }

  // 模型与 API
  if (provider) {
    s.providerInfo = provider;
  }
  s.gatewayPort = port;

  // 频道
  s.realChannels = channels;

  // 关于
  if (about) {
    s.aivoClawVersion = about.aivoClawVersion;
    s.openClawVersion = about.openClawVersion;
  }

  s.requestUpdate();
}

/**
 * 获取或创建设置页状态适配器
 */
function getSettingsState(state: AppViewState): SettingsAppState {
  if (!_settingsState) {
    _settingsState = {
      settingsTab: "general",
      pointsFilter: "all",
      activeBuiltinModel: "glm-4-plus",
      checkingUpdate: false,
      submittingFeedback: false,
      channelModalOpen: false,
      channelProvider: "",
      channelAdvancedOpen: false,
      modelModalOpen: false,
      modelProvider: "",
      modelApiKeyLabel: "API Key",
      modelBaseUrlPlaceholder: "https://api.example.com/v1",
      mcpModalOpen: false,
      mcpConnectionType: "stdio",
      changelogModalOpen: false,
      requestUpdate: () => state.requestUpdate(),
      _closeSettings: () => closeSettingsView(state),

      // 后端数据默认值
      launchAtLogin: false,
      launchAtLoginSupported: false,
      cliInstalled: false,
      cliLoading: false,
      providerInfo: null,
      gatewayPort: 18789,
      verifyingKey: false,
      verifyResult: null,
      feishuConfig: null,
      realChannels: [],
      savingChannel: false,
      aivoClawVersion: "",
      openClawVersion: "",
      updateStatus: "hidden",
      updateVersion: null,
      localSkills: [],
      gatewaySkills: [],
      loadGatewaySkills: null,
      toggleGatewaySkill: null,
      saveGatewaySkillApiKey: null,
      skillApiKeyEdits: {},
      skillsBusyKey: null,
      skillsLoading: false,
      skillsLoaded: false,
      skillsError: null,
      skillRemoving: null,
      settingsLoaded: false,
    };
  }
  // 保持 requestUpdate 和 _closeSettings 指向最新的 state
  _settingsState.requestUpdate = () => state.requestUpdate();
  _settingsState._closeSettings = () => closeSettingsView(state);

  // 同步主应用的主题和工具详情状态到设置页
  (_settingsState as any).theme = (state as any).theme ?? state.settings.theme ?? "system";

  // 注入设置同步回调：将设置变更持久化并同步到主应用
  _settingsState.applyMainSettings = (patch: Record<string, unknown>) => {
    const next = { ...state.settings, ...patch };
    (state as any).applySettings(next);
  };

  // 注入网关技能加载回调（每次都更新，确保引用最新的 client）
  _settingsState.loadGatewaySkills = async () => {
    const client = (state as any).client;
    if (!client || !(state as any).connected) return [];
    const res = await client.request("skills.status", {});
    return (res?.skills ?? []).map((s: any) => ({
      skillKey: s.skillKey ?? s.name ?? "",
      name: s.name ?? "",
      description: s.description ?? "",
      source: s.source ?? "",
      emoji: s.emoji ?? "",
      enabled: s.enabled !== false,
      disabled: !!s.disabled,
      bundled: !!s.bundled,
      eligible: s.eligible,
      blockedByAllowlist: s.blockedByAllowlist,
      primaryEnv: s.primaryEnv,
      missing: s.missing ?? { bins: [], env: [], config: [], os: [] },
      install: Array.isArray(s.install) ? s.install : [],
    }));
  };

  // 注入网关技能启用/禁用回调
  _settingsState.toggleGatewaySkill = async (skillKey: string, enabled: boolean) => {
    const client = (state as any).client;
    if (!client || !(state as any).connected) return;
    await client.request("skills.update", { skillKey, enabled });
  };

  // 注入网关技能 API Key 保存回调
  _settingsState.saveGatewaySkillApiKey = async (skillKey: string, apiKey: string) => {
    const client = (state as any).client;
    if (!client || !(state as any).connected) return;
    await client.request("skills.update", { skillKey, apiKey });
  };

  return _settingsState;
}

/**
 * 渲染设置页全屏覆盖层（原型风格，原生 Lit 渲染）
 */
function renderSettingsOverlay(state: AppViewState) {
  const aivoclawView = state.settings.aivoclawView ?? "chat";
  if (aivoclawView !== "settings") {
    return nothing;
  }

  const settingsState = getSettingsState(state);

  // 消费 settingsTabHint：打开设置页时自动切换到指定 tab
  const tabHint = (state as any).settingsTabHint as string | null;
  if (tabHint && tabHint !== settingsState.settingsTab) {
    settingsState.settingsTab = tabHint as any;
    (state as any).settingsTabHint = null;
  }

  // 首次打开设置页时触发数据加载
  if (!settingsState.settingsLoaded) {
    void loadSettingsData(settingsState);
  }

  return renderSettingsShell(settingsState);
}

/**
 * 渲染主应用
 */
export function renderApp(state: AppViewState) {
  const chatDisabledReason = state.connected ? null : t("error.disconnected");
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const showToolDetails = state.onboarding ? false : state.settings.chatShowToolDetails;
  const assistantAvatarUrl = resolveAssistantAvatarUrl(state);
  const chatAvatarUrl = state.chatAvatarUrl ?? assistantAvatarUrl ?? null;
  const chatFocus = state.onboarding;
  const leftCollapsed = state.leftSidebarCollapsed;
  const currentSessionKey = state.sessionKey;
  const sessionOptions = resolveSessionOptions(state);
  const updateBannerState = state.updateBannerState;
  const settingsActive = (state.settings.aivoclawView ?? "chat") === "settings";

  // 当前会话标题
  const currentSession = sessionOptions.find((s) => s.key === currentSessionKey);
  const chatTitle = currentSession?.label ?? currentSessionKey ?? "AivoClaw";

  return html`
    ${renderTopnav(state)}

    <div class="aivoclaw-shell">
      ${chatFocus
        ? nothing
        : renderLeftSidebarV2({
            connected: state.connected,
            currentSessionKey,
            sessionOptions,
            settingsActive,
            updateStatus: updateBannerState.status,
            updateVersion: updateBannerState.version,
            updatePercent: updateBannerState.percent,
            updateShowBadge: updateBannerState.showBadge,
            refreshDisabled: state.chatLoading || !state.connected,
            leftSidebarTab: (state.leftSidebarTab ?? "agents") as LeftSidebarTab,
            leftSidebarCollapsed: leftCollapsed,
            channelsStatus: state.channelsSnapshot,
            cronJobs: state.cronJobs ?? [],
            onSelectSession: (nextSessionKey: string) => handleSessionChange(state, nextSessionKey),
            onNewChat: () => createNewSession(state),
            onRenameSession: (key: string, newLabel: string) => {
              void patchSessionFromSidebar(state, key, newLabel);
            },
            onDeleteSession: (key: string) => {
              void deleteSessionFromSidebar(state, key);
            },
            onRefresh: () => void handleRefreshChat(state),
            onToggleSidebar: () => {
              state.leftSidebarCollapsed = !state.leftSidebarCollapsed;
            },
            onOpenSettings: () => openSettingsView(state, null),
            onOpenSettingsTab: (tab: string) => openSettingsView(state, tab),
            onOpenWebUI: () => void handleOpenWebUI(state),
            onOpenWebUIPath: (path: string) => void handleOpenWebUI(state, path),
            onOpenDocs: () => {
              if (window.aivoclaw?.openExternal) {
                window.aivoclaw.openExternal("https://aivoclaw.cn/docs");
              } else {
                window.open("https://aivoclaw.cn/docs", "_blank");
              }
            },
            onApplyUpdate: () => void handleApplyUpdate(state),
            onSetLeftSidebarTab: (tab: LeftSidebarTab) => {
              state.leftSidebarTab = tab;
            },
          })}

      <main class="main-area ${state.rightSidebarOpen ? "sidebar-right-open" : ""}">
        <!-- 聊天头部 -->
        <div class="chat-header">
          ${leftCollapsed && !chatFocus
            ? html`
                <button class="sidebar-header-btn" title="${t("sidebar.expand")}"
                  @click=${() => { state.leftSidebarCollapsed = false; }}>
                  ${iconPanelLeftOpen()}
                </button>
              `
            : nothing}
          <span class="chat-header-title">${chatTitle}</span>
          <div class="chat-header-actions">
            <button class="header-action-btn ${state.rightSidebarOpen && state.rightSidebarTab === "artifacts" ? "active" : ""}"
              @click=${() => toggleRightSidebar(state, "artifacts")}>
              ${iconBox("icon-sm")}
              <span>${t("chatHeader.artifacts")}</span>
            </button>
            <button class="header-action-btn ${state.rightSidebarOpen && state.rightSidebarTab === "activity" ? "active" : ""}"
              @click=${() => toggleRightSidebar(state, "activity")}>
              ${iconActivity("icon-sm")}
              <span>${t("chatHeader.activity")}</span>
            </button>
          </div>
        </div>

        <div class="aivoclaw-content">
          ${renderChat({
                sessionKey: state.sessionKey,
                onSessionKeyChange: (next) => applySessionKey(state, next),
                thinkingLevel: state.chatThinkingLevel,
                showThinking,
                showToolDetails,
                loading: state.chatLoading,
                sending: state.chatSending,
                compactionStatus: state.compactionStatus,
                assistantAvatarUrl: chatAvatarUrl,
                messages: state.chatMessages,
                toolMessages: state.chatToolMessages,
                stream: state.chatStream,
                streamStartedAt: (state as any).chatStreamStartedAt,
                draft: state.chatMessage,
                queue: state.chatQueue,
                connected: state.connected,
                canSend: state.connected,
                disabledReason: chatDisabledReason,
                error: state.lastError,
                sessions: state.sessionsResult,
                focusMode: false,
                onRefresh: () => {
                  (state as any).resetToolStream();
                  return Promise.all([loadChatHistory(state as any), refreshChatAvatar(state as any)]);
                },
                onToggleFocusMode: () => {},
                onChatScroll: (event) => state.handleChatScroll(event),
                onDraftChange: (next) => (state.chatMessage = next),
                attachments: state.chatAttachments,
                onAttachmentsChange: (next) => (state.chatAttachments = next),
                onSend: () => state.handleSendChat(),
                canAbort: Boolean(state.chatRunId),
                onAbort: () => void state.handleAbortChat(),
                onQueueRemove: (id) => state.removeQueuedMessage(id),
                onNewSession: () => confirmAndCreateNewSession(state),
                showNewMessages: state.chatNewMessagesBelow && !state.chatManualRefreshInFlight,
                onScrollToBottom: () => state.scrollToBottom(),
                sidebarOpen: state.sidebarOpen,
                sidebarContent: state.sidebarContent,
                sidebarError: state.sidebarError,
                splitRatio: state.splitRatio,
                onOpenSidebar: (content: string) => state.handleOpenSidebar(content),
                onCloseSidebar: () => state.handleCloseSidebar(),
                onSplitRatioChange: (ratio: number) => state.handleSplitRatioChange(ratio),
                assistantName: state.assistantName,
                assistantAvatar: state.assistantAvatar,
              })}
        </div>
      </main>

      ${renderRightSidebar(state)}
    </div>

    ${renderSettingsOverlay(state)}
  `;
}
