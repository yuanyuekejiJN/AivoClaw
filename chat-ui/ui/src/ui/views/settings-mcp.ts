import { html } from "lit";
import type { SettingsAppState } from "../settings-types.ts";
import { DEMO_MCP_SERVERS, MCP_TEMPLATES } from "../settings-data.ts";
import {
  openMcpModal,
  closeMcpModal,
  setMcpConnectionType,
} from "../app-modals.ts";
import { renderModal } from "../components/modal.ts";
import { iconRefreshCw, iconPlus, iconPlug, iconX } from "../icons-v2.ts";

export function renderSettingsMcp(app: SettingsAppState) {
  return html`
    <section class="settings-mcp-page">
      <header class="settings-page-header">
        <div class="settings-page-heading-group">
          <h1 class="settings-page-title">MCP 服务</h1>
          <div class="settings-page-description">MCP (Model Context Protocol) 服务器为 Agent 扩展外部工具——文件系统、数据库、网络搜索等。</div>
        </div>
        <div class="settings-page-actions">
          <button class="settings-button settings-button-secondary">${iconRefreshCw("icon-sm")} 刷新</button>
          <button class="settings-button settings-button-primary" @click=${() => openMcpModal(app)}>${iconPlus("icon-sm")} 添加服务</button>
        </div>
      </header>

      <div class="settings-mcp-list-card">
        ${DEMO_MCP_SERVERS.map(
          (srv, i) => html`
            <div class="settings-mcp-row ${i > 0 ? "is-separated" : ""}" style="${!srv.enabled ? "opacity:0.72;" : ""}">
              <div class="settings-mcp-row-main">
                <span class="settings-mcp-row-icon">${iconPlug("icon-sm")}</span>
                <span class="settings-mcp-row-name">${srv.name}</span>
              </div>
              <div class="settings-mcp-row-actions">
                <button class="settings-button settings-button-secondary">${srv.enabled ? "已启用" : "已停用"}</button>
                <button class="settings-button settings-button-secondary">设置</button>
                <button class="settings-button settings-button-secondary">删除</button>
              </div>
            </div>
          `
        )}
      </div>

      <div class="settings-mcp-quick-add">
        <div class="settings-mcp-quick-add-head">
          <div>
            <div class="settings-surface-title">快速添加模板</div>
            <div class="settings-surface-hint">从预设模板快速配置常用 MCP 服务</div>
          </div>
        </div>
        <div class="settings-mcp-template-list">
          ${MCP_TEMPLATES.map(
            (t) => html`
              <button class="settings-button settings-button-template" @click=${() => openMcpModal(app)}>+ ${t}</button>
            `
          )}
        </div>
      </div>

      ${renderModal(app.mcpModalOpen, () => closeMcpModal(app), renderMcpModalContent(app))}
    </section>
  `;
}

function renderMcpModalContent(app: SettingsAppState) {
  return html`
    <div class="channel-modal-header">
      <h2 class="channel-modal-title">添加 MCP 服务</h2>
      <button class="channels-btn channels-btn-sm" @click=${() => closeMcpModal(app)}>${iconX()}</button>
    </div>
    <div class="channel-modal-body">
      <div class="channel-form-group">
        <label class="channel-form-label">服务名称</label>
        <input type="text" class="channel-form-input" placeholder="my-mcp-server（仅字母、数字、-、_）">
      </div>
      <div class="channel-form-group">
        <label class="channel-form-label">连接方式</label>
        <select class="channel-form-select"
          @change=${(e: Event) => setMcpConnectionType(app, (e.target as HTMLSelectElement).value)}>
          <option value="stdio">本地进程 (stdio)</option>
          <option value="http">远程 HTTP (SSE)</option>
        </select>
      </div>
      ${app.mcpConnectionType === "stdio"
        ? html`
            <div class="channel-form-group" style="margin-bottom:14px;">
              <label class="channel-form-label">命令</label>
              <input type="text" class="channel-form-input" placeholder="npx">
            </div>
            <div class="channel-form-group" style="margin-bottom:14px;">
              <label class="channel-form-label">参数</label>
              <input type="text" class="channel-form-input" placeholder="以空格分隔，如 -y @modelcontextprotocol/server-filesystem /tmp">
            </div>
            <div class="channel-form-group">
              <label class="channel-form-label">环境变量</label>
              <textarea class="channel-form-textarea" placeholder="每行一个 KEY=VALUE" style="height:64px;"></textarea>
            </div>
          `
        : html`
            <div class="channel-form-group">
              <label class="channel-form-label">服务器 URL</label>
              <input type="text" class="channel-form-input" placeholder="https://mcp.example.com/sse">
            </div>
          `}
    </div>
    <div class="channel-modal-footer">
      <div style="flex:1;"></div>
      <button class="channels-btn channels-btn-outline" @click=${() => closeMcpModal(app)}>取消</button>
      <button class="channels-btn channels-btn-primary" @click=${() => closeMcpModal(app)}>添加</button>
    </div>
  `;
}
