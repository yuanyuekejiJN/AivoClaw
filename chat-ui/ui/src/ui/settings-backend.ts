/**
 * 设置页 IPC 调用层
 * 封装 window.aivoclaw 的设置相关方法，提供类型安全的接口
 */

// 扩展 window.aivoclaw 类型声明
declare global {
  interface Window {
    aivoclaw?: {
      // 通用设置
      settingsGetAdvanced?: () => Promise<IpcResult<AdvancedData>>;
      settingsSaveAdvanced?: (p: Record<string, unknown>) => Promise<IpcResult>;
      // 模型与 API
      settingsGetConfig?: () => Promise<IpcResult<ProviderData>>;
      settingsVerifyKey?: (p: Record<string, unknown>) => Promise<IpcResult>;
      settingsSaveProvider?: (p: Record<string, unknown>) => Promise<IpcResult>;
      getGatewayPort?: () => Promise<number>;
      restartGateway?: () => void;
      // 飞书频道
      settingsGetChannelConfig?: () => Promise<IpcResult<FeishuChannelData>>;
      settingsSaveChannel?: (p: Record<string, unknown>) => Promise<IpcResult>;
      // 企业微信频道
      settingsGetWecomConfig?: () => Promise<IpcResult<WecomChannelData>>;
      settingsSaveWecomConfig?: (p: Record<string, unknown>) => Promise<IpcResult>;
      // 钉钉频道
      settingsGetDingtalkConfig?: () => Promise<IpcResult<DingtalkChannelData>>;
      settingsSaveDingtalkConfig?: (p: Record<string, unknown>) => Promise<IpcResult>;
      // QQ Bot 频道
      settingsGetQqbotConfig?: () => Promise<IpcResult<QqbotChannelData>>;
      settingsSaveQqbotConfig?: (p: Record<string, unknown>) => Promise<IpcResult>;
      // CLI
      settingsGetCliStatus?: () => Promise<IpcResult<CliStatusData>>;
      settingsInstallCli?: () => Promise<IpcResult>;
      settingsUninstallCli?: () => Promise<IpcResult>;
      // 关于
      settingsGetAboutInfo?: () => Promise<AboutInfoData>;
      checkForUpdates?: () => void;
      getUpdateState?: () => Promise<UpdateStateData>;
      downloadAndInstallUpdate?: () => Promise<boolean>;
      // 技能管理（纯本地）
      skillStoreInstall?: (p?: Record<string, unknown>) => Promise<IpcResult>;
      skillStoreUninstall?: (p?: Record<string, unknown>) => Promise<IpcResult>;
      skillStoreListInstalled?: () => Promise<IpcResult<string[]>>;
      skillStoreAddLocal?: () => Promise<IpcResult<{ slug: string }>>;
      skillStoreListInstalledDetail?: () => Promise<IpcResult<LocalSkillInfo[]>>;
      skillStoreSearch?: (p?: Record<string, unknown>) => Promise<IpcResult<SkillhubItem[]>>;
      skillStoreFetchIndex?: () => Promise<IpcResult<SkillhubItem[]>>;
      // 模型编辑与删除
      settingsDeleteModel?: (p: Record<string, unknown>) => Promise<IpcResult>;
      settingsEditModel?: (p: Record<string, unknown>) => Promise<IpcResult>;
      // 窗口控制（无边框窗口）
      windowMinimize?: () => void;
      windowMaximize?: () => void;
      windowClose?: () => void;
      // 已有声明
      openSettings?: () => void;
      openWebUI?: () => void;
      openExternal?: (url: string) => unknown;
    };
  }
}

// ---- 类型定义 ----

/** IPC 通用返回结构 */
export interface IpcResult<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
}

/** settingsGetAdvanced 返回数据 */
export interface AdvancedData {
  browserProfile: string;
  imessageEnabled: boolean;
  launchAtLoginSupported: boolean;
  launchAtLogin: boolean;
  sessionMemoryEnabled: boolean;
}

