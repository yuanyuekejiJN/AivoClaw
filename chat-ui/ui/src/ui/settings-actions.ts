/**
 * 设置页操作函数（原型 app-settings.ts 适配）
 */
import type { SettingsAppState, SettingsTab, PointsFilter } from "./settings-types.ts";

export function closeSettings(app: SettingsAppState) {
  // 由 app-render.ts 中的 closeSettingsView 处理
  if (typeof app._closeSettings === "function") {
    (app as any)._closeSettings();
  }
}

export function setSettingsTab(app: SettingsAppState, tab: SettingsTab) {
  app.settingsTab = tab;
  app.requestUpdate();
}

export function setPointsFilter(app: SettingsAppState, filter: PointsFilter) {
  app.pointsFilter = filter;
  app.requestUpdate();
}

export function setActiveBuiltinModel(app: SettingsAppState, model: string) {
  app.activeBuiltinModel = model;
  app.requestUpdate();
}

/**
 * 切换深色/浅色主题
 */
export function handleThemeToggle(app: SettingsAppState) {
  const current = (app as any).theme ?? "light";
  const next = current === "dark" ? "light" : "dark";
  (app as any).theme = next;
  document.body.dataset.theme = next;
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  if (app.applyMainSettings) {
    app.applyMainSettings({ theme: next });
  }
  app.requestUpdate();
}
