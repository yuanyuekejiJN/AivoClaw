import { html, nothing } from "lit";
import type { SettingsAppState } from "../settings-types.ts";
import {
  PROVIDER_DOCS,
} from "../settings-data.ts";
import {
  openChannelModal,
  closeChannelModal,
  setChannelProvider,
  toggleChannelAdvanced,
} from "../app-modals.ts";
import { renderModal } from "../components/modal.ts";
import {
  iconRefreshCw,
  iconPlus,
  iconX,
  iconMessageSquare,
  iconSend,
  iconHash,
  iconSettings,
  iconZap,
  iconInfo,
  iconChevronRight,
  iconExternalLink,
  iconLoader,
} from "../icons-v2.ts";
import { renderToggle } from "../components/toggle-switch.ts";
import {
  loadChannelsSummary,
  saveFeishuChannel,
  saveWecomChannel,
  saveDingtalkChannel,
  saveQqbotChannel,
} from "../settings-backend.ts";
import type { RealChannelInfo } from "../settings-types.ts";

// 真实支持的频道类型
const CHANNEL_PROVIDERS = [
  { value: "feishu", label: "飞书（Feishu）" },
  { value: "wecom", label: "企业微信" },
  { value: "dingtalk", label: "钉钉" },
  { value: "qqbot", label: "QQ Bot" },
];

// 快速添加列表
const QUICK_ADD_CHANNELS = [
  { label: "飞书", provider: "feishu" },
  { label: "企业微信", provider: "wecom" },
  { label: "钉钉", provider: "dingtalk" },
  { label: "QQ Bot", provider: "qqbot" },
];

const CHANNEL_ICON_MAP: Record<string, (cls?: string) => ReturnType<typeof html>> = {
  "message-square": iconMessageSquare,
  send: iconSend,
  hash: iconHash,
  zap: iconZap,
};

export function renderSettingsChannels(app: SettingsAppState) {
  const channels: RealChannelInfo[] = app.realChannels ?? [];

  return html`
    <section class="settings-channels-page">
      <header class="settings-channels-header">
        <div>
          <h1 class="settings-channels-title">IM 通道</h1>
          <div class="settings-channels-desc">将 AivoClaw 连接到飞书、企业微信、钉钉、QQ Bot 等即时通讯平台。</div>
        </div>
        <div class="settings-channels-header-actions">
          <button class="channels-btn channels-btn-icon" title="刷新"
            @click=${() => handleRefreshChannels(app)}>
            ${iconRefreshCw("icon-sm")}
          </button>
          <button class="channels-btn channels-btn-primary" @click=${() => openChannelModal(app)}>
            ${iconPlus("icon-sm")}
            <span>添加频道</span>
          </button>
        </div>
      </header>

      <div class="settings-channels-list">
        ${channels.length === 0
          ? html`<div style="padding:24px;text-align:center;color:var(--theme-text-ter);font-size:14px;">
              暂无已配置的频道，点击"添加频道"开始
            </div>`
          : channels.map(
              (ch) => html`
                <div class="settings-channels-row">
                  <div class="settings-channels-row-main">
                    <span class="settings-channels-row-icon" style="background:${ch.iconBg};">
                      ${CHANNEL_ICON_MAP[ch.iconName]?.("icon-sm") ?? nothing}
                    </span>
                    <span class="settings-channels-row-name">${ch.label}</span>
                    <span class="settings-channels-status settings-channels-status-${ch.enabled ? "active" : "danger"}">
                      ${ch.enabled ? "已启用" : "已停用"}
                    </span>
                  </div>
                  <div class="settings-channels-row-actions">
                    ${renderToggle(ch.enabled, () => handleToggleChannel(app, ch))}
                    <button class="channels-btn channels-btn-sm" title="编辑"
                      @click=${() => openChannelModal(app, ch.channel)}>
                      ${iconSettings("icon-sm")}
                    </button>
                  </div>
                </div>
              `
            )}
      </div>

      <div class="settings-channels-quick-add">
        <div class="settings-channels-quick-add-title">快速添加</div>
        <div class="settings-channels-quick-add-actions">
          ${QUICK_ADD_CHANNELS.map(
            (ch, i) => html`
              <button class="channels-btn channels-btn-outline"
                @click=${() => openChannelModal(app, ch.provider)}>
                ${i === 0 ? html`${iconZap("icon-sm")}` : ""}
                <span>+ ${ch.label}</span>
              </button>
            `
          )}
        </div>
      </div>

      ${renderModal(
        app.channelModalOpen,
        () => closeChannelModal(app),
        renderChannelModalContent(app)
      )}
    </section>
  `;
}

/**
 * 刷新频道列表
 */
async function handleRefreshChannels(app: SettingsAppState) {
  const channels = await loadChannelsSummary();
  app.realChannels = channels;
  app.requestUpdate();
}

/**
 * 切换频道启用/停用
 */
