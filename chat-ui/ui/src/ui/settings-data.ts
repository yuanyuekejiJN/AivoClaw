import type {
  SessionGroup,
  ImChannel,
  ScheduledTask,
  ChatMessage,
  ArtifactItem,
  ActivityItem,
  McpServer,
  PointsLedgerRow,
  UsageBreakdownRow,
} from "./settings-types.ts";

export const DEMO_SESSIONS: SessionGroup[] = [
  {
    label: "今天",
    items: [
      { id: "s1", name: "数据分析助手", preview: "帮你分析销售数据趋势...", avatar: "assets/session-preset-avatar-main.png", meta: "10:32", active: true },
      { id: "s2", name: "Web 浏览助手", preview: "已完成网页内容抓取", avatar: "assets/session-preset-avatar-browser.png", meta: "09:15" },
      { id: "s3", name: "系统监控 Agent", preview: "CPU 使用率报告已生成", avatar: "assets/session-preset-avatar-monitor.png", meta: "昨天" },
    ],
  },
  {
    label: "本周",
    items: [
      { id: "s4", name: "代码审查助手", preview: "PR #142 审查完成", avatar: "assets/avatar-1.png", meta: "周一" },
      { id: "s5", name: "文档生成器", preview: "API 文档已更新", avatar: "assets/avatar-6.png", meta: "周一" },
    ],
  },
];

export const DEMO_IM_CHANNELS: ImChannel[] = [
  { id: "im1", name: "微信 · 产品群", preview: "王明: 新版本什么时候发布？", iconName: "message-circle", iconBg: "#07c160", meta: "", badge: 3, connected: true },
  { id: "im2", name: "飞书 · 技术组", preview: "李华: CI 流水线已修复", iconName: "send", iconBg: "#3370ff", meta: "14:20", connected: true },
  { id: "im3", name: "钉钉 · 运营通知", preview: "系统: 日报提醒", iconName: "zap", iconBg: "#0089ff", meta: "12:00", connected: true },
  { id: "im4", name: "Slack", preview: "点击连接 Slack 工作区", iconName: "slack", iconBg: "var(--theme-border)", meta: "连接", connected: false },
  { id: "im5", name: "邮件", preview: "连接邮箱收发消息", iconName: "mail", iconBg: "var(--theme-border)", meta: "连接", connected: false },
];

export const DEMO_SCHEDULED_TASKS: ScheduledTask[] = [
  { id: "t1", name: "每日数据同步", preview: "每天 08:00 · 从 API 拉取销售数据", iconName: "refresh-cw", iconColor: "var(--theme-success)", iconBg: "rgba(47,158,91,0.12)", status: "running" },
  { id: "t2", name: "周报自动生成", preview: "每周五 17:00 · 汇总本周工作", iconName: "file-text", iconColor: "var(--theme-success)", iconBg: "rgba(47,158,91,0.12)", status: "running" },
  { id: "t3", name: "竞品监控", preview: "每 6 小时 · 抓取竞品价格变动", iconName: "pause", iconColor: "var(--theme-warn)", iconBg: "rgba(200,135,43,0.12)", status: "paused" },
  { id: "t4", name: "邮件摘要推送", preview: "每天 09:00 · 汇总未读邮件", iconName: "mail", iconColor: "var(--theme-warn)", iconBg: "rgba(200,135,43,0.12)", status: "paused" },
];

export const DEMO_MESSAGES: ChatMessage[] = [
  { role: "user", content: "帮我分析一下上个月的销售数据，看看有哪些趋势？" },
  { role: "assistant", content: '好的，我来分析上个月的销售数据。从整体来看有以下几个关键趋势：<br><br>📈 <strong>整体增长：</strong>总销售额环比增长 12.3%，达到 ¥2,450,000<br><br>🏆 <strong>Top 品类：</strong>电子产品类别贡献最大，占总销售额的 35%<br><br>📅 <strong>时间分布：</strong>周末销售额明显高于工作日，平均高出 28%<br><br>需要我针对某个具体方面做深入分析吗？' },
  { role: "user", content: "能不能把周末和工作日的对比做成图表？" },
  { role: "assistant", content: '已为你生成对比图表，放在了 Artifacts 面板中。图表显示：<br><br>• 工作日平均日销售额：¥68,500<br>• 周末平均日销售额：¥87,700<br>• 差异最大的是周六，比工作日均值高 35%<br><br>你可以点击右侧的 <strong>Artifacts</strong> 按钮查看完整图表。' },
];

export const DEMO_ARTIFACTS: ArtifactItem[] = [
  { name: "销售数据对比图表", type: "Chart · 刚刚", iconName: "bar-chart-3" },
  { name: "月度销售报告.md", type: "Markdown · 10:30", iconName: "file-text" },
  { name: "raw_data_export.csv", type: "CSV · 10:28", iconName: "table" },
];

