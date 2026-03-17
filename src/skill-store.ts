import { app, dialog, ipcMain } from "electron";
import { resolveUserStateDir } from "./constants";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import * as os from "os";
import * as log from "./logger";
import AdmZip from "adm-zip";

// 开发模式下打印日志
const debugLog = (msg: string) => {
  if (!app.isPackaged) log.info(`[skill-store] ${msg}`);
};

// ── Skillhub API 端点 ──

const SKILLHUB_INDEX_URL =
  "https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/skills.json";
const SKILLHUB_SEARCH_URL = "https://lightmake.site/api/v1/search";
const SKILLHUB_DOWNLOAD_PRIMARY = "https://lightmake.site/api/v1/download";
const SKILLHUB_DOWNLOAD_FALLBACK =
  "https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/skills";

// ── 类型定义 ──

/** 本地已安装技能的基本信息 */
export type LocalSkillInfo = {
  slug: string;
  name: string;
  description: string;
  path: string;
};

/** Skillhub 技能索引条目 */
export type SkillhubItem = {
  slug: string;
  name: string;
  displayName?: string;
  description: string;
  summary?: string;
  version: string;
  sha256?: string;
};

// ── 路径工具 ──

// 技能安装根目录：~/.openclaw/skills/
// 对应 gateway 的 openclaw-managed 源（CONFIG_DIR/skills/）
// 这个路径不依赖 workspace 解析，由 CONFIG_DIR 直接决定，最为可靠
function skillsBaseDir(): string {
  return path.join(resolveUserStateDir(), "skills");
}

// ── HTTP 工具 ──

/**
 * 发送 HTTP GET 请求，返回响应 Buffer
 * @param url - 请求 URL
 * @param timeoutMs - 超时时间（毫秒）
 * @returns 响应 Buffer
 */
function httpGet(url: string, timeoutMs = 15_000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      // 跟随重定向（最多 3 次）
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(res.headers.location, timeoutMs).then(resolve, reject);
        res.resume();
        return;
      }
      if (!res.statusCode || res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} — ${url}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`请求超时 (${timeoutMs}ms) — ${url}`));
    });
  });
}

/**
 * 发送 HTTP GET 请求，返回 JSON
 */
async function httpGetJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const buf = await httpGet(url, timeoutMs);
  return JSON.parse(buf.toString("utf-8")) as T;
}

// ── Skillhub 索引缓存 ──

let indexCache: { data: SkillhubItem[]; ts: number } | null = null;
const INDEX_CACHE_TTL = 5 * 60 * 1000; // 5 分钟

/**
 * 获取 Skillhub 技能索引（带 5 分钟缓存）
 * @returns 完整技能列表
 */
async function skillhubFetchIndex(): Promise<SkillhubItem[]> {
  // 命中缓存
  if (indexCache && Date.now() - indexCache.ts < INDEX_CACHE_TTL) {
    debugLog(`fetchIndex: cache hit (${indexCache.data.length} skills)`);
    return indexCache.data;
  }

  debugLog("fetchIndex: fetching from CDN...");
  const body = await httpGetJson<{ skills: SkillhubItem[] }>(SKILLHUB_INDEX_URL);
  const skills = (body.skills ?? []).map((s) => ({
    slug: s.slug,
    name: s.displayName || s.name || s.slug,
    displayName: s.displayName,
    description: s.summary || s.description || "",
    version: s.version || "",
    sha256: s.sha256,
  }));
  indexCache = { data: skills, ts: Date.now() };
  debugLog(`fetchIndex: cached ${skills.length} skills`);
  return skills;
}

/**
 * 搜索 Skillhub 技能
 * @param query - 搜索关键词
 * @param limit - 返回数量上限
 * @returns 匹配技能列表
 */
