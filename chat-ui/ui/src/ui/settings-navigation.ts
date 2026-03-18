import type { SettingsTab } from "./settings-types.ts";

export interface SettingsNavEntry {
  key: SettingsTab;
  label: string;
  icon: string; // icon function name from icons.ts
}

export const SETTINGS_NAV: SettingsNavEntry[] = [
  { key: "general", label: "通用", icon: "slidersHorizontal" },
  // { key: "usage", label: "用量统计", icon: "barChart2" },       // 暂无后端支持
  // { key: "points", label: "积分", icon: "coins" },              // 暂无后端支持
  { key: "models", label: "模型与 API", icon: "cpu" },
  // { key: "mcp", label: "MCP 服务", icon: "plug" },              // 暂无后端支持
  { key: "skills", label: "技能", icon: "zap" },
  { key: "channels", label: "IM 通道", icon: "messageSquare" },
  // { key: "workspace", label: "工作空间", icon: "folder" },      // 暂无后端支持
  // { key: "privacy", label: "隐私", icon: "shield" },            // 暂无后端支持
  // { key: "feedback", label: "反馈", icon: "messageCircle" },    // 暂无后端支持
  { key: "about", label: "关于", icon: "info" },
];