async function handleToggleChannel(app: SettingsAppState, ch: RealChannelInfo) {
  const newEnabled = !ch.enabled;
  const saveMap: Record<string, (p: Record<string, unknown>) => Promise<any>> = {
    feishu: saveFeishuChannel,
    wecom: saveWecomChannel,
    dingtalk: saveDingtalkChannel,
    qqbot: saveQqbotChannel,
  };
  const saveFn = saveMap[ch.channel];
  if (!saveFn) return;

  const result = await saveFn({ enabled: newEnabled });
  if (result.success) {
    ch.enabled = newEnabled;
    app.requestUpdate();
  } else {
    alert(result.message || "操作失败");
  }
}

/**
 * 保存频道弹窗表单
 */
async function handleSaveChannel(app: SettingsAppState) {
  const p = app.channelProvider;
  if (!p) return;

  const modal = document.querySelector(".channel-modal-body");
  if (!modal) return;

  app.savingChannel = true;
  app.requestUpdate();

  let result;

  if (p === "feishu") {
    const inputs = modal.querySelectorAll<HTMLInputElement>(".channel-form-input");
    const selects = modal.querySelectorAll<HTMLSelectElement>(".channel-form-select");
    const appId = inputs[0]?.value?.trim() ?? "";
    const appSecret = inputs[1]?.value?.trim() ?? "";
    // 私聊策略是 provider 选择后的第一个 select（index 1）
    const dmPolicy = selects[1]?.value ?? "pairing";

    result = await saveFeishuChannel({
      appId,
      appSecret,
      enabled: true,
      dmPolicy,
    });
  } else if (p === "wecom") {
    const inputs = modal.querySelectorAll<HTMLInputElement>(".channel-form-input");
    const botId = inputs[0]?.value?.trim() ?? "";
    const secret = inputs[1]?.value?.trim() ?? "";
    result = await saveWecomChannel({ botId, secret, enabled: true });
  } else if (p === "dingtalk") {
    const inputs = modal.querySelectorAll<HTMLInputElement>(".channel-form-input");
    const clientId = inputs[0]?.value?.trim() ?? "";
    const clientSecret = inputs[1]?.value?.trim() ?? "";
    result = await saveDingtalkChannel({ clientId, clientSecret, enabled: true });
  } else if (p === "qqbot") {
    const inputs = modal.querySelectorAll<HTMLInputElement>(".channel-form-input");
    const appId = inputs[0]?.value?.trim() ?? "";
    const clientSecret = inputs[1]?.value?.trim() ?? "";
    result = await saveQqbotChannel({ appId, clientSecret, enabled: true });
  }

  app.savingChannel = false;

  if (result?.success) {
    closeChannelModal(app);
    // 刷新频道列表
    await handleRefreshChannels(app);
  } else {
    alert(result?.message || "保存失败");
    app.requestUpdate();
  }
}

