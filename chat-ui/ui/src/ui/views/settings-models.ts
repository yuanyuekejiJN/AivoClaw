import { html, nothing } from "lit";
import type { SettingsAppState } from "../settings-types.ts";
import { MODEL_PROVIDER_PRESETS } from "../settings-data.ts";
import type { ModelProviderPreset } from "../settings-data.ts";
import {
  openModelModal,
  closeModelModal,
  setModelProvider,
} from "../app-modals.ts";
import { renderModal } from "../components/modal.ts";
import { iconRefreshCw, iconPlus, iconX, iconAlertTriangle, iconLoader, iconPencil, iconTrash2 } from "../icons-v2.ts";
import {
  restartGateway,
  saveProviderConfig,
  verifyApiKey,
  deleteModel,
  editModel,
} from "../settings-backend.ts";

// 编辑状态：当前正在编辑的模型信息
interface EditingModel {
  providerKey: string;
  modelId: string;
  displayName: string;
  apiKey: string;
  baseURL: string;
  api: string;
}

// 模块级编辑状态
let editingModel: EditingModel | null = null;

// 模块级状态：模型下拉当前选中值（模型 ID 或 "custom"）
let selectedModelValue = "";

/**
 * 根据预设 value 查找预设对象
 */
function findPreset(value: string): ModelProviderPreset | undefined {
  return MODEL_PROVIDER_PRESETS.find((p) => p.value === value);
}

/**
 * 根据后端返回的 providerKey 反向匹配预设
 * 用于编辑模态框中根据已保存的 providerKey 找到对应的前端预设
 */
function findPresetByProviderKey(providerKey: string): ModelProviderPreset | undefined {
  // 精确匹配 value
  const exact = MODEL_PROVIDER_PRESETS.find((p) => p.value === providerKey);
  if (exact) return exact;

  // kimi-coding → kimi-code 预设
  if (providerKey === "kimi-coding") {
    return MODEL_PROVIDER_PRESETS.find((p) => p.value === "kimi-code");
  }
  // moonshot → moonshot-cn 预设
  if (providerKey === "moonshot") {
    return MODEL_PROVIDER_PRESETS.find((p) => p.value === "moonshot-cn");
  }
  // zai → zhipu 预设
  if (providerKey === "zai") {
    return MODEL_PROVIDER_PRESETS.find((p) => p.value === "zhipu");
  }
  // 使用 customPreset 的 providerKey 匹配
  return MODEL_PROVIDER_PRESETS.find((p) => {
    if (!p.customPreset) return false;
    // customPreset 对应的 providerKey 在后端��设表中
    return providerKey === p.value;
  });
}

/**
 * 获取 provider 显示名称
 */
function getProviderLabel(provider: string, subPlatform: string): string {
  if (provider === "moonshot") {
    const labels: Record<string, string> = {
      "moonshot-cn": "Moonshot (中国)",
      "moonshot-ai": "Moonshot (国际)",
      "kimi-code": "Kimi Code",
    };
    return labels[subPlatform] || "Moonshot";
  }
  const preset = findPresetByProviderKey(provider);
  return preset?.label ?? provider;
}

/**
 * API Key 掩码显示
 */
function maskKey(key: string): string {
  if (!key || key.length <= 8) return key ? "••••••••" : "未配置";
  return key.slice(0, 4) + "••••" + key.slice(-4);
}

/**
 * 处理重新连接
 */
function handleReconnect(app: SettingsAppState) {
  restartGateway();
  app.checkingUpdate = true;
  app.requestUpdate();
  setTimeout(() => {
    app.checkingUpdate = false;
    app.requestUpdate();
  }, 2000);
}

/**
 * 从 savedProviders 中查找模型所属的 providerKey
 */
function findProviderKeyForModel(app: SettingsAppState, modelId: string): string | null {
  const info = app.providerInfo;
  if (!info?.savedProviders) return null;
  for (const [key, prov] of Object.entries(info.savedProviders)) {
    if (prov.configuredModels?.includes(modelId)) {
      return key;
    }
  }
  return null;
}