async function skillhubSearch(query: string, limit = 30): Promise<SkillhubItem[]> {
  const q = (query || "").trim();
  if (!q) return skillhubFetchIndex();

  try {
    debugLog(`search: query="${q}" limit=${limit}`);
    const url = `${SKILLHUB_SEARCH_URL}?q=${encodeURIComponent(q)}&limit=${limit}`;
    const body = await httpGetJson<{ results: SkillhubItem[] }>(url, 10_000);
    return (body.results ?? []).map((s) => ({
      slug: s.slug,
      name: s.displayName || s.name || s.slug,
      displayName: s.displayName,
      description: s.summary || s.description || "",
      version: s.version || "",
    }));
  } catch (err: any) {
    // 搜索 API 失败时回退到本地索引模糊匹配
    debugLog(`search API failed: ${err.message}, falling back to index filter`);
    const all = await skillhubFetchIndex();
    const needle = q.toLowerCase();
    return all.filter(
      (s) =>
        s.slug.toLowerCase().includes(needle) ||
        s.name.toLowerCase().includes(needle) ||
        s.description.toLowerCase().includes(needle),
    );
  }
}

// ── 技能安装（HTTP 下载 + zip 解压） ──

/**
 * 从 Skillhub 下载并安装技能
 * @param slug - 技能标识符
 * @returns 安装结果
 */
async function installSkill(slug: string): Promise<{ success: boolean; message?: string }> {
  if (!slug) return { success: false, message: "slug 不能为空" };

  const targetDir = path.join(skillsBaseDir(), slug);
  if (fs.existsSync(targetDir)) {
    return { success: false, message: `技能「${slug}」已存在，请先卸载后重试` };
  }

  // 下载 zip（主 URL → 备用 URL）
  let zipBuf: Buffer;
  const primaryUrl = `${SKILLHUB_DOWNLOAD_PRIMARY}?slug=${encodeURIComponent(slug)}`;
  const fallbackUrl = `${SKILLHUB_DOWNLOAD_FALLBACK}/${encodeURIComponent(slug)}.zip`;

  try {
    debugLog(`install: downloading from primary: ${primaryUrl}`);
    zipBuf = await httpGet(primaryUrl, 60_000);
  } catch (err: any) {
    debugLog(`install: primary download failed: ${err.message}, trying fallback`);
    try {
      zipBuf = await httpGet(fallbackUrl, 60_000);
    } catch (err2: any) {
      return { success: false, message: `下载失败: ${err2.message}` };
    }
  }

  // 解压到临时目录，再移动到目标位置
  const tmpDir = path.join(os.tmpdir(), `skillhub-${slug}-${Date.now()}`);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });

    const zip = new AdmZip(zipBuf);
    zip.extractAllTo(tmpDir, true);

    // 检测解压结构：可能是直接解压出文件，也可能是包裹在一个子目录中
    const entries = fs.readdirSync(tmpDir);
    let sourceDir = tmpDir;
    // 如果只有一个子目录且不含 SKILL.md，则进入该子目录
    if (entries.length === 1) {
      const onlyEntry = path.join(tmpDir, entries[0]);
      if (fs.statSync(onlyEntry).isDirectory()) {
        sourceDir = onlyEntry;
      }
    }

    // 验证 SKILL.md 存在
    if (!fs.existsSync(path.join(sourceDir, "SKILL.md"))) {
      return { success: false, message: "下载的技能包中未找到 SKILL.md" };
    }

    // 移动到目标目录
    fs.mkdirSync(skillsBaseDir(), { recursive: true });
    fs.cpSync(sourceDir, targetDir, { recursive: true });

    debugLog(`install: ${slug} installed to ${targetDir}`);
    return { success: true };
  } catch (err: any) {
    // 清理已部分写入的目标目录
    try {
      if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true });
    } catch { /* 忽略 */ }
    return { success: false, message: `安装失败: ${err.message}` };
  } finally {
    // 清理临时目录
    try {
      fs.rmSync(tmpDir, { recursive: true });
    } catch { /* 忽略 */ }
  }
}

// ── 本地技能管理（保留原有逻辑） ──