/** settingsGetConfig 返回数据（provider 信息） */
export interface ProviderData {
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

/** settingsGetChannelConfig 返回数据（飞书） */
export interface FeishuChannelData {
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

/** 企业微信频道数据 */
export interface WecomChannelData {
  botId: string;
  secret: string;
  enabled: boolean;
  dmPolicy: string;
  groupPolicy: string;
  groupAllowFrom: string[];
  bundled: boolean;
  bundleMessage: string;
}

/** 钉钉频道数据 */
export interface DingtalkChannelData {
  clientId: string;
  clientSecret: string;
  enabled: boolean;
  sessionTimeout: number;
  bundled: boolean;
  bundleMessage: string;
}

/** QQ Bot 频道数据 */
export interface QqbotChannelData {
  appId: string;
  clientSecret: string;
  enabled: boolean;
  markdownSupport: boolean;
  bundled: boolean;
  bundleMessage: string;
}

/** CLI 状态数据 */
export interface CliStatusData {
  installed: boolean;
  path?: string;
}

/** 关于信息 */
export interface AboutInfoData {
  aivoClawVersion: string;
  openClawVersion: string;
}

/** 更新状态 */
export interface UpdateStateData {
  status: "hidden" | "available" | "downloading" | "done" | "failed";
  version: string | null;
  percent: number | null;
  showBadge: boolean;
}

/** 频道汇总行（用于列表展示） */
export interface ChannelSummary {
  channel: string;
  label: string;
  iconName: string;
  iconBg: string;
  enabled: boolean;
}

/** 本地已安装技能信息 */
export interface LocalSkillInfo {
  slug: string;
  name: string;
  description: string;
  path: string;
}

/** Skillhub 技能索引条目 */
export interface SkillhubItem {
  slug: string;
  name: string;
  displayName?: string;
  description: string;
  version: string;
}

// ---- IPC 调用封装 ----

/**
 * 加载通用设置数据
 */
export async function loadAdvancedSettings(): Promise<AdvancedData | null> {
  try {
    const result = await window.aivoclaw?.settingsGetAdvanced?.();
    if (result?.success && result.data) {
      return result.data;
    }
  } catch {
    // 非 Electron 环境
  }
  return null;
}

/**
 * 保存通用设置
 */
export async function saveAdvancedSettings(params: Record<string, unknown>): Promise<IpcResult> {
  try {
    const result = await window.aivoclaw?.settingsSaveAdvanced?.(params);
    return result ?? { success: false, message: "IPC 不可用" };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

/**
 * 加载模型配置数据
 */
export async function loadProviderConfig(): Promise<ProviderData | null> {
  try {
    const result = await window.aivoclaw?.settingsGetConfig?.();
    if (result?.success && result.data) {
      return result.data;
    }
  } catch {
    // 非 Electron 环境
  }
  return null;
}

/**
 * 验证 API Key
 */
export async function verifyApiKey(params: Record<string, unknown>): Promise<IpcResult> {
  try {
    const result = await window.aivoclaw?.settingsVerifyKey?.(params);
    return result ?? { success: false, message: "IPC 不可用" };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

/**
 * 保存 provider 配置
 */
export async function saveProviderConfig(params: Record<string, unknown>): Promise<IpcResult> {
  try {
    const result = await window.aivoclaw?.settingsSaveProvider?.(params);
    return result ?? { success: false, message: "IPC 不可用" };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

/**
 * 获取 Gateway 端口
 */
export async function getGatewayPort(): Promise<number> {
  try {
    const port = await window.aivoclaw?.getGatewayPort?.();
    return port ?? 18789;
  } catch {
    return 18789;
  }
}

/**
 * 重启 Gateway
 */
export function restartGateway(): void {
  window.aivoclaw?.restartGateway?.();
}

/**
 * 加载所有频道配置汇总
 */
export async function loadChannelsSummary(): Promise<ChannelSummary[]> {
  const channels: ChannelSummary[] = [];

  // 飞书
  try {
    const feishu = await window.aivoclaw?.settingsGetChannelConfig?.();
    if (feishu?.success && feishu.data) {
      const d = feishu.data;
      if (d.appId) {
        channels.push({
          channel: "feishu",
          label: "飞书（Feishu）",
          iconName: "message-square",
          iconBg: "#3370ff",
          enabled: d.enabled,
        });
      }
    }
  } catch { /* 忽略 */ }

  // 企业微信
  try {
    const wecom = await window.aivoclaw?.settingsGetWecomConfig?.();
    if (wecom?.success && wecom.data) {
      const d = wecom.data;
      if (d.botId) {
        channels.push({
          channel: "wecom",
          label: "企业微信",
          iconName: "message-square",
          iconBg: "#07c160",
          enabled: d.enabled,
        });
      }
    }
  } catch { /* 忽略 */ }

  // 钉钉
  try {
    const dingtalk = await window.aivoclaw?.settingsGetDingtalkConfig?.();
    if (dingtalk?.success && dingtalk.data) {
      const d = dingtalk.data;
      if (d.clientId) {
        channels.push({
          channel: "dingtalk",
          label: "钉钉",
          iconName: "zap",
          iconBg: "#0089ff",
          enabled: d.enabled,
        });
      }
    }
  } catch { /* 忽略 */ }

  // QQ Bot
  try {
    const qqbot = await window.aivoclaw?.settingsGetQqbotConfig?.();
    if (qqbot?.success && qqbot.data) {
      const d = qqbot.data;
      if (d.appId) {
        channels.push({
          channel: "qqbot",
          label: "QQ Bot",
          iconName: "message-square",
          iconBg: "#12b7f5",
          enabled: d.enabled,
        });
      }
    }
  } catch { /* 忽略 */ }

  return channels;
}

/**
 * 加载飞书频道配置
 */
export async function loadFeishuConfig(): Promise<FeishuChannelData | null> {
  try {
    const result = await window.aivoclaw?.settingsGetChannelConfig?.();
    if (result?.success && result.data) {
      return result.data;
    }
  } catch { /* 忽略 */ }
  return null;
}

/**
 * 保存飞书频道配置
 */
export async function saveFeishuChannel(params: Record<string, unknown>): Promise<IpcResult> {
  try {
    const result = await window.aivoclaw?.settingsSaveChannel?.(params);
    return result ?? { success: false, message: "IPC 不可用" };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

/**
 * 保存企业微信配置
 */
export async function saveWecomChannel(params: Record<string, unknown>): Promise<IpcResult> {
  try {
    const result = await window.aivoclaw?.settingsSaveWecomConfig?.(params);
    return result ?? { success: false, message: "IPC 不可用" };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

/**
 * 保存钉钉配置
 */
export async function saveDingtalkChannel(params: Record<string, unknown>): Promise<IpcResult> {
  try {
    const result = await window.aivoclaw?.settingsSaveDingtalkConfig?.(params);
    return result ?? { success: false, message: "IPC 不可用" };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

/**
 * 保存 QQ Bot 配置
 */
export async function saveQqbotChannel(params: Record<string, unknown>): Promise<IpcResult> {
  try {
    const result = await window.aivoclaw?.settingsSaveQqbotConfig?.(params);
    return result ?? { success: false, message: "IPC 不可用" };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

/**
 * 加载 CLI 状态
 */
export async function loadCliStatus(): Promise<CliStatusData | null> {
  try {
    const result = await window.aivoclaw?.settingsGetCliStatus?.();
    if (result?.success && result.data) {
      return result.data;
    }
  } catch { /* 忽略 */ }
  return null;
}

/**
 * 安装 CLI
 */
export async function installCli(): Promise<IpcResult> {
  try {
    const result = await window.aivoclaw?.settingsInstallCli?.();
    return result ?? { success: false, message: "IPC 不可用" };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

/**
 * 卸载 CLI
 */
export async function uninstallCli(): Promise<IpcResult> {
  try {
    const result = await window.aivoclaw?.settingsUninstallCli?.();
    return result ?? { success: false, message: "IPC 不可用" };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

/**
 * 加载关于信息
 */
export async function loadAboutInfo(): Promise<AboutInfoData | null> {
  try {
    const result = await window.aivoclaw?.settingsGetAboutInfo?.();
    if (result) {
      return result;
    }
  } catch { /* 忽略 */ }
  return null;
}

/**
 * 检查更新
 */
export function checkForUpdates(): void {
  window.aivoclaw?.checkForUpdates?.();
}

/**
 * 获取更新状态
 */
export async function getUpdateState(): Promise<UpdateStateData | null> {
  try {
    const result = await window.aivoclaw?.getUpdateState?.();
    return result ?? null;
  } catch { /* 忽略 */ }
  return null;
}

/**
 * 下载并安装更新
 */
export async function downloadAndInstallUpdate(): Promise<boolean> {
  try {
    const result = await window.aivoclaw?.downloadAndInstallUpdate?.();
    return result ?? false;
  } catch {
    return false;
  }
}

// ---- 技能管理 IPC 封装（纯本地） ----

/**
 * 卸载技能
 */
export async function uninstallSkill(slug: string): Promise<IpcResult> {
  try {
    const result = await window.aivoclaw?.skillStoreUninstall?.({ slug });
    return result ?? { success: false, message: "IPC 不可用" };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

/**
 * 添加本地技能（弹出文件夹选择器）
 */
export async function addLocalSkill(): Promise<IpcResult> {
  try {
    const result = await window.aivoclaw?.skillStoreAddLocal?.();
    return result ?? { success: false, message: "IPC 不可用" };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

/**
 * 获取已安装技能的详细信息列表
 */
export async function loadInstalledSkillsDetail(): Promise<LocalSkillInfo[]> {
  try {
    const result = await window.aivoclaw?.skillStoreListInstalledDetail?.();
    if (result?.success && result.data) {
      return result.data;
    }
  } catch { /* 忽略 */ }
  return [];
}

/**
 * 删除指定 provider 下的指定模型
 */
export async function deleteModel(providerKey: string, modelId: string): Promise<IpcResult> {
  try {
    const result = await window.aivoclaw?.settingsDeleteModel?.({ providerKey, modelId });
    return result ?? { success: false, message: "IPC 不可用" };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

/**
 * 编辑指定 provider 下的模型配置
 */
export async function editModel(params: {
  providerKey: string;
  modelId: string;
  newModelId?: string;
  displayName?: string;
  apiKey?: string;
  baseURL?: string;
  api?: string;
}): Promise<IpcResult> {
  try {
    const result = await window.aivoclaw?.settingsEditModel?.(params as any);
    return result ?? { success: false, message: "IPC 不可用" };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

// ---- Skillhub 技能商店 IPC 封装 ----

/**
 * 搜索 Skillhub 技能
 * @param query - 搜索关键词
 */
export async function searchSkills(query: string): Promise<SkillhubItem[]> {
  try {
    const result = await window.aivoclaw?.skillStoreSearch?.({ query });
    if (result?.success && result.data) {
      return result.data;
    }
  } catch { /* 忽略 */ }
  return [];
}

/**
 * 获取 Skillhub 完整技能索引
 */
export async function fetchSkillIndex(): Promise<SkillhubItem[]> {
  try {
    const result = await window.aivoclaw?.skillStoreFetchIndex?.();
    if (result?.success && result.data) {
      return result.data;
    }
  } catch { /* 忽略 */ }
  return [];
}

/**
 * 从 Skillhub 安装技能
 * @param slug - 技能标识符
 */
export async function installSkillFromStore(slug: string): Promise<IpcResult> {
  try {
    const result = await window.aivoclaw?.skillStoreInstall?.({ slug });
    return result ?? { success: false, message: "IPC 不可用" };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}