/**
 * 重新加载 provider 信息
 */
async function reloadProviderInfo(app: SettingsAppState) {
  try {
    const configResult = await window.aivoclaw?.settingsGetConfig?.();
    if (configResult?.success && configResult.data) {
      app.providerInfo = configResult.data as any;
    }
  } catch { /* 忽略 */ }
  app.requestUpdate();
}

/**
 * 从表单中读取模型 ID（优先下拉，"custom" 时读文本输入）
 */
function readModelIdFromForm(): string {
  const selectEl = document.querySelector<HTMLSelectElement>("#model-form-model-select");
  const inputEl = document.querySelector<HTMLInputElement>("#model-form-model-input");
  if (selectEl && selectEl.value && selectEl.value !== "custom") {
    return selectEl.value;
  }
  return inputEl?.value?.trim() ?? "";
}

/**
 * 处理添加模型保存
 */
async function handleSaveModel(app: SettingsAppState) {
  const providerSelect = document.querySelector<HTMLSelectElement>("#model-form-provider");
  const displayNameInput = document.querySelector<HTMLInputElement>("#model-form-display-name");
  const apiKeyInput = document.querySelector<HTMLInputElement>("#model-form-api-key");
  const apiProtocolSelect = document.querySelector<HTMLSelectElement>("#model-form-api-protocol");
  const baseUrlInput = document.querySelector<HTMLInputElement>("#model-form-base-url");

  const providerValue = providerSelect?.value ?? "";
  const preset = findPreset(providerValue);
  const modelID = readModelIdFromForm();
  const apiKey = apiKeyInput?.value?.trim() ?? "";
  const api = apiProtocolSelect?.value ?? "openai-completions";
  const baseURL = baseUrlInput?.value?.trim() ?? "";

  if (!providerValue) {
    alert("请选择供应商");
    return;
  }
  if (!modelID) {
    alert("请填写模型 ID");
    return;
  }
  if (!apiKey) {
    alert("请填写 API Key");
    return;
  }

  app.verifyingKey = true;
  app.requestUpdate();

  // 构建后端参数
  const params: Record<string, unknown> = {
    provider: preset?.backendProvider || providerValue,
    apiKey,
    modelID,
    baseURL,
    api,
  };
  if (preset?.customPreset) params.customPreset = preset.customPreset;
  if (preset?.subPlatform) params.subPlatform = preset.subPlatform;

  const result = await saveProviderConfig(params);

  app.verifyingKey = false;

  if (result.success) {
    closeModelModal(app);
    await reloadProviderInfo(app);
  } else {
    alert(result.message || "保存失败");
  }
  app.requestUpdate();
}

/**
 * 处理编辑模型保存
 */