export const DEMO_ACTIVITIES: ActivityItem[] = [
  { time: "10:32:15", text: "图表生成完毕，已保存到 Artifacts", tag: "完成", tagClass: "success" },
  { time: "10:32:08", text: "调用 chart_generator 生成柱状图", tag: "工具调用", tagClass: "tool" },
  { time: "10:31:50", text: "正在处理销售数据，计算工作日与周末的差异...", tag: "思考", tagClass: "thinking" },
  { time: "10:30:22", text: "调用 data_analyzer 分析 sales_2024_02.csv", tag: "工具调用", tagClass: "tool" },
  { time: "10:30:05", text: "销售数据加载完成，共 1,247 条记录", tag: "完成", tagClass: "success" },
];

export const MODEL_OPTIONS = [
  "Claude 3.5 Sonnet",
  "Claude 3 Opus",
  "GPT-4o",
  "Gemini Pro",
  "DeepSeek V3",
];

export const DEMO_MCP_SERVERS: McpServer[] = [
  { name: "filesystem", enabled: true },
  { name: "web-search", enabled: true },
  { name: "postgres-db", enabled: false },
];

export const MCP_TEMPLATES = ["Filesystem", "SQLite", "PostgreSQL", "Web Search", "GitHub", "Puppeteer"];

export const DEMO_POINTS_LEDGER: PointsLedgerRow[] = [
  { desc: "对话消耗 · glm-4-plus", time: "2026-03-13 10:32", amount: "-45", type: "negative" },
  { desc: "对话消耗 · deepseek-chat", time: "2026-03-13 09:15", amount: "-12", type: "negative" },
  { desc: "每日签到奖励", time: "2026-03-13 08:00", amount: "+50", type: "positive" },
  { desc: "对话消耗 · glm-4-flash", time: "2026-03-12 17:45", amount: "-8", type: "negative" },
  { desc: "充值", time: "2026-03-12 14:00", amount: "+5,000", type: "positive" },
  { desc: "对话消耗 · claude-3.5-sonnet", time: "2026-03-12 11:20", amount: "-120", type: "negative" },
  { desc: "邀请奖励 · 用户 138****5678", time: "2026-03-11 16:30", amount: "+200", type: "positive" },
  { desc: "对话消耗 · gpt-4o", time: "2026-03-11 10:05", amount: "-85", type: "negative" },
];

export const DEMO_USAGE_BREAKDOWN: UsageBreakdownRow[] = [
  { model: "glm-4-plus", msgs: "486 msgs", totalWidth: "100%", inputWidth: "38%", inputTokens: "380.2 k", outputTokens: "~620.5 k", totalTokens: "~1.0 M" },
  { model: "deepseek-chat", msgs: "312 msgs", totalWidth: "72%", inputWidth: "30%", inputTokens: "298.7 k", outputTokens: "~423.1 k", totalTokens: "~721.8 k" },
  { model: "glm-4-flash", msgs: "258 msgs", totalWidth: "48%", inputWidth: "22%", inputTokens: "218.4 k", outputTokens: "~265.3 k", totalTokens: "~483.7 k" },
  { model: "claude-3.5-sonnet", msgs: "112 msgs", totalWidth: "30%", inputWidth: "12%", inputTokens: "125.0 k", outputTokens: "~178.6 k", totalTokens: "~303.6 k" },
  { model: "gpt-4o", msgs: "66 msgs", totalWidth: "10%", inputWidth: "4%", inputTokens: "38.2 k", outputTokens: "~62.5 k", totalTokens: "~100.7 k" },
];

export const PROVIDER_DOCS: Record<string, string> = {
  feishu: "https://docs.aivoclaw.ai/channels/feishu",
  wecom: "https://docs.aivoclaw.ai/channels/wecom",
  dingtalk: "https://docs.aivoclaw.ai/channels/dingtalk",
  qqbot: "https://docs.aivoclaw.ai/channels/qqbot",
};

export const MODEL_PROVIDERS = [
  { value: "zhipu", label: "ZhipuAI" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "minimax", label: "MiniMax" },
  { value: "kimi", label: "Kimi (Moonshot)" },
  { value: "custom", label: "Custom" },
];

/**
 * 厂商预设接口
 * 包含后端所需的全部参数，以及前端展示所需的推荐模型列表
 */
export interface ModelProviderPreset {
  /** 前端下拉选项值 */
  value: string;
  /** 前端显示名称 */
  label: string;
  /** 后端 provider 参数（anthropic / openai / google / moonshot / custom） */
  backendProvider: string;
  /** 后端 customPreset 参数（用于 CUSTOM_PROVIDER_PRESETS 匹配） */
  customPreset?: string;
  /** 后端 subPlatform 参数（moonshot 子平台） */
  subPlatform?: string;
  /** 预设 Base URL（前端展示用，实际保存以后端为准） */
  baseUrl: string;
  /** API 协议 */
  api: string;
  /** 推荐模型列表 */
  models: string[];
  /** API Key 输入框 label */
  apiKeyLabel?: string;
}

/**
 * 完整厂商预设数组
 * 选择厂商后自动填充 Base URL、API 协议，并提供模型下拉选择
 */
