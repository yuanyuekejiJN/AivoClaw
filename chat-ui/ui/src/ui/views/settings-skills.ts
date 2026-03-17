import { html, nothing } from "lit";
import type { SettingsAppState, GatewaySkillItem } from "../settings-types.ts";
import { iconLoader, iconAlertTriangle, iconFolderPlus, iconTrash2, iconSearch, iconChevronRight } from "../icons-v2.ts";
import {
  addLocalSkill,
  uninstallSkill,
  loadInstalledSkillsDetail,
  searchSkills,
  fetchSkillIndex,
  installSkillFromStore,
} from "../settings-backend.ts";
import type { SkillhubItem } from "../settings-backend.ts";

// ── 技能商店状态（模块级） ──

// 置顶关键词：匹配 slug/name/description 的技能排在最前面
const PINNED_KEYWORDS = ["xiaohongshu", "xhs", "小红书"];

function matchesPinnedKeywords(skill: { slug: string; name: string; description: string }): boolean {
  const text = `${skill.slug}\x00${skill.name}\x00${skill.description}`.toLowerCase();
  return PINNED_KEYWORDS.some((kw) => text.includes(kw.toLowerCase()));
}

let storeSkills: SkillhubItem[] = [];
let storeLoading = false;
let storeError: string | null = null;
let storeSearchQuery = "";
let storeInstallingSlugs = new Set<string>();
let storeLoaded = false;

// 折叠状态（记录已折叠的栏目 id）
const collapsedSections = new Set<string>([
  "store", "built-in", "gateway-offline", "local",
]);

/**
 * 切换栏目折叠状态
 */
function toggleSection(app: SettingsAppState, sectionId: string) {
  if (collapsedSections.has(sectionId)) {
    collapsedSections.delete(sectionId);
  } else {
    collapsedSections.add(sectionId);
  }
  app.requestUpdate();
}

// 防抖计时器
let searchTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 并行加载本地技能和网关技能
 */
async function loadAllSkills(app: SettingsAppState) {
  app.skillsLoading = true;
  app.skillsError = null;
  app.requestUpdate();

  const [localResult, gatewayResult] = await Promise.allSettled([
    loadInstalledSkillsDetail(),
    app.loadGatewaySkills ? app.loadGatewaySkills() : Promise.resolve([]),
  ]);

  // 本地技能
  if (localResult.status === "fulfilled") {
    app.localSkills = localResult.value.map((s) => ({
      slug: s.slug,
      name: s.name,
      description: s.description,
    }));
  } else {
    app.skillsError = localResult.reason?.message ?? String(localResult.reason);
    app.localSkills = [];
  }

  // 网关技能
  if (gatewayResult.status === "fulfilled") {
    app.gatewaySkills = gatewayResult.value;
  } else {
    app.gatewaySkills = [];
  }

  app.skillsLoading = false;
  app.skillsLoaded = true;
  app.requestUpdate();
}

// ── 技能商店操作 ──

/**
 * 加载技能商店索引
 */
async function loadStoreIndex(app: SettingsAppState) {
  storeLoading = true;
  storeError = null;
  app.requestUpdate();

  try {
    storeSkills = await fetchSkillIndex();
    storeLoaded = true;
  } catch (err: any) {
    storeError = err?.message ?? "加载技能列表失败";
  } finally {
    storeLoading = false;
    app.requestUpdate();
  }
}

/**
 * 搜索技能商店（带 300ms 防抖）
 */
function handleStoreSearch(app: SettingsAppState, query: string) {
  storeSearchQuery = query;
  app.requestUpdate();

  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    storeLoading = true;
    app.requestUpdate();

    try {
      if (query.trim()) {
        storeSkills = await searchSkills(query);
      } else {
        storeSkills = await fetchSkillIndex();
      }
      storeError = null;
    } catch (err: any) {
      storeError = err?.message ?? "搜索失败";
    } finally {
      storeLoading = false;
      app.requestUpdate();
    }
  }, 300);
}