async function handleSaveEditModel(app: SettingsAppState) {
  if (!editingModel) return;

  const providerSelect = document.querySelector<HTMLSelectElement>("#model-form-provider");
  const displayNameInput = document.querySelector<HTMLInputElement>("#model-form-display-name");
  const apiKeyInput = document.querySelector<HTMLInputElement>("#model-form-api-key");
  const apiProtocolSelect = document.querySelector<HTMLSelectElement>("#model-form-api-protocol");
  const baseUrlInput = document.querySelector<HTMLInputElement>("#model-form-base-url");

  const providerValue = providerSelect?.value ?? "";
  const preset = findPreset(providerValue);
  const newModelId = readModelIdFromForm();
  const displayName = displayNameInput?.value?.trim() ?? "";
  const apiKey = apiKeyInput?.value?.trim() ?? "";
  const api = apiProtocolSelect?.value ?? "";
  const baseURL = baseUrlInput?.value?.trim() ?? "";

  if (!newModelId) {
    alert("请填写模型 ID");
    return;
  }
  if (!apiKey) {
    alert("请填写 API Key");
    return;
  }

  app.verifyingKey = true;
  app.requestUpdate();

  // 判断供应商是否变化（通过比较后端 provider）
  const newBackendProvider = preset?.backendProvider || providerValue;
  const providerChanged = newBackendProvider !== editingModel.providerKey
    && providerValue !== editingModel.providerKey;

  if (providerChanged) {
    await deleteModel(editingModel.providerKey, editingModel.modelId);
  }

  let result;
  if (providerChanged) {
    const params: Record<string, unknown> = {
      provider: newBackendProvider,
      apiKey,
      modelID: newModelId,
      baseURL,
      api,
    };
    if (preset?.customPreset) params.customPreset = preset.customPreset;
    if (preset?.subPlatform) params.subPlatform = preset.subPlatform;
    result = await saveProviderConfig(params);
  } else {
    result = await editModel({
      providerKey: editingModel.providerKey,
      modelId: editingModel.modelId,
      newModelId: newModelId !== editingModel.modelId ? newModelId : undefined,
      displayName: displayName || undefined,
      apiKey: apiKey || undefined,
      baseURL,
      api: api || undefined,
    });
  }

  app.verifyingKey = false;

  if (result.success) {
    editingModel = null;
    closeModelModal(app);
    await reloadProviderInfo(app);
  } else {
    alert(result.message || "保存失败");
  }
  app.requestUpdate();
}

/**
 * 处理删除模型
 */
async function handleDeleteModel(app: SettingsAppState, providerKey: string, modelId: string) {
  // 统计所有 provider 下的总模型数
  const totalModels = Object.values(app.providerInfo?.savedProviders ?? {})
    .reduce((sum, p) => sum + (p.configuredModels?.length ?? 0), 0);
  if (totalModels <= 1) {
    alert("至少需要保留一个模型配置，无法删除最后一个模型。");
    return;
  }

  const confirmed = confirm(`确定要删除模型 "${modelId}" 吗？此操作不可撤销。`);
  if (!confirmed) return;

  const result = await deleteModel(providerKey, modelId);
  if (result.success) {
    await reloadProviderInfo(app);
  } else {
    alert(result.message || "删除失败");
  }
}

/**
 * 打开编辑模态框
 */
function openEditModal(app: SettingsAppState, providerKey: string, modelId: string) {
  const info = app.providerInfo;
  const provData = info?.savedProviders?.[providerKey];

  editingModel = {
    providerKey,
    modelId,
    displayName: "",
    apiKey: provData?.apiKey ?? "",
    baseURL: provData?.baseURL ?? "",
    api: provData?.api ?? "",
  };

  // 重置模型下拉状态
  selectedModelValue = "";

  // 复用 modelModalOpen 来控制模态框显示
  app.modelModalOpen = true;
  app.verifyResult = null;
  app.requestUpdate();
}

/**
 * 处理验证 API Key
 */
async function handleVerifyKey(app: SettingsAppState) {
  const providerSelect = document.querySelector<HTMLSelectElement>("#model-form-provider");
  const apiKeyInput = document.querySelector<HTMLInputElement>("#model-form-api-key");
  const baseUrlInput = document.querySelector<HTMLInputElement>("#model-form-base-url");

  const providerValue = providerSelect?.value ?? "";
  const preset = findPreset(providerValue);
  const provider = preset?.backendProvider || providerValue || (editingModel?.providerKey ?? "");
  const apiKey = apiKeyInput?.value?.trim() ?? "";
  const baseURL = baseUrlInput?.value?.trim() ?? "";

  if (!provider || !apiKey) {
    app.verifyResult = { success: false, message: "请选择供应商并填写 API Key" };
    app.requestUpdate();
    return;
  }

  app.verifyingKey = true;
  app.verifyResult = null;
  app.requestUpdate();

  const result = await verifyApiKey({ provider, apiKey, baseURL });
  app.verifyingKey = false;
  app.verifyResult = { success: result.success, message: result.message };
  app.requestUpdate();
}