export const MODEL_PROVIDER_PRESETS: ModelProviderPreset[] = [
  {
    value: "anthropic",
    label: "Anthropic",
    backendProvider: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    api: "anthropic-messages",
    models: ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001", "claude-opus-4-20250514", "claude-3-5-sonnet-20241022"],
    apiKeyLabel: "Anthropic API Key",
  },
  {
    value: "openai",
    label: "OpenAI",
    backendProvider: "openai",
    baseUrl: "https://api.openai.com/v1",
    api: "openai-completions",
    models: ["gpt-4o", "gpt-4o-mini", "o1", "o3-mini", "gpt-4-turbo"],
    apiKeyLabel: "OpenAI API Key",
  },
  {
    value: "google",
    label: "Google",
    backendProvider: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    api: "google-generative-ai",
    models: ["gemini-2.0-flash", "gemini-2.5-pro", "gemini-2.0-flash-lite"],
    apiKeyLabel: "Google API Key",
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    backendProvider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    api: "openai-completions",
    models: ["deepseek-chat", "deepseek-reasoner"],
    apiKeyLabel: "DeepSeek API Key",
  },
  {
    value: "zhipu",
    label: "ZhipuAI (国内)",
    backendProvider: "custom",
    customPreset: "zai-cn",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    api: "openai-completions",
    models: ["glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx"],
  },
  {
    value: "zhipu-coding",
    label: "ZhipuAI (代码)",
    backendProvider: "custom",
    customPreset: "zai-cn-coding",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    api: "openai-completions",
    models: ["glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx"],
  },
  {
    value: "minimax",
    label: "MiniMax",
    backendProvider: "custom",
    customPreset: "minimax",
    baseUrl: "https://api.minimax.io/anthropic",
    api: "anthropic-messages",
    models: ["MiniMax-M2.5", "MiniMax-M2.5-highspeed"],
  },
  {
    value: "volcengine",
    label: "火山引擎",
    backendProvider: "custom",
    customPreset: "volcengine",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    api: "openai-completions",
    models: ["doubao-seed-1-8-251228", "doubao-seed-code-preview-251028", "deepseek-v3-2-251201"],
  },
  {
    value: "qwen",
    label: "通义千问",
    backendProvider: "custom",
    customPreset: "qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    api: "openai-completions",
    models: ["qwen-coder-plus-latest", "qwen-plus-latest", "qwen-max-latest", "qwen-turbo-latest"],
  },
  {
    value: "qwen-coding",
    label: "通义千问 (代码)",
    backendProvider: "custom",
    customPreset: "qwen-coding",
    baseUrl: "https://coding.dashscope.aliyuncs.com/v1",
    api: "openai-completions",
    models: ["qwen3.5-plus", "kimi-k2.5", "glm-5", "MiniMax-M2.5"],
  },
  {
    value: "moonshot-cn",
    label: "Moonshot (国内)",
    backendProvider: "moonshot",
    subPlatform: "moonshot-cn",
    baseUrl: "https://api.moonshot.cn/v1",
    api: "openai-completions",
    models: ["moonshot-v1-auto"],
    apiKeyLabel: "Moonshot API Key",
  },
  {
    value: "kimi-code",
    label: "Kimi Code",
    backendProvider: "moonshot",
    subPlatform: "kimi-code",
    baseUrl: "https://api.kimi.com/coding",
    api: "anthropic-messages",
    models: ["kimi-latest"],
    apiKeyLabel: "Kimi Code API Key",
  },
  {
    value: "custom",
    label: "自定义",
    backendProvider: "",
    baseUrl: "",
    api: "openai-completions",
    models: [],
  },
];

export const CHANGELOG_TEXT = `<strong>v2026.3.14</strong>

<strong>新功能</strong>
- 全新设置页 UI，采用分栏导航设计，涵盖通用、模型、技能、频道、关于等标签页
- 模型管理支持添加、编辑、删除模型配置，可在多供应商和多模型间自由切换
- 技能管理页按来源分组展示（内置、已安装、工作区、额外），支持启用/禁用切换及本地技能添加
- MCP 服务器管理，支持 stdio 和 SSE 两种连接方式
- 左侧边栏改版为会话列表 + 定时任务双标签页，支持新建、重命名、删除会话
- 顶部导航栏展示当前会话标题和 Agent 信息
- 深色/浅色主题切换，支持跟随系统自动适配
- 未配置模型时显示中文友好提示，引导前往设置页完成配置

<strong>改进</strong>
- 多模型供应商支持：Anthropic、OpenAI、Google、Moonshot 及自定义兼容接口
- 聊天消息中超链接颜色改为蓝色，与橙色气泡明确区分
- 设置页开关状态（工具调用详情、主题等）正确持久化并同步到聊天视图
- 打包脚本使用 cross-env 兼容 Windows 环境
- macOS 打包脚本修复 electron-builder 路径解析问题

<strong>修复</strong>
- 修复编辑模型时 API 协议值不正确导致网关无法启动的问题
- 修复删除所有模型后网关无法恢复的问题，新增最后一个模型删除保护
- 修复设置页工具调用详情开关无反应的问题
- 修复主题切换不持久化、关闭设置后状态丢失的问题
- 修复技能页仅显示内置技能、其他来源技能不可见的问题`;
