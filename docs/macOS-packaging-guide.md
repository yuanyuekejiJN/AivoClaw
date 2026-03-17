# AivoClaw macOS 打包与迁移指南

> 生成时间：2026-03-14
> 构建环境：Windows (交叉打包 macOS ARM64 + x64)
> OpenClaw 版本：2026.3.12
> Node.js 运行时：v22.22.1

---

## 一、构建概述

本次在 Windows 上交叉打包了两个 macOS 平台版本的 AivoClaw 资源，产物放置于 staging 目录，**未覆盖** client 项目中的现有文件。

| 平台 | 架构 | staging 路径 |
|------|------|-------------|
| macOS | ARM64 (Apple Silicon) | `_staging/darwin-arm64/aivoclaw/` |
| macOS | x64 (Intel) | `_staging/darwin-x64/aivoclaw/` |

---

## 二、构建命令

```bash
cd d:\project\aivoclaw

# macOS ARM64
node scripts/package-resources.js --platform darwin --arch arm64

# macOS x64
node scripts/package-resources.js --platform darwin --arch x64
```

构建流程（5 步）：
1. 下载 Node.js 22 运行时（darwin 对应架构的 tar.gz）
2. 写入 .npmrc（镜像源配置）
3. 安装 openclaw + clawhub 生产依赖
4. 注入插件（kimi-claw, kimi-search, qqbot, dingtalk, wecom）
5. 生成配置文件（build-info.json, analytics-config.json, app-icon.png）

---

## 三、Staging 产物结构

两个平台目录结构完全相同，仅 `runtime/` 中的 Node.js 二进制因架构不同：

```
_staging/darwin-{arm64|x64}/aivoclaw/
├── chat-ui/                          # 聊天 UI 前端
│   ├── index.html                    # 入口页（标题: AivoClaw）
│   ├── assets/                       # Vite 构建产物
│   │   ├── aivoclaw-logo-Fcm2GkPE.png
│   │   ├── index-Lm2haQ1m.js
│   │   ├── index-Lm2haQ1m.js.map
│   │   └── index-Semz0fXR.css
│   └── settings/                     # 设置页面
│       ├── index.html
│       ├── settings.js
│       ├── settings.css
│       ├── lucide-sprite.generated.js
│       └── share-copy-content.json
├── runtime/                          # Node.js 22 运行时
│   ├── node                          # Node.js 二进制（Mach-O）
│   ├── npm                           # npm 包装脚本
│   ├── npx                           # npx 包装脚本
│   └── vendor/
│       └── npm/                      # npm 完整模块
└── gateway/                          # OpenClaw Gateway
    ├── gateway-entry.mjs             # Gateway 入口
    ├── package.json
    ├── build-info.json               # 构建元数据
    └── node_modules/                 # 全部生产依赖
        ├── openclaw/                 # OpenClaw 核心 (v2026.3.12)
        ├── kimi-claw/                # Kimi 模型插件
        ├── openclaw-kimi-search/     # Kimi 搜索插件
        ├── @sliverp/qqbot/           # QQ 机器人插件
        ├── @dingtalk-real-ai/        # 钉钉连接器插件
        ├── @wecom/                   # 企微插件
        └── ...
```

### 各目录大小

| 目录 | ARM64 | x64 |
|------|-------|-----|
| chat-ui/ | ~4 MB | ~4 MB |
| runtime/ | ~124 MB | ~127 MB |
| gateway/ | ~464 MB | ~471 MB |
| **合计** | **~592 MB** | **~602 MB** |

---

## 四、迁移到 Client 项目

### 4.1 目标位置

```
d:\project\aivo\client\build\extraResources\aivoclaw\
├── chat-ui/        ← staging 的 chat-ui/
├── runtime/        ← staging 的 runtime/（平台相关）
├── gateway/        ← staging 的 gateway/（平台相关）
├── config/         ← 现有配置，不在迁移范围
├── settings/       ← 现有设置，不在迁移范围
└── skills/         ← 现有技能，不在迁移范围
```

### 4.2 迁移映射