/**
 * 关闭模态框时清理编辑状态
 */
function handleCloseModal(app: SettingsAppState) {
  editingModel = null;
  selectedModelValue = "";
  closeModelModal(app);
}

/**
 * 供应商切换时更新自动填充和模型下拉
 */
function handleProviderChange(app: SettingsAppState, value: string) {
  selectedModelValue = "";
  // setModelProvider 会触发 requestUpdate，Lit 重渲染时
  // .value 绑定自动将预设值写入 API 协议和 Base URL 字段
  setModelProvider(app, value);
}

/**
 * 模型下拉切换处理
 */
function handleModelSelectChange(app: SettingsAppState, value: string) {
  selectedModelValue = value;
  app.requestUpdate();
}

export function renderSettingsModels(app: SettingsAppState) {
  const info = app.providerInfo;
  const port = app.gatewayPort || 18789;
  const currentModel = info?.modelID ?? "未配置";
  const currentProvider = info
    ? getProviderLabel(info.provider, info.subPlatform)
    : "未配置";
  const currentKey = info ? maskKey(info.apiKey) : "未配置";
  const configuredModels = info?.configuredModels ?? [];

  return html`
    <section class="settings-models-page">
      <header class="settings-page-header">
        <div class="settings-page-heading-group">
          <h1 class="settings-page-title">模型与 API</h1>
        </div>
        <div class="settings-page-actions">
          <button class="settings-button settings-button-secondary"
            @click=${() => handleReconnect(app)}>
            ${iconRefreshCw("icon-sm")} 重新连接
          </button>
        </div>
      </header>

      <!-- 当前模型信息 -->
      <div class="settings-models-section">
        <div class="settings-models-section-title">当前配置</div>
        <div class="settings-surface-card settings-surface-card-compact">
          <div class="settings-models-flat-row settings-models-flat-row-bordered">
            <span class="settings-models-flat-row-name">供应商</span>
            <span style="color:var(--theme-text-sec);font-size:13px;">${currentProvider}</span>
          </div>
          <div class="settings-models-flat-row settings-models-flat-row-bordered">
            <span class="settings-models-flat-row-name">当前模型</span>
            <span style="color:var(--theme-text-sec);font-size:13px;">${currentModel}</span>
          </div>
          <div class="settings-models-flat-row">
            <span class="settings-models-flat-row-name">API Key</span>
            <span style="color:var(--theme-text-sec);font-size:13px;font-family:monospace;">${currentKey}</span>
          </div>
        </div>
      </div>

      <!-- 已配置模型列表 -->
      ${configuredModels.length > 0
        ? html`
            <div class="settings-models-section">
              <div class="settings-models-section-header">
                <span class="settings-models-section-title">已配置模型</span>
                <button class="settings-button settings-button-secondary"
                  @click=${() => { editingModel = null; selectedModelValue = ""; openModelModal(app); }}>
                  ${iconPlus("icon-sm")} 添加自定义模型
                </button>
              </div>
              <div class="settings-surface-card settings-surface-card-compact">
                ${configuredModels.map(
                  (m, i) => {
                    const provKey = findProviderKeyForModel(app, m);
                    return html`
                    <div class="settings-models-flat-row ${i < configuredModels.length - 1 ? "settings-models-flat-row-bordered" : ""}">
                      <span class="settings-models-flat-row-name">${m}</span>
                      <div class="settings-models-row-actions">
                        ${m === currentModel
                          ? html`<span class="settings-models-active-badge">当前选择</span>`
                          : nothing}
                        ${provKey ? html`
                          <button class="settings-models-icon-btn" title="编辑"
                            @click=${() => openEditModal(app, provKey, m)}>
                            ${iconPencil("icon-sm")}
                          </button>
                          <button class="settings-models-icon-btn settings-models-icon-btn-danger" title="删除"
                            @click=${() => handleDeleteModel(app, provKey, m)}>
                            ${iconTrash2("icon-sm")}
                          </button>
                        ` : nothing}
                      </div>
                    </div>
                  `}
                )}
              </div>
            </div>
          `
        : html`
            <div class="settings-models-section">
              <div class="settings-models-section-header">
                <span class="settings-models-section-title">模型列表</span>
                <button class="settings-button settings-button-secondary"
                  @click=${() => { editingModel = null; selectedModelValue = ""; openModelModal(app); }}>
                  ${iconPlus("icon-sm")} 添加自定义模型
                </button>
              </div>
            </div>
          `}

      <!-- Gateway URL -->
      <div class="settings-models-section">
        <div class="settings-models-section-header">
          <div class="settings-models-gateway-title-group">
            <span class="settings-models-section-title">Gateway URL</span>
            <span class="settings-models-connected-badge connected">已连接</span>
          </div>
          <div class="settings-detail-actions">
            <button class="settings-button settings-button-secondary"
              @click=${() => handleReconnect(app)}>重新连接</button>
          </div>
        </div>
        <div class="settings-models-gateway-url-display settings-inline-note-mono">
          ws://127.0.0.1:${port}
        </div>
      </div>

      <!-- Add/Edit Model Modal -->
      ${renderModal(app.modelModalOpen, () => handleCloseModal(app),
        editingModel ? renderEditModelModalContent(app) : renderModelModalContent(app)
      )}
    </section>
  `;
}

