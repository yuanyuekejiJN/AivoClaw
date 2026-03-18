/**
 * 设置页弹窗操作函数
 * 对应原型中的模态框打开/关闭逻辑
 */
import type { SettingsAppState } from "./settings-types.ts";

/**
 * 弹窗覆盖层点击事件处理（点击背景关闭，点击弹窗内部不关闭）
 */
export function handleOverlayClick(e: MouseEvent, onClose: () => void) {
  if (e.target === e.currentTarget) {
    onClose();
  }
}

// ---- 频道弹窗 ----

export function openChannelModal(app: SettingsAppState, provider = "") {
  app.channelModalOpen = true;
  app.channelProvider = provider;
  app.channelAdvancedOpen = false;
  app.requestUpdate();
}

export function closeChannelModal(app: SettingsAppState) {
  app.channelModalOpen = false;
  app.channelProvider = "";
  app.channelAdvancedOpen = false;
  app.requestUpdate();
}

export function setChannelProvider(app: SettingsAppState, provider: string) {
  app.channelProvider = provider;
  app.channelAdvancedOpen = false;
  app.requestUpdate();
}

export function toggleChannelAdvanced(app: SettingsAppState) {
  app.channelAdvancedOpen = !app.channelAdvancedOpen;
  app.requestUpdate();
}

// ---- 模型弹窗 ----

export function openModelModal(app: SettingsAppState) {
  app.modelModalOpen = true;
  app.modelProvider = "";
  app.modelApiKeyLabel = "API Key";
  app.modelBaseUrlPlaceholder = "https://api.example.com/v1";
  app.requestUpdate();
}

export function closeModelModal(app: SettingsAppState) {
  app.modelModalOpen = false;
  app.requestUpdate();
}

/**
 * 切换模型供应商
 * API Key label 和 Base URL 由渲染函数根据 MODEL_PROVIDER_PRESETS 动态计算
 */
export function setModelProvider(app: SettingsAppState, provider: string) {
  app.modelProvider = provider;
  app.requestUpdate();
}

// ---- MCP 弹窗 ----

export function openMcpModal(app: SettingsAppState) {
  app.mcpModalOpen = true;
  app.mcpConnectionType = "stdio";
  app.requestUpdate();
}

export function closeMcpModal(app: SettingsAppState) {
  app.mcpModalOpen = false;
  app.requestUpdate();
}

export function setMcpConnectionType(app: SettingsAppState, type: string) {
  app.mcpConnectionType = type;
  app.requestUpdate();
}

// ---- 更新日志弹窗 ----

export function openChangelogModal(app: SettingsAppState) {
  app.changelogModalOpen = true;
  app.requestUpdate();
}

export function closeChangelogModal(app: SettingsAppState) {
  app.changelogModalOpen = false;
  app.requestUpdate();
}
