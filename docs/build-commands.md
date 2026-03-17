# AivoClaw 构建命令速查

> 更新时间：2026-03-14
> Node.js 要求：>= 22.12.0

---

## 一、前端 chat-ui 打包

仅打包前端 UI（Vite 构建），产物输出到 `chat-ui/dist/`：

```bash
# 方式一：使用根目录 npm 脚本（推荐）
npm run build:chat

# 方式二：手动进入目录执行
cd chat-ui/ui
npm install
npx vite build
```

**产物位置**：`chat-ui/dist/`

| 文件 | 说明 |
|------|------|
| `index.html` | 入口页面 |
| `assets/index-*.js` | JS 主包（~245 kB，gzip ~77 kB） |
| `assets/index-*.css` | 样式文件（~99 kB，gzip ~17 kB） |
| `assets/aivoclaw-logo-*.png` | Logo 图片 |

---

## 二、完整构建（前端 + TypeScript 编译）

包含：生成 settings 图标 → 打包 chat-ui → 编译 TypeScript

```bash
npm run build
```

等价于依次执行：
```bash
npm run generate:settings-icons   # 生成 settings 页面图标
npm run build:chat                 # 打包前端 chat-ui
tsc -p tsconfig.json               # 编译主进程 TypeScript
```

---

## 三、本地开发

```bash
npm run dev
```

> `dev` 会自动先执行 `npm run build`，再启动 Electron。

---

## 四、打包安装包（各平台）

### macOS ARM64（Apple Silicon）

```bash
npm run dist:mac:arm64
```

### macOS x64（Intel）

```bash
npm run dist:mac:x64
```

### Windows x64

```bash
npm run dist:win:x64
```

### Windows ARM64

```bash
npm run dist:win:arm64
```

### 所有平台并行打包

```bash
npm run dist:all:parallel
```

**产物位置**：`out/<平台>/`，例如：
- `out/darwin-arm64/`
- `out/darwin-x64/`
- `out/win32-x64/`
- `out/win32-arm64/`

---

## 五、清理构建产物

```bash
npm run clean
```

清除以下目录：`dist/`、`resources/runtime`、`resources/gateway`、`resources/targets`、`out/`

---

## 六、流程总览

```
npm run build:chat          仅前端打包（日常开发调试）
       ↓
npm run build               完整构建（发版前必做）
       ↓
npm run dist:mac:arm64      打包对应平台安装包
```