/**
 * 渲染模型选择区域（下拉 + 自定义输入）
 */
function renderModelField(preset: ModelProviderPreset | undefined, currentModelId = "") {
  const hasPresetModels = preset && preset.models.length > 0;
  // 判断当前模型是否在预设列表中
  const modelInPreset = hasPresetModels && currentModelId && preset!.models.includes(currentModelId);
  // 如果有当前模型且不在预设中，默认展示自定义输入
  const effectiveValue = selectedModelValue
    || (modelInPreset ? currentModelId : "")
    || (currentModelId && !modelInPreset && hasPresetModels ? "custom" : "");
  const showCustomInput = !hasPresetModels || effectiveValue === "custom"
    || (preset?.value === "custom");

  return html`
    ${hasPresetModels
      ? html`
        <div class="channel-form-group">
          <label class="channel-form-label">模型</label>
          <select class="channel-form-select" id="model-form-model-select"
            @change=${(e: Event) => {
              const val = (e.target as HTMLSelectElement).value;
              selectedModelValue = val;
              // 触发 Lit 重渲染（通过修改一个响应式属性）
              const modal = document.querySelector(".channel-modal-body");
              if (modal) modal.dispatchEvent(new Event("model-select-change"));
              // 手动切换自定义输入显示
              const customGroup = document.querySelector<HTMLElement>("#model-form-custom-input-group");
              if (customGroup) {
                customGroup.style.display = val === "custom" ? "" : "none";
              }
            }}>
            <option value="">请选择模型</option>
            ${preset!.models.map((m) => html`<option value="${m}" ?selected=${m === (selectedModelValue || currentModelId)}>${m}</option>`)}
            <option value="custom" ?selected=${effectiveValue === "custom"}>自定义...</option>
          </select>
        </div>
        <div class="channel-form-group" id="model-form-custom-input-group"
          style="${showCustomInput ? "" : "display:none"}">
          <label class="channel-form-label">自定义模型 ID</label>
          <input type="text" class="channel-form-input" id="model-form-model-input"
            placeholder="输入模型 ID"
            .value=${(!modelInPreset && currentModelId) ? currentModelId : ""}>
        </div>
      `
      : html`
        <div class="channel-form-group">
          <label class="channel-form-label">模型 ID</label>
          <input type="text" class="channel-form-input" id="model-form-model-input"
            placeholder="如 deepseek-chat、claude-3.5-sonnet"
            .value=${currentModelId}>
        </div>
      `}
  `;
}