/**
 * 从商店安装技能
 */
async function handleStoreInstall(app: SettingsAppState, slug: string) {
  if (storeInstallingSlugs.has(slug)) return;

  storeInstallingSlugs = new Set(storeInstallingSlugs);
  storeInstallingSlugs.add(slug);
  app.requestUpdate();

  try {
    const result = await installSkillFromStore(slug);
    if (result.success) {
      await loadAllSkills(app);
    } else {
      alert(result.message || "安装失败");
    }
  } catch (err: any) {
    alert(err?.message ?? "安装失败");
  } finally {
    storeInstallingSlugs = new Set(storeInstallingSlugs);
    storeInstallingSlugs.delete(slug);
    app.requestUpdate();
  }
}

/**
 * 切换技能的启用/禁用状态
 */
async function handleToggleGatewaySkill(app: SettingsAppState, skill: GatewaySkillItem) {
  if (!app.toggleGatewaySkill || app.skillsBusyKey) return;

  const skillKey = skill.skillKey;
  const newEnabled = skill.disabled;

  app.skillsBusyKey = skillKey;
  app.requestUpdate();

  try {
    await app.toggleGatewaySkill(skillKey, newEnabled);
    if (app.loadGatewaySkills) {
      const updated = await app.loadGatewaySkills();
      app.gatewaySkills = updated;
    }
  } catch (err: any) {
    alert(err?.message ?? "操作失败");
  } finally {
    app.skillsBusyKey = null;
    app.requestUpdate();
  }
}

/**
 * 添加本地技能（弹出文件夹选择器）
 */
async function handleAddLocal(app: SettingsAppState) {
  const result = await addLocalSkill();
  if (result.success) {
    await loadAllSkills(app);
  } else if (result.message && result.message !== "已取消") {
    alert(result.message);
  }
}

/**
 * 卸载技能
 */
async function handleUninstall(app: SettingsAppState, slug: string) {
  const confirmed = window.confirm(`确定要卸载技能「${slug}」吗？`);
  if (!confirmed) return;

  app.skillRemoving = slug;
  app.requestUpdate();

  const result = await uninstallSkill(slug);

  app.skillRemoving = null;

  if (result.success) {
    app.localSkills = app.localSkills.filter((s) => s.slug !== slug);
  } else {
    alert(result.message || "卸载失败");
  }
  app.requestUpdate();
}

// ── 字母头像颜色 ──

const AVATAR_COLORS = [
  "#c0392b", "#d35400", "#e67e22", "#f39c12",
  "#27ae60", "#1abc9c", "#16a085", "#2980b9",
  "#3498db", "#8e44ad", "#9b59b6", "#34495e",
];

