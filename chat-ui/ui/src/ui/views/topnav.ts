/**
 * 顶部导航栏组件
 * 基于原型 topnav.ts 改造，接受 AppViewState 参数
 * 包含窗口拖拽区域和窗口控制按钮（无边框窗口）
 */
import { html } from "lit";
import type { AppViewState } from "../app-view-state.ts";
import { iconSun, iconMoon } from "../icons-v2.ts";
import aivologo from "../../assets/aivologo.png";

/**
 * 最小化图标（横线）
 */
function iconWindowMinimize() {
  return html`<svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path d="M4 8h8" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>`;
}

/**
 * 关闭图标（使用 temp/x.svg 提供的 Bootstrap Icons 样式）
 */
function iconWindowClose() {
  return html`<svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708"/></svg>`;
}

/**
 * 渲染顶部导航栏
 * @param state - 应用视图状态
 * @returns 顶部导航栏模板
 */
export function renderTopnav(state: AppViewState) {
  return html`
    <nav class="topnav">
      <div class="topnav-left">
        <img src="${aivologo}" alt="AivoClaw" class="nav-app-icon">
        <span class="topnav-title">AivoClaw</span>
      </div>
      <div class="topnav-right">
        <button
          class="topnav-btn theme-toggle-btn"
          title="切换主题"
          @click=${() => {
            const isDark = state.themeResolved === "dark";
            state.setTheme(isDark ? "light" : "dark");
          }}
        >
          ${state.themeResolved === "dark" ? iconMoon() : iconSun()}
        </button>

        <div class="window-controls">
          <button
            class="window-control-btn"
            title="最小化"
            @click=${() => window.aivoclaw?.windowMinimize?.()}
          >
            ${iconWindowMinimize()}
          </button>
          <button
            class="window-control-btn window-control-btn--close"
            title="关闭"
            @click=${() => window.aivoclaw?.windowClose?.()}
          >
            ${iconWindowClose()}
          </button>
        </div>
      </div>
    </nav>
  `;
}