/**
 * 新增模型模态框内容
 */
function renderModelModalContent(app: SettingsAppState) {
  const currentPreset = findPreset(app.modelProvider);
  const apiKeyLabel = currentPreset?.apiKeyLabel || "API Key";
  const isCustom = !app.modelProvider || app.modelProvider === "custom";
  const baseUrlPlaceholder = currentPreset?.baseUrl || "https://api.example.com/v1";

  return html`
    <div class="channel-modal-header">
      <h2 class="channel-modal-title">添加自定义模型</h2>
      <button class="channels-btn channels-btn-sm" @click=${() => handleCloseModal(app)}>
        ${iconX()}
      </button>
    </div>
    <div class="channel-modal-body">
      <div class="model-modal-disclaimer">
        ${iconAlertTriangle("icon-sm")}
        <span>添加外部模型即表示您确认并同意自行承担使用风险。</span>
      </div>
      <div class="channel-form-group">
        <label class="channel-form-label">供应商</label>
        <select class="channel-form-select" id="model-form-provider"
          @change=${(e: Event) => handleProviderChange(app, (e.target as HTMLSelectElement).value)}>
          <option value="">请选择供应商</option>
          ${MODEL_PROVIDER_PRESETS.map((p) => html`<option value="${p.value}" ?selected=${p.value === app.modelProvider}>${p.label}</option>`)}
        </select>
      </div>

      ${renderModelField(currentPreset)}

      <div class="channel-form-group">
        <label class="channel-form-label">显示名称（可选）</label>
        <input type="text" class="channel-form-input" id="model-form-display-name" placeholder="自定义显示名称">
      </div>
      <div class="channel-form-group">
        <label class="channel-form-label">${apiKeyLabel}</label>
        <input type="password" class="channel-form-input" id="model-form-api-key" placeholder="API Key">
      </div>
      <div class="channel-form-group">
        <label class="channel-form-label">API 协议</label>
        <select class="channel-form-select" id="model-form-api-protocol"
          .value=${currentPreset?.api ?? "openai-completions"}
          ?disabled=${!isCustom && !!currentPreset}>
          <option value="openai-completions">OpenAI</option>
          <option value="anthropic-messages">Anthropic</option>
          <option value="google-generative-ai">Google</option>
        </select>
      </div>
      <div class="channel-form-group">
        <label class="channel-form-label">Base URL</label>
        <input type="text" class="channel-form-input" id="model-form-base-url"
          placeholder="${isCustom ? 'https://api.example.com/v1' : ''}"
          .value=${currentPreset?.baseUrl ?? ""}
          ?disabled=${!isCustom && !!currentPreset}>
      </div>

      <!-- 验证结果 -->
      ${app.verifyResult
        ? html`
            <div class="channel-setup-hint" style="border-left:3px solid ${app.verifyResult.success ? 'var(--theme-success)' : 'var(--theme-danger)'};">
              <div style="font-size:13px;color:${app.verifyResult.success ? 'var(--theme-success)' : 'var(--theme-danger)'};">
                ${app.verifyResult.success ? "验证通过" : app.verifyResult.message || "验证失败"}
              </div>
            </div>
          `
        : nothing}
    </div>
    <div class="channel-modal-footer">
      <button class="channels-btn channels-btn-outline"
        ?disabled=${app.verifyingKey}
        @click=${() => handleVerifyKey(app)}>
        ${app.verifyingKey ? html`${iconLoader("icon-sm")} 验证中...` : "验证 Key"}
      </button>
      <div style="flex:1;"></div>
      <button class="channels-btn channels-btn-outline" @click=${() => handleCloseModal(app)}>取消</button>
      <button class="channels-btn channels-btn-primary"
        ?disabled=${app.verifyingKey}
        @click=${() => handleSaveModel(app)}>
        ${app.verifyingKey ? html`${iconLoader("icon-sm")} 保存中...` : "添加"}
      </button>
    </div>
  `;
}