function avatarColor(slug: string): string {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = ((hash << 5) - hash + slug.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ── 渲染函数 ──

/**
 * 渲染单个商店技能卡片
 */
function renderStoreSkillCard(
  app: SettingsAppState,
  skill: SkillhubItem,
  installedSlugs: Set<string>,
) {
  const installed = installedSlugs.has(skill.slug);
  const installing = storeInstallingSlugs.has(skill.slug);
  const letter = (skill.name || skill.slug || "?").charAt(0).toUpperCase();
  const bgColor = avatarColor(skill.slug);

  return html`
    <div class="settings-skill-row">
      <div class="settings-skill-main">
        <div class="settings-skill-icon" style="background:${bgColor};color:#fff;">
          ${letter}
        </div>
        <div class="settings-skill-copy">
          <div class="settings-skill-title-row">
            <span class="settings-skill-title">${skill.name}</span>
            ${skill.version
              ? html`<span class="settings-skill-badge badge-version">v${skill.version}</span>`
              : nothing}
            ${installed
              ? html`<span class="settings-skill-badge badge-enabled">已安装</span>`
              : nothing}
          </div>
          ${skill.description
            ? html`<div class="settings-skill-description">${skill.description}</div>`
            : nothing}
        </div>
      </div>
      <div class="settings-skill-actions">
        ${installed
          ? app.skillRemoving === skill.slug
            ? html`<button class="settings-button settings-button-secondary" disabled>
                ${iconLoader("icon-sm icon-spin")} 卸载中...
              </button>`
            : html`<button class="settings-button settings-button-secondary"
                @click=${() => handleUninstall(app, skill.slug)}>
                ${iconTrash2("icon-sm")} 卸载
              </button>`
          : html`<button class="settings-button settings-button-primary"
              ?disabled=${installing}
              @click=${() => void handleStoreInstall(app, skill.slug)}>
              ${installing
                ? html`${iconLoader("icon-sm icon-spin")} 安装中...`
                : "安装"}
            </button>`}
      </div>
    </div>
  `;
}

/**
 * 渲染技能商店区域
 */
function renderSkillStore(app: SettingsAppState) {
  const installedSlugs = new Set(
    (app.localSkills ?? []).map((s) => s.slug),
  );

  // 首次加载
  if (!storeLoaded && !storeLoading) {
    queueMicrotask(() => void loadStoreIndex(app));
  }

  // 三级排序：置顶关键词 > 已安装 > 其余，同级按名称排序
  const sorted = [...storeSkills].sort((a, b) => {
    const ap = matchesPinnedKeywords(a) ? 0 : installedSlugs.has(a.slug) ? 1 : 2;
    const bp = matchesPinnedKeywords(b) ? 0 : installedSlugs.has(b.slug) ? 1 : 2;
    if (ap !== bp) return ap - bp;
    return a.name.localeCompare(b.name);
  });

  const storeCollapsed = collapsedSections.has("store");

  return html`
    <div class="settings-skills-section">
      <h2 class="settings-skills-section-title settings-skills-section-toggle"
        @click=${() => toggleSection(app, "store")}>
        <span class="settings-skills-chevron ${storeCollapsed ? "" : "expanded"}">
          ${iconChevronRight("icon-sm")}
        </span>
        技能商店
        <span class="settings-skills-count">12727</span>
        ${installedSlugs.size > 0
          ? html`<span class="settings-skills-count">${installedSlugs.size} 已安装</span>`
          : nothing}
      </h2>

      ${storeCollapsed ? nothing : html`
        <!-- 搜索栏 -->
        <div class="settings-store-search">
          <div class="settings-store-search-input-wrap">
            ${iconSearch("icon-sm")}
            <input
              type="text"
              class="settings-store-search-input"
              placeholder="搜索技能..."
              .value=${storeSearchQuery}
              @input=${(e: Event) => handleStoreSearch(app, (e.target as HTMLInputElement).value)}
            />
          </div>
        </div>

        <!-- 错误提示 -->
        ${storeError
          ? html`
              <div class="channel-setup-hint" style="border-left:3px solid var(--theme-danger);margin-bottom:12px;">
                <div class="channel-setup-hint-icon">${iconAlertTriangle("icon-sm")}</div>
                <div class="channel-setup-hint-text">
                  <div style="font-weight:600;margin-bottom:2px;color:var(--theme-danger);">加载失败</div>
                  <div style="font-size:12px;color:var(--theme-text-sec);">${storeError}</div>
                </div>
              </div>
            `
          : nothing}

        <!-- 技能列表 -->
        ${storeLoading
          ? html`<div style="padding:24px;text-align:center;color:var(--theme-text-ter);">
              ${iconLoader("icon-sm icon-spin")} 正在加载技能列表...
            </div>`
          : html`
              <div class="settings-skills-list">
                ${sorted.length === 0 && !storeError
                  ? html`<div style="padding:24px;text-align:center;color:var(--theme-text-ter);font-size:13px;">
                      ${storeSearchQuery ? "未找到匹配的技能" : "暂无技能"}
                    </div>`
                  : sorted.map((skill) => renderStoreSkillCard(app, skill, installedSlugs))}
              </div>
            `}
      `}
    </div>
  `;
}

/**
 * 渲染单个网关技能行（内置技能）
 */
function renderGatewaySkillRow(app: SettingsAppState, skill: GatewaySkillItem) {
  const busy = app.skillsBusyKey === skill.skillKey;
  // openclaw-managed 来源的技能支持卸载
  const isManaged = skill.source === "openclaw-managed";

  // 状态标签
  const statusBadge = skill.disabled
    ? html`<span class="settings-skill-badge badge-disabled">已禁用</span>`
    : skill.eligible === false
      ? html`<span class="settings-skill-badge badge-disabled">不可用</span>`
      : html`<span class="settings-skill-badge badge-enabled">已启用</span>`;

  // 缺失依赖提示
  const missingItems: string[] = [];
  if (skill.missing) {
    missingItems.push(...skill.missing.bins.map((b) => `命令: ${b}`));
    missingItems.push(...skill.missing.env.map((e) => `环境变量: ${e}`));
    missingItems.push(...skill.missing.config.map((c) => `配置: ${c}`));
    missingItems.push(...skill.missing.os.map((o) => `系统: ${o}`));
  }

  return html`
    <div class="settings-skill-row">
      <div class="settings-skill-main">
        <div class="settings-skill-icon">${skill.emoji || skill.name.charAt(0).toUpperCase()}</div>
        <div class="settings-skill-copy">
          <div class="settings-skill-title-row">
            <span class="settings-skill-title">${skill.name}</span>
            ${statusBadge}
          </div>
          ${skill.description
            ? html`<div class="settings-skill-description">${skill.description}</div>`
            : nothing}
          ${missingItems.length > 0
            ? html`<div class="settings-skill-missing">缺失: ${missingItems.join("、")}</div>`
            : nothing}
        </div>
      </div>
      <div class="settings-skill-actions">
        ${isManaged
          ? app.skillRemoving === skill.skillKey
            ? html`<button class="settings-button settings-button-secondary" disabled>
                ${iconLoader("icon-sm icon-spin")} 卸载中...
              </button>`
            : html`<button class="settings-button settings-button-secondary"
                @click=${() => void handleUninstall(app, skill.skillKey)}>
                ${iconTrash2("icon-sm")} 卸载
              </button>`
          : nothing}
        <button class="settings-button ${skill.disabled ? "settings-button-primary" : "settings-button-secondary"}"
          ?disabled=${busy}
          @click=${() => void handleToggleGatewaySkill(app, skill)}>
          ${busy
            ? html`${iconLoader("icon-sm icon-spin")} 处理中...`
            : skill.disabled ? "启用" : "禁用"}
        </button>
      </div>
    </div>
  `;
}

/**
 * 渲染内置技能区域（合并所有网关技能为一个列表）
 */
function renderBuiltInSkills(app: SettingsAppState) {
  const gatewaySkills = app.gatewaySkills ?? [];
  const hasGatewayLoader = !!app.loadGatewaySkills;
  const localSkills = app.localSkills ?? [];
  const collapsed = collapsedSections.has("built-in");

  // 网关未连接
  if (!hasGatewayLoader) {
    return html`
      <div class="settings-skills-section">
        <h2 class="settings-skills-section-title settings-skills-section-toggle"
          @click=${() => toggleSection(app, "built-in")}>
          <span class="settings-skills-chevron ${collapsed ? "" : "expanded"}">
            ${iconChevronRight("icon-sm")}
          </span>
          内置技能
        </h2>
        ${collapsed ? nothing : html`
          <div class="settings-skills-list">
            <div style="padding:24px;text-align:center;color:var(--theme-text-ter);font-size:13px;">
              网关未连接，无法加载技能
            </div>
          </div>

          <!-- 本地技能（网关离线时单独展示） -->
          ${localSkills.length > 0 ? html`
            <div style="padding:8px 0 4px;font-size:12px;color:var(--theme-text-ter);font-weight:500;">
              本地已安装
            </div>
            <div class="settings-skills-list">
              ${localSkills.map((skill) => html`
                <div class="settings-skill-row">
                  <div class="settings-skill-main">
                    <div class="settings-skill-icon">${skill.name.charAt(0).toUpperCase()}</div>
                    <div class="settings-skill-copy">
                      <div class="settings-skill-title-row">
                        <span class="settings-skill-title">${skill.name}</span>
                      </div>
                      ${skill.description
                        ? html`<div class="settings-skill-description">${skill.description}</div>`
                        : nothing}
                    </div>
                  </div>
                  <div class="settings-skill-actions">
                    ${app.skillRemoving === skill.slug
                      ? html`<button class="settings-button settings-button-secondary" disabled>
                          ${iconLoader("icon-sm icon-spin")} 卸载中...
                        </button>`
                      : html`<button class="settings-button settings-button-secondary"
                          @click=${() => handleUninstall(app, skill.slug)}>
                          ${iconTrash2("icon-sm")} 卸载
                        </button>`}
                  </div>
                </div>
              `)}
            </div>
          ` : nothing}
        `}
      </div>
    `;
  }

  // 网关已连接：过滤掉技能商店安装的技能（openclaw-managed），仅显示内置技能
  const builtInOnly = gatewaySkills.filter((s) => s.source !== "openclaw-managed");
  const totalCount = builtInOnly.length;

  return html`
    <div class="settings-skills-section">
      <h2 class="settings-skills-section-title settings-skills-section-toggle"
        @click=${() => toggleSection(app, "built-in")}>
        <span class="settings-skills-chevron ${collapsed ? "" : "expanded"}">
          ${iconChevronRight("icon-sm")}
        </span>
        内置技能
        ${totalCount > 0
          ? html`<span class="settings-skills-count">${totalCount}</span>`
          : nothing}
      </h2>
      ${collapsed ? nothing : html`
        <div class="settings-skills-list">
          ${totalCount === 0
            ? html`<div style="padding:24px;text-align:center;color:var(--theme-text-ter);font-size:13px;">
                暂无技能
              </div>`
            : builtInOnly.map((skill) => renderGatewaySkillRow(app, skill))}
        </div>
      `}
    </div>
  `;
}

export function renderSettingsSkills(app: SettingsAppState) {
  // 首次切换到技能 tab 时触发加载
  if (!app.skillsLoaded && !app.skillsLoading) {
    queueMicrotask(() => void loadAllSkills(app));
  }

  return html`
    <section class="settings-skills-page">
      <header class="settings-page-header">
        <div class="settings-page-heading-group">
          <h1 class="settings-page-title">技能</h1>
          <div class="settings-page-description">管理内置技能与商店技能</div>
        </div>
        <div class="settings-page-actions">
          <button class="settings-button settings-button-primary"
            ?disabled=${app.skillsLoading}
            @click=${() => void handleAddLocal(app)}>
            ${iconFolderPlus("icon-sm")} 添加本地技能
          </button>
        </div>
      </header>

      <!-- 错误提示 -->
      ${app.skillsError
        ? html`
            <div class="channel-setup-hint" style="border-left:3px solid var(--theme-danger);margin-bottom:16px;">
              <div class="channel-setup-hint-icon">${iconAlertTriangle("icon-sm")}</div>
              <div class="channel-setup-hint-text">
                <div style="font-weight:600;margin-bottom:2px;color:var(--theme-danger);">加载失败</div>
                <div style="font-size:12px;color:var(--theme-text-sec);">${app.skillsError}</div>
              </div>
            </div>
          `
        : nothing}

      ${app.skillsLoading
        ? html`<div style="padding:40px;text-align:center;color:var(--theme-text-ter);">
            ${iconLoader("icon-sm icon-spin")} 正在加载技能列表...
          </div>`
        : html`
            <!-- 内置技能（合并所有网关技能） -->
            ${renderBuiltInSkills(app)}

            <!-- 技能商店 -->
            ${renderSkillStore(app)}
          `}
    </section>
  `;
}