function renderChannelModalContent(app: SettingsAppState) {
  const p = app.channelProvider;
  const docsUrl = PROVIDER_DOCS[p];

  return html`
    <div class="channel-modal-header">
      <h2 class="channel-modal-title">添加 IM 频道</h2>
      <button class="channels-btn channels-btn-sm" @click=${() => closeChannelModal(app)}>
        ${iconX()}
      </button>
    </div>
    <div class="channel-modal-body">
      <div class="channel-form-group">
        <label class="channel-form-label">频道类型</label>
        <select class="channel-form-select"
          .value=${p}
          @change=${(e: Event) => setChannelProvider(app, (e.target as HTMLSelectElement).value)}>
          <option value="">请选择频道类型</option>
          ${CHANNEL_PROVIDERS.map((cp) => html`<option value="${cp.value}" ?selected=${cp.value === p}>${cp.label}</option>`)}
        </select>
      </div>

      ${p === "feishu"
        ? html`
            <div class="channel-setup-hint">
              <div class="channel-setup-hint-icon">${iconInfo("icon-sm")}</div>
              <div class="channel-setup-hint-text">
                <div style="font-weight:600;margin-bottom:4px;">飞书接入步骤</div>
                <ol style="margin:0;padding-left:18px;font-size:12px;line-height:1.8;">
                  <li>在飞书开放平台创建应用，获取 App ID 和 App Secret</li>
                  <li>开通「机器人」能力，订阅 im.message.receive_v1 事件</li>
                  <li>发布应用并等待审核通过</li>
                </ol>
              </div>
            </div>
          `
        : nothing}

      <!-- 飞书表单 -->
      ${p === "feishu"
        ? html`
            <div class="channel-form-group">
              <label class="channel-form-label">App ID</label>
              <input type="text" class="channel-form-input"
                placeholder="cli_xxxxxxx（来自飞书开放平台）"
                .value=${app.feishuConfig?.appId ?? ""}>
            </div>
            <div class="channel-form-group">
              <label class="channel-form-label">App Secret</label>
              <input type="password" class="channel-form-input"
                placeholder="App Secret"
                .value=${app.feishuConfig?.appSecret ?? ""}>
            </div>
          `
        : nothing}

      <!-- 企业微信表单 -->
      ${p === "wecom"
        ? html`
            <div class="channel-setup-hint">
              <div class="channel-setup-hint-icon">${iconInfo("icon-sm")}</div>
              <div class="channel-setup-hint-text" style="font-size:12px;">
                在企业微信管理后台创建应用或机器人，获取 Bot ID 和 Secret。
              </div>
            </div>
            <div class="channel-form-group">
              <label class="channel-form-label">Bot ID</label>
              <input type="text" class="channel-form-input" placeholder="企业微信 Bot ID">
            </div>
            <div class="channel-form-group">
              <label class="channel-form-label">Secret</label>
              <input type="password" class="channel-form-input" placeholder="企业微信 Secret">
            </div>
          `
        : nothing}

      <!-- 钉钉表单 -->
      ${p === "dingtalk"
        ? html`
            <div class="channel-setup-hint">
              <div class="channel-setup-hint-icon">${iconInfo("icon-sm")}</div>
              <div class="channel-setup-hint-text" style="font-size:12px;">
                在钉钉开放平台创建应用，获取 Client ID（AppKey）和 Client Secret（AppSecret）。
              </div>
            </div>
            <div class="channel-form-group">
              <label class="channel-form-label">Client ID (AppKey)</label>
              <input type="text" class="channel-form-input" placeholder="钉钉 Client ID">
            </div>
            <div class="channel-form-group">
              <label class="channel-form-label">Client Secret (AppSecret)</label>
              <input type="password" class="channel-form-input" placeholder="钉钉 Client Secret">
            </div>
          `
        : nothing}

      <!-- QQ Bot 表单 -->
      ${p === "qqbot"
        ? html`
            <div class="channel-setup-hint">
              <div class="channel-setup-hint-icon">${iconInfo("icon-sm")}</div>
              <div class="channel-setup-hint-text" style="font-size:12px;">
                在 QQ 开放平台创建机器人，获取 App ID 和 Client Secret。
              </div>
            </div>
            <div class="channel-form-group">
              <label class="channel-form-label">App ID</label>
              <input type="text" class="channel-form-input" placeholder="QQ Bot App ID">
            </div>
            <div class="channel-form-group">
              <label class="channel-form-label">Client Secret</label>
              <input type="password" class="channel-form-input" placeholder="QQ Bot Client Secret">
            </div>
          `
        : nothing}

      <!-- 通用设置（飞书特有） -->
      ${p === "feishu"
        ? html`
            <div class="channel-form-group">
              <label class="channel-form-label">私聊策略</label>
              <select class="channel-form-select">
                <option value="open" ?selected=${app.feishuConfig?.dmPolicy === "open"}>开放（允许所有人）</option>
                <option value="pairing" ?selected=${app.feishuConfig?.dmPolicy === "pairing" || !app.feishuConfig?.dmPolicy}>配对（首次联系需审批）</option>
                <option value="allowlist" ?selected=${app.feishuConfig?.dmPolicy === "allowlist"}>白名单（仅允许指定用户）</option>
                <option value="disabled" ?selected=${app.feishuConfig?.dmPolicy === "disabled"}>禁用私聊</option>
              </select>
            </div>

            <div class="channel-advanced-toggle ${app.channelAdvancedOpen ? "expanded" : ""}"
              @click=${() => toggleChannelAdvanced(app)}>
              ${iconChevronRight("icon-sm")}
              <span>高级设置</span>
            </div>
            ${app.channelAdvancedOpen
              ? html`
                  <div class="channel-advanced-body">
                    <div class="channel-form-group">
                      <label class="channel-form-label">群聊策略</label>
                      <select class="channel-form-select">
                        <option value="open" ?selected=${app.feishuConfig?.groupPolicy === "open"}>开放</option>
                        <option value="allowlist" ?selected=${app.feishuConfig?.groupPolicy === "allowlist"}>白名单</option>
                        <option value="disabled" ?selected=${app.feishuConfig?.groupPolicy === "disabled"}>禁用</option>
                      </select>
                    </div>
                    <div class="channel-form-group">
                      <label class="channel-form-label">群聊白名单</label>
                      <textarea class="channel-form-textarea" placeholder="每行一个群组 ID，如 oc_xxxxx">${(app.feishuConfig?.groupAllowFrom ?? []).join("\n")}</textarea>
                    </div>
                  </div>
                `
              : nothing}
          `
        : nothing}
    </div>
    <div class="channel-modal-footer">
      ${docsUrl
        ? html`
            <a href="${docsUrl}" class="channel-docs-link" target="_blank">
              ${iconExternalLink("icon-sm")}
              <span>查看文档</span>
            </a>
          `
        : nothing}
      <div style="flex:1;"></div>
      <button class="channels-btn channels-btn-outline" @click=${() => closeChannelModal(app)}>取消</button>
      <button class="channels-btn channels-btn-primary"
        ?disabled=${app.savingChannel || !p}
        @click=${() => handleSaveChannel(app)}>
        ${app.savingChannel ? html`${iconLoader("icon-sm")} 保存中...` : "保存"}
      </button>
    </div>
  `;
}
