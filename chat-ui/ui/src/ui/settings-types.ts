/**
 * 原型设置页所需的类型定义
 */

export type SettingsTab =
  | "general"
  | "usage"
  | "points"
  | "models"
  | "mcp"
  | "skills"
  | "channels"
  | "workspace"
  | "privacy"
  | "feedback"
  | "about";

export type PointsFilter = "all" | "spend" | "earn";

export interface SkillItem {
  id: string;
  icon: string;
  title: string;
  description: string;
  badge: string;
  enabled: boolean;
  meta?: string;
  installable?: boolean;
}

export interface McpServer {
  name: string;
  enabled: boolean;
}

export interface PointsLedgerRow {
  desc: string;
  time: string;
  amount: string;
  type: "positive" | "negative";
}

export interface UsageBreakdownRow {
  model: string;
  msgs: string;
  totalWidth: string;
  inputWidth: string;
  inputTokens: string;
  outputTokens: string;
  totalTokens: string;
}

export interface ChannelRow {
  name: string;
  iconName: string;
  iconBg: string;
  status: "active" | "danger";
  statusText: string;
  toggleIcon: string;
  toggleColor: string;
}

/**
 * 设置页使用的 App 状态接口
 * 与原型的 AivoClawApp 兼容，用于设置视图函数参数
 */
export interface SettingsAppState {
  settingsTab: SettingsTab;
  pointsFilter: PointsFilter;
  activeBuiltinModel: string;
  checkingUpdate: boolean;
  submittingFeedback: boolean;
  channelModalOpen: boolean;
  channelProvider: string;
  channelAdvancedOpen: boolean;
  modelModalOpen: boolean;
  modelProvider: string;
  modelApiKeyLabel: string;
  modelBaseUrlPlaceholder: string;
  mcpModalOpen: boolean;
  mcpConnectionType: string;
  changelogModalOpen: boolean;
  requestUpdate: () => void;
  /** 更新主应用的 UiSettings（持久化 + 同步到聊天视图） */
  applyMainSettings?: (patch: Record<string, unknown>) => void;

  // 通用设置 - 后端数据
  launchAtLogin: boolean;
  launchAtLoginSupported: boolean;
  cliInstalled: boolean;
  cliLoading: boolean;

  // 模型与 API - 后端数据
  providerInfo: ProviderInfo | null;
  gatewayPort: number;
  verifyingKey: boolean;
  verifyResult: { success: boolean; message?: string } | null;

  // 频道 - 后端数据
  feishuConfig: FeishuConfig | null;
  realChannels: RealChannelInfo[];
  savingChannel: boolean;

  // 关于 - 后端数据
  aivoClawVersion: string;
  openClawVersion: string;
  updateStatus: string;
  updateVersion: string | null;

  // 技能管理 - 后端数据
  localSkills: LocalSkillItem[];
  gatewaySkills: GatewaySkillItem[];
  loadGatewaySkills: (() => Promise<GatewaySkillItem[]>) | null;
  toggleGatewaySkill: ((skillKey: string, enabled: boolean) => Promise<void>) | null;
  saveGatewaySkillApiKey: ((skillKey: string, apiKey: string) => Promise<void>) | null;
  skillApiKeyEdits: Record<string, string>;
  skillsBusyKey: string | null;
  skillsLoading: boolean;
  skillsLoaded: boolean;
  skillsError: string | null;
  skillRemoving: string | null;

  // 数据加载状态
  settingsLoaded: boolean;

  [key: string]: unknown;
}

/** 本地已安装技能条目 */
export interface LocalSkillItem {
  slug: string;
  name: string;
  description: string;
}

/** 网关技能条目 */
export interface GatewaySkillItem {
  skillKey: string;
  name: string;
  description: string;
  source: string;
  emoji?: string;
  enabled: boolean;
  disabled: boolean;
  bundled: boolean;
  eligible?: boolean;
  blockedByAllowlist?: boolean;
  primaryEnv?: string;
  missing?: {
    bins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
  install?: Array<{ id: string; label: string }>;
}

/** provider 信息（从后端加载） */
export interface ProviderInfo {
  provider: string;
  subPlatform: string;
  customPreset: string;
  modelID: string;
  apiKey: string;
  baseURL: string;
  api: string;
  supportsImage: boolean;
  configuredModels: string[];
  raw: string;
  savedProviders: Record<string, {
    apiKey: string;
    baseURL: string;
    api: string;
    configuredModels: string[];
  }>;
}

/** 飞书配置（从后端加载） */
export interface FeishuConfig {
  appId: string;
  appSecret: string;
  enabled: boolean;
  dmPolicy: string;
  dmPolicyOpen: boolean;
  dmScope: string;
  groupPolicy: string;
  groupAllowFrom: string[];
  topicSessionMode: string;
}

/** 真实频道汇总信息 */
export interface RealChannelInfo {
  channel: string;
  label: string;
  iconName: string;
  iconBg: string;
  enabled: boolean;
}