/**
 * 编辑模型模态框内容
 */
function renderEditModelModalContent(app: SettingsAppState) {
  if (!editingModel) return nothing;
  const em = editingModel;

  // 匹配当前编辑模型对应的预设
  const providerValue = app.modelProvider || "";
  const currentPreset = providerValue
    ? findPreset(providerValue)
    : findPresetByProviderKey(em.providerKey);
  const effectivePresetValue = currentPreset?.value ?? "custom";
  const apiKeyLabel = currentPreset?.apiKeyLabel || "API Key";
  const isCustom = effectivePresetValue === "custom";

  return html`
    <div class="channel-modal-header">
      <h2 class="channel-modal-title">编辑模型</h2>
      <button class="channels-btn channels-btn-sm" @click=${() => handleCloseModal(app)}>
        ${iconX()}
      </button>
    </div>
    <div class="channel-modal-body">
      <div class="channel-form-group">
        <label class="channel-form-label">供应商</label>
        <select class="channel-form-select" id="model-form-provider"
          @change=${(e: Event) => handleProviderChange(app, (e.target as HTMLSelectElement).value)}>
          ${MODEL_PROVIDER_PRESETS.map((p) => html`<option value="${p.value}" ?selected=${p.value === effectivePresetValue}>${p.label}</option>`)}
        </select>
      </div>

      ${renderModelField(currentPreset, em.modelId)}

      <div class="channel-form-group">
        <label class="channel-form-label">显示名称（可选）</label>
        <input type="text" class="channel-form-input" id="model-form-display-name"
          placeholder="自定义显示名称" .value=${em.displayName}>
      </div>
      <div class="channel-form-group">
        <label class="channel-form-label">${apiKeyLabel}</label>
        <input type="password" class="channel-form-input" id="model-form-api-key"
          placeholder="留空则不修改" .value=${em.apiKey}>
      </div>
      <div class="channel-form-group">
        <label class="channel-form-label">API 协议</label>
        <select class="channel-form-select" id="model-form-api-protocol"
          .value=${currentPreset?.api ?? em.api ?? "openai-completions"}>
          <option value="openai-completions">OpenAI</option>
          <option value="anthropic-messages">Anthropic</option>
          <option value="google-generative-ai">Google</option>
        </select>
      </div>
      <div class="channel-form-group">
        <label class="channel-form-label">Base URL</label>
        <input type="text" class="channel-form-input" id="model-form-base-url"
          placeholder="如 https://api.example.com/v1"
          .value=${currentPreset?.baseUrl || em.baseURL}>
      </div>

      <!-- 验证结果 -->
      ${app.verifyResult
        ? html`
            <div class="channel-setup-hint" style="border-left:3px solid ${app.verifyResult.success ? 'var(--theme-success)' : 'var(--theme-danger)'};">
              <div style="font-size:13px;color:${app.verifyResult.success ? 'var(--theme-success)' : 'var(--theme-danger)'};">
                ${app.verifyResult.success ? "验证通过" : app.verifyResult.message || "验证失败"}
              </div>
            </div>
          `
        : nothing}
    </div>
    <div class="channel-modal-footer">
      <button class="channels-btn channels-btn-outline"
        ?disabled=${app.verifyingKey}
        @click=${() => handleVerifyKey(app)}>
        ${app.verifyingKey ? html`${iconLoader("icon-sm")} 验证中...` : "验证 Key"}
      </button>
      <div style="flex:1;"></div>
      <button class="channels-btn channels-btn-outline" @click=${() => handleCloseModal(app)}>取消</button>
      <button class="channels-btn channels-btn-primary"
        ?disabled=${app.verifyingKey}
        @click=${() => handleSaveEditModel(app)}>
        ${app.verifyingKey ? html`${iconLoader("icon-sm")} 保存中...` : "保存"}
      </button>
    </div>
  `;
}