// 根据名称或 slug 解析实际安装目录名
function resolveInstalledSlug(nameOrSlug: string): string {
  const installed = listInstalledSkills();
  // 直接匹配目录名
  if (installed.includes(nameOrSlug)) return nameOrSlug;
  // 从 SKILL.md 读取 name 字段反查（支持 frontmatter `name:` 和 Markdown `# title`）
  const base = skillsBaseDir();
  const needle = nameOrSlug.toLowerCase();
  for (const dir of installed) {
    try {
      const md = fs.readFileSync(path.join(base, dir, "SKILL.md"), "utf-8");
      // frontmatter: name: xxx
      const fm = md.match(/^name:\s*["']?(.+?)["']?\s*$/m);
      if (fm && fm[1].trim().toLowerCase() === needle) return dir;
      // Markdown heading: # xxx
      const h1 = md.match(/^#\s+(.+)/m);
      if (h1 && h1[1].trim().toLowerCase() === needle) return dir;
    } catch { /* skip */ }
  }
  return nameOrSlug;
}

// 卸载技能（直接删除目录，不依赖 clawhub CLI）
async function uninstallSkill(slug: string): Promise<{ success: boolean; message?: string }> {
  try {
    const resolved = resolveInstalledSlug(slug);
    debugLog(`uninstall: "${slug}" → resolved="${resolved}"`);
    const targetDir = path.join(skillsBaseDir(), resolved);
    if (!fs.existsSync(targetDir)) {
      return { success: false, message: `技能「${resolved}」未安装` };
    }
    fs.rmSync(targetDir, { recursive: true });
    debugLog(`uninstall: removed ${targetDir}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err?.message ?? String(err) };
  }
}

// 列出本地已安装的技能 slug（直接读目录，不依赖 CLI）
function listInstalledSkills(): string[] {
  const base = skillsBaseDir();
  if (!fs.existsSync(base)) return [];
  try {
    return fs.readdirSync(base).filter((name) => {
      const dir = path.join(base, name);
      return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, "SKILL.md"));
    });
  } catch {
    return [];
  }
}

/**
 * 从 SKILL.md 解析技能的 name 和 description
 * @param skillDir - 技能目录的绝对路径
 * @returns name 和 description，解析失败时回退到目录名
 */
function parseSkillMd(skillDir: string): { name: string; description: string } {
  const mdPath = path.join(skillDir, "SKILL.md");
  let name = path.basename(skillDir);
  let description = "";

  try {
    const content = fs.readFileSync(mdPath, "utf-8");

    // 尝试 frontmatter: name: xxx
    const fmName = content.match(/^name:\s*["']?(.+?)["']?\s*$/m);
    if (fmName) name = fmName[1].trim();

    // 尝试 Markdown heading: # xxx（仅在 frontmatter 未匹配时使用）
    if (!fmName) {
      const h1 = content.match(/^#\s+(.+)/m);
      if (h1) name = h1[1].trim();
    }

    // 尝试 frontmatter: description: xxx
    const fmDesc = content.match(/^description:\s*["']?(.+?)["']?\s*$/m);
    if (fmDesc) {
      description = fmDesc[1].trim();
    } else {
      // 取第一个非空、非标题、非 frontmatter 行作为描述
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("#")) continue;
        if (trimmed === "---") continue;
        if (trimmed.match(/^\w+:/)) continue;
        description = trimmed;
        break;
      }
    }
  } catch { /* SKILL.md 读取失败，使用默认值 */ }

  return { name, description };
}

/**
 * 获取已安装技能的详细信息列表
 * @returns LocalSkillInfo 数组
 */
function getInstalledSkillsDetail(): LocalSkillInfo[] {
  const base = skillsBaseDir();
  const slugs = listInstalledSkills();
  return slugs.map((slug) => {
    const skillDir = path.join(base, slug);
    const { name, description } = parseSkillMd(skillDir);
    return { slug, name, description, path: skillDir };
  });
}

/**
 * 添加本地技能：验证文件夹含 SKILL.md，复制到技能目录
 * @param folderPath - 用户选择的技能文件夹路径
 * @returns 添加成功时返回 slug
 */
async function addLocalSkill(folderPath: string): Promise<{ success: boolean; slug?: string; message?: string }> {
  // 验证 SKILL.md 存在
  const skillMdPath = path.join(folderPath, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) {
    return { success: false, message: "所选文件夹中未找到 SKILL.md 文件" };
  }

  const slug = path.basename(folderPath);
  const targetDir = path.join(skillsBaseDir(), slug);

  // 检查是否已存在
  if (fs.existsSync(targetDir)) {
    return { success: false, message: `技能「${slug}」已存在，请先卸载后重试` };
  }

  try {
    // 确保目标目录的父目录存在
    fs.mkdirSync(skillsBaseDir(), { recursive: true });
    // 递归复制文件夹
    fs.cpSync(folderPath, targetDir, { recursive: true });
    debugLog(`addLocalSkill: copied "${folderPath}" → "${targetDir}"`);
    return { success: true, slug };
  } catch (err: any) {
    return { success: false, message: err?.message ?? String(err) };
  }
}

// ── IPC 注册 ──

// gateway 重启回调，由 main.ts 注入
let onGatewayRestart: (() => void) | null = null;

/**
 * 设置 gateway 重启回调（由 main.ts 在注册 IPC 后调用）
 */
export function setSkillStoreGatewayRestart(fn: () => void): void {
  onGatewayRestart = fn;
}

// 注册技能相关 IPC handler
export function registerSkillStoreIpc(): void {
  // 从 Skillhub 安装技能（HTTP 下载 + zip 解压）
  ipcMain.handle("skill-store:install", async (_event, params) => {
    debugLog(`ipc install slug=${params?.slug}`);
    const result = await installSkill(params?.slug ?? "");
    debugLog(`ipc install → ${result.success ? "ok" : result.message}`);
    // 安装成功后在主进程直接重启 gateway
    if (result.success && onGatewayRestart) {
      debugLog("install success → restarting gateway");
      onGatewayRestart();
    }
    return result;
  });

  // 卸载技能（直接删除目录）
  ipcMain.handle("skill-store:uninstall", async (_event, params) => {
    debugLog(`ipc uninstall slug=${params?.slug}`);
    const result = await uninstallSkill(params?.slug ?? "");
    debugLog(`ipc uninstall → ${result.success ? "ok" : result.message}`);
    // 卸载成功后在主进程直接重启 gateway
    if (result.success && onGatewayRestart) {
      debugLog("uninstall success → restarting gateway");
      onGatewayRestart();
    }
    return result;
  });

  // 列出已安装技能 slug
  ipcMain.handle("skill-store:list-installed", async () => {
    const installed = listInstalledSkills();
    debugLog(`ipc list-installed → [${installed.join(", ")}]`);
    return { success: true, data: installed };
  });

  // 返回已安装技能的详细信息列表（slug + name + description + path）
  ipcMain.handle("skill-store:list-installed-detail", async () => {
    const details = getInstalledSkillsDetail();
    debugLog(`ipc list-installed-detail → ${details.length} skills`);
    return { success: true, data: details };
  });

  // 弹出文件夹选择器 → 验证 SKILL.md → 复制到技能目录
  ipcMain.handle("skill-store:add-local", async () => {
    const result = await dialog.showOpenDialog({
      title: "选择技能文件夹",
      properties: ["openDirectory"],
      buttonLabel: "添加技能",
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: "已取消" };
    }

    const folderPath = result.filePaths[0];
    const addResult = await addLocalSkill(folderPath);
    // 添加成功后在主进程直接重启 gateway
    if (addResult.success && onGatewayRestart) {
      debugLog("add-local success → restarting gateway");
      onGatewayRestart();
    }
    return addResult;
  });

  // 搜索 Skillhub 技能
  ipcMain.handle("skill-store:search", async (_event, params) => {
    const query = params?.query ?? "";
    debugLog(`ipc search query="${query}"`);
    try {
      const results = await skillhubSearch(query, params?.limit ?? 30);
      return { success: true, data: results };
    } catch (err: any) {
      debugLog(`ipc search error: ${err.message}`);
      return { success: false, message: err.message };
    }
  });

  // 获取完整技能索引
  ipcMain.handle("skill-store:fetch-index", async () => {
    debugLog("ipc fetch-index");
    try {
      const skills = await skillhubFetchIndex();
      return { success: true, data: skills };
    } catch (err: any) {
      debugLog(`ipc fetch-index error: ${err.message}`);
      return { success: false, message: err.message };
    }
  });
}