| staging 源 | client 目标 | 说明 |
|-----------|------------|------|
| `chat-ui/index.html` | `aivoclaw/chat-ui/index.html` | 直接替换 |
| `chat-ui/assets/*` | `aivoclaw/chat-ui/assets/*` | 清空旧 assets 再复制 |
| `chat-ui/settings/*` | `aivoclaw/chat-ui/settings/*` | 直接替换 |
| `runtime/*` | `aivoclaw/runtime/*` | **平台相关**，按目标平台选择 |
| `gateway/*` | `aivoclaw/gateway/*` | **平台相关**，按目标平台选择 |

> `config/`、`skills/` 不在迁移范围，无需覆盖。

### 4.3 迁移命令

以 ARM64 为例（x64 将 `darwin-arm64` 替换为 `darwin-x64`）：

```bash
STAGING="d:/project/aivoclaw/_staging/darwin-arm64/aivoclaw"
TARGET="d:/project/aivo/client/build/extraResources/aivoclaw"

# 1. 备份（可选）
cp -r "$TARGET/chat-ui" "$TARGET/chat-ui.bak"
cp -r "$TARGET/runtime" "$TARGET/runtime.bak"
cp -r "$TARGET/gateway" "$TARGET/gateway.bak"

# 2. 清空并复制
rm -rf "$TARGET/chat-ui" "$TARGET/runtime" "$TARGET/gateway"
cp -r "$STAGING/chat-ui" "$TARGET/chat-ui"
cp -r "$STAGING/runtime" "$TARGET/runtime"
cp -r "$STAGING/gateway" "$TARGET/gateway"
```

### 4.4 迁移后验证

```bash
# 检查 Node.js 架构（macOS 上执行）
file $TARGET/runtime/node
# 预期: Mach-O 64-bit executable arm64（或 x86_64）

# 检查 build-info
cat $TARGET/gateway/build-info.json
# 预期: { "arch": "arm64", "platform": "darwin", ... }

# 检查 chat-ui 标题
grep "<title>" $TARGET/chat-ui/index.html
# 预期: <title>AivoClaw</title>
```

---

## 五、与 Windows 版本的差异

| 差异项 | Windows (当前 client) | macOS (本次打包) |
|--------|----------------------|-----------------|
| Node.js 二进制 | `node.exe` (87 MB) | `node` (Mach-O) |
| 包管理脚本 | `npm.cmd` / `npx.cmd` | `npm` / `npx`（shell 脚本） |
| npm 模块位置 | `node_modules/` 根级别 | `vendor/npm/` |
| Gateway 大小 | ~420 MB | ~464 MB (arm64) / ~471 MB (x64) |

> `chat-ui/` 是纯前端静态文件，所有平台完全相同，无需区分架构。

---

## 六、已知问题与修复

### 6.1 Windows 交叉打包 tar.gz 提取失败

**问题**：Git Bash 的 GNU tar 无法处理 macOS tar.gz 中的符号链接，导致提取失败。

**修复**：`scripts/package-resources.js` 的 `extractDarwin()` 已修改为在 Windows 上优先使用 `C:\Windows\System32\tar.exe`（bsdtar）：

```javascript
if (process.platform === "win32") {
  const sysTar = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  const tarBin = fs.existsSync(sysTar) ? `"${sysTar}"` : "tar";
  execSync(`${tarBin} xzf "${tarPath}" -C "${tmpDir}"`, { stdio: "inherit" });
} else {
  execSync(`tar xzf "${tarPath}" -C "${tmpDir}"`, { stdio: "inherit" });
}
```

### 6.2 下载缓存

Node.js 运行时下载到 `.cache/node/` 并持久缓存，重复打包无需重新下载：

```
.cache/node/
├── node-v22.22.1-darwin-arm64.tar.gz  (~50 MB)
├── node-v22.22.1-darwin-x64.tar.gz    (~52 MB)
└── node-v22.22.1-win-x64.zip          (~36 MB)
```

---

## 七、清理

迁移完成验证通过后，可删除 staging 目录释放空间（约 1.2 GB）：

```bash
rm -rf d:/project/aivoclaw/_staging/
```
