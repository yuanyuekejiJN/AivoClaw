# AivoClaw 会员算力聊天功能 — 技术规划文档

> 版本: v1.0
> 日期: 2026-03-14
> 状态: 规划中

---

## 目录

- [1. 项目背景](#1-项目背景)
- [2. 现状分析](#2-现状分析)
- [3. 核心设计决策](#3-核心设计决策)
- [4. 整体架构](#4-整体架构)
- [5. 功能模块详细设计](#5-功能模块详细设计)
  - [5.1 Server 端新增](#51-server-端新增yyac-server)
  - [5.2 AivoClaw 客户端新增](#52-aivoclaw-客户端新增)
  - [5.3 管理后台新增](#53-管理后台新增yyac-admin)
- [6. 积分扣减流程](#6-积分扣减流程)
- [7. 安全设计](#7-安全设计)
- [8. 数据模型设计](#8-数据模型设计)
- [9. API 接口清单](#9-api-接口清单)
- [10. 开发任务分解](#10-开发任务分解)
- [11. 风险与注意事项](#11-风险与注意事项)

---

## 1. 项目背景

### 1.1 涉及项目

| 项目 | 代号 | 说明 |
|------|------|------|
| **容剪 client** | `aivo/client` | 智能视频自动剪辑桌面应用（Electron + Vue 3 + Go） |
| **AivoClaw** | `aivoclaw` | AI 对话桌面客户端（Electron + Lit 3 + OpenClaw Gateway） |
| **yyac-server** | `aivo/template/yyac-server` | 统一后台服务（Koa + MySQL + Redis） |
| **yyac-admin** | `aivo/template/yyac-admin` | 管理后台前端（Vue 3 + Element Plus） |

### 1.2 需求概述

在 AivoClaw 中增加会员算力聊天功能：

1. **默认走系统内置 Key**：用户无需自己申请 API Key，直接使用系统内置的 Key 进行 AI 对话，消耗账户积分
2. **Key 安全不泄露**：系统 Key 永远不离开 server，通过 server 代理 AI 请求
3. **积分计费**：按实际 token 消耗扣减积分，支持充值购买
4. **自有 Key 模式**：用户可在管理页面切换为自己的 Key，不走积分扣分
5. **统一会员**：与容剪共用同一套会员体系（微信扫码登录、统一积分池）

---

## 2. 现状分析

### 2.1 各项目现有能力

| 能力 | 容剪 client | AivoClaw | yyac-server |
|------|------------|----------|-------------|
| 用户登录 | 微信扫码 OAuth | 无 | 微信 OAuth 回调 + JWT 签发 |
| 会员模型 | 前端展示 + 校验 | 无 | member 表（isVip, points, vipExpireTime） |
| 积分系统 | 前端展示积分 | 无（仅用量统计） | pointsChangeRecord 变动记录 |
| 支付系统 | 微信扫码支付 UI | 无 | 微信 Native 支付（创建订单→回调→发放权益） |
| VIP 套餐 | 展示 + 购买 | 无 | MEMBER / POINTS / COMBO 三种套餐类型 |
| AI 对话 | 无 | 完整聊天（多 Provider） | 无 |
| API Key 管理 | 无 | 本地存储多 Provider Key | 无 |
| 每日限制 | featureLimit（模式/工具分日限制） | 无 | feature-config API |

### 2.2 容剪登录流程（已有）

```
用户点击登录
    → WxLoginComponent 加载微信二维码 iframe
    → 用户扫码
    → 微信回调 → Go 代理 → yyac-server /api/wechat/callback
    → server 用 code 换 access_token，获取用户信息
    → 未注册则自动创建 member
    → 返回 JWT Token + userInfo
    → 前端 postMessage 回调
    → MainLayout 保存到 Electron 加密存储
    → App.vue 将 Token 推送到 Go 服务缓存
```

### 2.3 AivoClaw 现有 Provider 架构

```
~/.openclaw/openclaw.json
├── models.providers[]
│   ├── type: "anthropic" | "openai" | "google" | "moonshot" | "custom"
│   ├── apiKey: "sk-xxx"
│   ├── baseURL: "https://api.anthropic.com/v1"
│   └── modelID: "claude-sonnet-4-20250514"
└── gateway.auth.token: "随机 hex token"

Setup/Settings 页面 → IPC → provider-config.ts → writeUserConfig() → 重启 Gateway
```

---

## 3. 核心设计决策

### 3.1 统一会员体系

**决策：共用一套 yyac-server 会员系统，不新建独立用户体系。**

理由：
- server 已有完整的 `member` 模型，含 `points` 积分字段和 `pointsChangeRecord` 变动记录
- 微信扫码登录全链路已打通（server 的 `/api/wechat/callback`）
- 套餐系统已支持 `POINTS`（积分套餐）和 `COMBO`（组合套餐）
- 微信支付流程已跑通（创建订单 → 轮询状态 → 权益发放）
- 用户一个微信号同时管理容剪 VIP + AivoClaw 算力

**核心公式：一个微信账号 = 一个 member → VIP 天数（容剪）+ 算力积分（AivoClaw）**

### 3.2 双模式运行

| 模式 | 使用的 Key | 计费方式 | 适用场景 |
|------|-----------|---------|---------|
| **算力模式（默认）** | 系统内置 Key（用户不可见） | 消耗账户积分 | 普通用户 |
| **自有 Key 模式** | 用户自行配置的 Key | 不消耗积分 | 高级用户/开发者 |

### 3.3 AI 请求代理方案

**决策：采用 Server 完全代理模式（方案 A）。**

| 方案 | 描述 | 安全性 | 延迟 | 复杂度 |
|------|------|--------|------|--------|
| **A. Server 完全代理** ✅ | AI 请求发到 server，server 转发 AI API | 最高（Key 不离开 server） | 略高 | 中 |
| B. 临时 Key 下发 | server 下发短期 Key，客户端直连 AI API | 中（有暴露窗口） | 低 | 高 |

方案 A 的 Key 永远不离开 server，是安全性最高的选择。

### 3.4 登录态共享

**决策：独立登录，共享会员账户。**

- 容剪和 AivoClaw 各自维护独立的登录态（各自持有 JWT Token）
- 同一个微信账号 → 同一个 member 记录
- 积分余额实时从 server 查询，天然同步
- 不需要应用间 IPC 通信

```
容剪  → 微信扫码 → server → member(id=123, points=5000, isVip=1)
AivoClaw → 微信扫码 → server → member(id=123, points=5000, isVip=1)
                                  ↑ 同一个 member 记录
```

---

## 4. 整体架构

### 4.1 架构总览

```
┌───────────────────────────────────────────────────────────────┐
│                      AivoClaw 桌面端                           │
│                                                               │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Chat UI   │  │  登录/充值    │  │  设置页                │ │
│  │  (Lit 3)   │  │  微信扫码弹窗  │  │  算力模式 / 自有Key    │ │
│  └─────┬──────┘  └──────┬───────┘  └────────────┬───────────┘ │
│        │                │                        │             │
│  ┌─────▼────────────────▼────────────────────────▼───────────┐ │
│  │                 Electron 主进程                             │ │
│  │                                                            │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │ │
│  │  │ credits-     │  │ credits-     │  │ credits-         │ │ │
│  │  │ auth.ts      │  │ proxy.ts     │  │ mode.ts          │ │ │
│  │  │ 登录+JWT管理  │  │ AI请求代理    │  │ 模式切换管理      │ │ │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘ │ │
│  └─────┬──────────────────────┬──────────────────────────────┘ │
│        │                      │                                │
│  ┌─────▼──────┐         ┌────▼──────┐                          │
│  │  OpenClaw  │         │ 积分代理   │                          │
│  │  Gateway   │         │ 服务       │                          │
│  └─────┬──────┘         └────┬──────┘                          │
└────────┼──────────────────────┼────────────────────────────────┘
         │                      │
    ┌────▼─────┐          ┌─────▼────────────────┐
    │ AI API   │          │    yyac-server        │
    │ Provider │          │    (统一后台)          │
    │(自有Key) │          │                       │
    └──────────┘          │  ┌─────────────────┐  │
                          │  │ AI 代理模块      │  │
                          │  │ 系统Key → AI API │  │
                          │  └─────────────────┘  │
                          │  ┌─────────────────┐  │
                          │  │ 积分扣减模块     │  │
                          │  └─────────────────┘  │
                          │  ┌─────────────────┐  │
                          │  │ 会员/支付/套餐   │  │
                          │  └─────────────────┘  │
                          └───────────────────────┘
```

### 4.2 请求流程（算力模式）

```
用户发消息
    │
    ▼
Chat UI (WebSocket) → OpenClaw Gateway
    │
    ▼
Gateway 检测 Provider 类型
    ├── 自有 Key Provider → 直连 AI API（不经过 server）
    └── 系统 Provider → 请求发往 server
                │
                ▼
        POST /api/ai/chat
        Headers: Authorization: Bearer <JWT>
        Body: { model, messages, stream: true }
                │
                ▼
        yyac-server 处理：
        1. 验证 JWT → 获取 memberId
        2. 查询 member.points → 余额不足返回 402
        3. 创建 credits_transaction (PENDING)
        4. 从 system_keys 表取可用 Key
        5. 用系统 Key 调用 AI API (SSE 流式)
        6. 流式转发给客户端，累计 token 数
        7. 完成后计算积分：token × 模型单价
        8. member.points -= 实际消耗
        9. 更新 credits_transaction (COMPLETED)
        10. 记录 pointsChangeRecord (AI_CHAT)
                │
                ▼
        返回 AI 响应 + 积分消耗信息
```

### 4.3 请求流程（自有 Key 模式）

```
用户发消息
    │
    ▼
Chat UI (WebSocket) → OpenClaw Gateway
    │
    ▼
Gateway 使用用户配置的 Provider（apiKey, baseURL）
    │
    ▼
直连 AI API（Anthropic / OpenAI / Google / Moonshot / Custom）
    │
    ▼
流式返回 → Chat UI 渲染
（不经过 server，不消耗积分）
```

---

## 5. 功能模块详细设计

### 5.1 Server 端新增（yyac-server）

#### 5.1.1 系统 Key 管理

**数据模型 `system_key`：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| provider | VARCHAR(50) | 供应商：anthropic / openai / google |
| keyAlias | VARCHAR(100) | Key 别名（方便管理辨识） |
| encryptedKey | TEXT | AES-256-GCM 加密后的 API Key |
| baseURL | VARCHAR(500) | API 端点地址 |
| modelWhitelist | JSON | 该 Key 允许使用的模型列表 |
| status | TINYINT | 0=禁用 1=启用 2=额度耗尽 |
| priority | INT | 优先级（越小越优先） |
| dailyLimit | INT | 每日请求次数上限（0=不限） |
| dailyUsed | INT | 今日已用次数 |
| totalUsed | INT | 累计使用次数 |
| lastUsedAt | DATETIME | 最后使用时间 |
| lastErrorAt | DATETIME | 最后错误时间 |
| lastError | TEXT | 最后错误信息 |
| createdAt | DATETIME | 创建时间 |
| updatedAt | DATETIME | 更新时间 |

**Key 选取策略：**

```
1. 按 provider 筛选 status=1 的 Key
2. 排除 dailyUsed >= dailyLimit 的 Key
3. 按 priority ASC 排序
4. 同优先级内加权轮询（避免单 Key 过热）
5. 如果 Key 调用失败（401/429），标记 lastError 并降级
```

#### 5.1.2 积分定价配置

**数据模型 `credits_pricing`：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| provider | VARCHAR(50) | 供应商 |
| modelId | VARCHAR(100) | 模型标识（如 claude-sonnet-4-20250514） |
| modelName | VARCHAR(100) | 模型显示名（如 Claude Sonnet） |
| inputPrice | DECIMAL(10,4) | 输入价格（积分/千token） |
| outputPrice | DECIMAL(10,4) | 输出价格（积分/千token） |
| cacheReadPrice | DECIMAL(10,4) | 缓存读取价格（积分/千token） |
| cacheWritePrice | DECIMAL(10,4) | 缓存写入价格（积分/千token） |
| status | TINYINT | 0=下架 1=上架 |
| sortOrder | INT | 排序（客户端模型列表展示顺序） |
| createdAt | DATETIME | 创建时间 |
| updatedAt | DATETIME | 更新时间 |

**默认定价参考（可通过管理后台动态调整）：**

| 模型 | 输入（积分/千token） | 输出（积分/千token） | 说明 |
|------|---------------------|---------------------|------|
| Claude Sonnet | 3 | 15 | 主力模型 |
| Claude Haiku | 1 | 5 | 轻量模型 |
| GPT-4o | 5 | 15 | 高端模型 |
| GPT-4o-mini | 0.5 | 2 | 经济模型 |
| DeepSeek-V3 | 0.5 | 2 | 国产经济模型 |

#### 5.1.3 算力交易记录

**数据模型 `credits_transaction`：**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT AUTO_INCREMENT | 主键 |
| transactionNo | VARCHAR(50) | 交易流水号（唯一） |
| memberId | INT | 关联 member.id |
| type | ENUM | CHAT / RECHARGE / REFUND / REWARD / SYSTEM |
| status | ENUM | PENDING / COMPLETED / FAILED / REFUNDED |
| amount | DECIMAL(10,2) | 积分变动量（消耗为负，充值为正） |
| balanceBefore | DECIMAL(10,2) | 变动前余额 |
| balanceAfter | DECIMAL(10,2) | 变动后余额 |
| provider | VARCHAR(50) | AI 供应商（仅 CHAT 类型） |
| modelId | VARCHAR(100) | 使用的模型（仅 CHAT 类型） |
| inputTokens | INT | 输入 token 数（仅 CHAT 类型） |
| outputTokens | INT | 输出 token 数（仅 CHAT 类型） |
| cacheReadTokens | INT | 缓存读取 token 数 |
| cacheWriteTokens | INT | 缓存写入 token 数 |
| sessionId | VARCHAR(100) | 对话会话 ID |
| systemKeyId | INT | 使用的系统 Key ID |
| remark | VARCHAR(500) | 备注 |
| createdAt | DATETIME | 创建时间 |
| updatedAt | DATETIME | 更新时间 |

#### 5.1.4 AI 代理模块

**核心文件结构：**

```
yyac-server/src/
├── controllers/
│   ├── aiProxyController.ts       # AI 代理路由控制器
│   ├── systemKeyController.ts     # 系统 Key 管理控制器
│   └── creditsPricingController.ts # 积分定价管理控制器
├── services/
│   ├── aiProxyService.ts          # AI 代理核心逻辑
│   │   ├── chat()                 # 代理聊天请求（SSE 流式）
│   │   ├── estimateCost()         # 预估消耗
│   │   └── getAvailableModels()   # 获取可用模型列表
│   ├── systemKeyService.ts        # 系统 Key CRUD + 选取策略
│   │   ├── selectKey()            # 智能 Key 选取
│   │   ├── markKeyError()         # Key 错误标记
│   │   └── resetDailyUsage()      # 每日重置用量（定时任务）
│   ├── creditsService.ts          # 积分操作
│   │   ├── deduct()               # 扣减积分
│   │   ├── recharge()             # 充值积分
│   │   ├── getBalance()           # 查询余额
│   │   └── getRecords()           # 查询变动记录
│   └── creditsPricingService.ts   # 定价管理
├── models/
│   ├── systemKey.model.ts         # 系统 Key 数据模型
│   ├── creditsPricing.model.ts    # 积分定价数据模型
│   └── creditsTransaction.model.ts # 交易记录数据模型
└── routes/
    ├── aiProxy.route.ts           # /api/ai/* 路由
    ├── systemKey.route.ts         # /system-key/* 路由
    └── creditsPricing.route.ts    # /credits-pricing/* 路由
```

**SSE 流式代理实现要点：**

```typescript
// aiProxyService.ts 核心伪代码
async chat(memberId: number, req: ChatRequest, res: ServerResponse) {
  // 1. 验证余额
  const member = await Member.findByPk(memberId);
  if (member.points <= 0) {
    throw new InsufficientCreditsError();
  }

  // 2. 创建待处理交易
  const transaction = await CreditsTransaction.create({
    transactionNo: generateTransactionNo(),
    memberId,
    type: 'CHAT',
    status: 'PENDING',
    provider: req.provider,
    modelId: req.model,
    balanceBefore: member.points,
  });

  // 3. 选取系统 Key
  const systemKey = await SystemKeyService.selectKey(req.provider, req.model);
  const decryptedKey = decrypt(systemKey.encryptedKey);

  // 4. 调用 AI API（SSE 流式）
  let inputTokens = 0, outputTokens = 0;

  const aiResponse = await fetch(systemKey.baseURL + '/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${decryptedKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: req.model,
      messages: req.messages,
      stream: true,
    }),
  });

  // 5. 流式转发 + 累计 token
  res.setHeader('Content-Type', 'text/event-stream');
  for await (const chunk of aiResponse.body) {
    res.write(chunk);
    // 从 chunk 解析 usage 信息累加 token 数
  }

  // 6. 计算积分消耗
  const pricing = await CreditsPricing.findOne({
    where: { provider: req.provider, modelId: req.model }
  });
  const cost = (inputTokens / 1000) * pricing.inputPrice
             + (outputTokens / 1000) * pricing.outputPrice;

  // 7. 扣减积分（原子操作）
  await sequelize.transaction(async (t) => {
    await Member.decrement('points', {
      by: cost,
      where: { id: memberId },
      transaction: t,
    });
    await transaction.update({
      status: 'COMPLETED',
      amount: -cost,
      balanceAfter: member.points - cost,
      inputTokens,
      outputTokens,
    }, { transaction: t });
  });

  // 8. 发送积分消耗信息（最后一个 SSE 事件）
  res.write(`data: ${JSON.stringify({
    type: 'credits_usage',
    cost,
    balance: member.points - cost,
    inputTokens,
    outputTokens,
  })}\n\n`);
  res.end();
}
```

#### 5.1.5 套餐扩展

在现有套餐体系基础上，新增算力相关套餐：

| 套餐名 | 类型 | 积分数 | 参考价格 | 说明 |
|-------|------|-------|---------|------|
| 算力体验包 | POINTS | 1,000 | ¥9.9 | 约 33 万 token (Sonnet) |
| 算力基础包 | POINTS | 5,000 | ¥39.9 | 约 166 万 token |
| 算力专业包 | POINTS | 20,000 | ¥129.9 | 约 666 万 token |
| 容剪 + 算力组合包 | COMBO | VIP 30天 + 10,000 积分 | ¥199 | 全能套餐 |

现有 `package.model.ts` 的 `packageType` 已支持 `POINTS` 和 `COMBO`，无需修改模型，只需在管理后台添加新套餐即可。

---

### 5.2 AivoClaw 客户端新增

#### 5.2.1 新增模块文件

```
aivoclaw/src/
├── credits-auth.ts         # 微信扫码登录 + JWT Token 管理
├── credits-proxy.ts        # AI 请求代理拦截层（算力模式核心）
├── credits-mode.ts         # 模式切换管理（算力 / 自有 Key）
└── credits-ipc.ts          # 积分相关 IPC handler 集中注册
```

#### 5.2.2 微信扫码登录（credits-auth.ts）

**实现方式：** 在 BrowserWindow 内打开微信 OAuth 页面，复用 yyac-server 的 `/api/wechat/callback` 回调。

```
┌─────────────────────────────────────────────────────┐
│                  AivoClaw 主窗口                     │
│                                                     │
│  侧边栏底部：                                        │
│  ┌─────────────────┐                                │
│  │ 🔑 未登录        │  ← 点击弹出登录窗口            │
│  │ [登录/注册]      │                                │
│  └─────────────────┘                                │
│                                                     │
│  登录后：                                            │
│  ┌─────────────────┐                                │
│  │ 🟢 张三          │                                │
│  │ 积分: 2,350      │                                │
│  │ [充值] [退出]    │                                │
│  └─────────────────┘                                │
└─────────────────────────────────────────────────────┘
```

**登录流程：**

```
1. 用户点击"登录"
2. Electron 打开新 BrowserWindow（宽 400 × 高 500）
   └── 加载微信 OAuth URL（从 server /api/wechat/login-config 获取参数构建）
3. 用户扫码确认
4. 微信回调 → yyac-server /api/wechat/callback → 返回 HTML + postMessage
5. 登录窗口捕获 message 事件，提取 { token, userInfo }
6. 通过 IPC 传回主进程
7. credits-auth.ts 保存到 ~/.openclaw/aivoclaw.config.json（加密存储）：
   {
     "auth": {
       "token": "jwt-xxx",
       "userId": "mem_123",
       "wxNickname": "张三",
       "avatar": "https://...",
       "isVip": 1,
       "vipExpireTime": "2026-06-01",
       "points": 2350,
       "loginAt": "2026-03-14T10:00:00Z"
     }
   }
8. 通知 Chat UI 更新登录状态
9. 如果当前是算力模式，自动配置系统 Provider 并重启 Gateway
```

**Token 刷新/验证：**

- 启动时：调用 `GET /api/member/{memberId}` 验证 Token 有效性
- 401 响应：清除本地登录态，提示重新登录
- 互踢检测：同容剪逻辑（TOKEN_REPLACED → force-logout）

#### 5.2.3 模式切换（credits-mode.ts）

**配置存储：** `~/.openclaw/aivoclaw.config.json`

```json
{
  "creditsMode": {
    "active": "credits",       // "credits" | "own-key"
    "lastSwitchAt": "2026-03-14T10:00:00Z"
  }
}
```

**切换逻辑：**

```
切换到算力模式：
  1. 检查是否已登录 → 未登录则弹出登录窗口
  2. 检查积分余额 → 为零则提示充值
  3. 修改 openclaw.json 的 Provider 配置：
     - type: "custom"
     - baseURL: "https://server域名/api/ai"（指向 yyac-server 的代理端点）
     - apiKey: JWT Token（作为 Bearer 认证）
     - apiType: "openai-completions"（统一用 OpenAI 兼容协议）
  4. 重启 Gateway 生效

切换到自有 Key 模式：
  1. 恢复用户之前保存的 Provider 配置（从备份恢复）
  2. 或者弹出 Provider 设置页面让用户配置
  3. 重启 Gateway 生效
```

#### 5.2.4 AI 请求代理（credits-proxy.ts）

在算力模式下，Gateway 的 Provider 被配置为指向 yyac-server 的代理端点，因此：

- Gateway 发起的 AI 请求会自动打到 server
- server 端处理鉴权、Key 选取、转发、计费
- AivoClaw 端只需在 SSE 响应中解析 `credits_usage` 事件，更新本地积分显示

```typescript
// credits-proxy.ts 核心职责
export class CreditsProxy {
  // 监听 Gateway 的 SSE 响应，解析积分消耗
  onChatResponse(response: SSEEvent) {
    if (response.type === 'credits_usage') {
      this.updateLocalBalance(response.balance);
      this.notifyChatUI({
        cost: response.cost,
        balance: response.balance,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
      });
    }
  }

  // 处理余额不足（server 返回 402）
  onInsufficientCredits() {
    this.notifyChatUI({ type: 'insufficient_credits' });
    // Chat UI 显示"余额不足"提示 + 充值入口
  }

  // 定期同步余额（防止多端使用导致本地缓存过期）
  async syncBalance() {
    const res = await fetch(`${SERVER_URL}/api/credits/balance`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });
    const { points } = await res.json();
    this.updateLocalBalance(points);
  }
}
```

#### 5.2.5 Chat UI 修改

**侧边栏底部新增用户区域：**

```html
<!-- 未登录状态 -->
<div class="user-panel">
  <button @click="showLogin">登录 / 注册</button>
  <span class="hint">登录后可使用系统 AI 模型</span>
</div>

<!-- 已登录状态 -->
<div class="user-panel logged-in">
  <img class="avatar" src="${userInfo.avatar}" />
  <div class="user-info">
    <span class="nickname">${userInfo.wxNickname}</span>
    <span class="credits">积分: ${credits.balance}</span>
  </div>
  <button @click="showRecharge">充值</button>
</div>
```

**消息区域积分消耗展示：**

```
┌────────────────────────────────────────┐
│ [AI] 这是一段回复内容...                │
│                                        │
│ ─── 消耗 12.5 积分 | 余额 2,337.5 ─── │
└────────────────────────────────────────┘
```

**余额不足提示：**

```
┌────────────────────────────────────────┐
│ ⚠️ 积分余额不足                        │
│ 当前余额: 0.3 积分                      │
│                                        │
│ [立即充值]  [切换到自有 Key]             │
└────────────────────────────────────────┘
```

#### 5.2.6 充值入口

**方案：打开外部浏览器跳转充值页。**

AivoClaw 不内嵌支付 UI，而是：

1. 点击"充值" → 打开系统浏览器 → 跳转到 `https://server域名/recharge?token=xxx`
2. server 渲染一个 H5 充值页面（套餐选择 + 微信支付二维码）
3. 支付完成后，AivoClaw 定时轮询余额自动更新

或者更简单的方式：

1. 点击"充值" → AivoClaw 内新开 BrowserWindow 加载充值页
2. 复用容剪 PersonalView 的套餐选择 + 支付流程（微信扫码支付）
3. 支付回调后刷新积分余额

#### 5.2.7 设置页修改

在现有设置页的 Provider 区域上方，新增模式切换：

```
┌─────────────────────────────────────────────┐
│  AI 服务模式                                 │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ● 算力模式（推荐）                    │    │
│  │   使用系统内置模型，消耗账户积分        │    │
│  │                                     │    │
│  │   当前余额: 2,350 积分               │    │
│  │   当前模型: Claude Sonnet            │    │
│  │                                     │    │
│  │   [选择模型 ▼]  [充值]  [消费记录]    │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │ ○ 自有 Key 模式                      │    │
│  │   使用您自己的 API Key，不消耗积分     │    │
│  │                                     │    │
│  │   Provider: Anthropic               │    │
│  │   Model: claude-sonnet-4-2025...    │    │
│  │                                     │    │
│  │   [配置 Provider]                   │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

---

### 5.3 管理后台新增（yyac-admin）

#### 5.3.1 系统 Key 管理页

```
路由: /system-keys
功能:
  - Key 列表（供应商、别名、状态、今日用量/上限、累计用量、最后使用时间）
  - 新增 Key（选择供应商、输入 Key、设置别名、日限额、优先级）
  - 编辑 Key（修改别名、日限额、优先级、启用/禁用）
  - 删除 Key（软删除）
  - Key 健康状态监控（最后错误时间、错误信息）
  - 每日凌晨自动重置 dailyUsed（定时任务）
```

#### 5.3.2 积分定价配置页

```
路由: /credits-pricing
功能:
  - 模型定价列表（供应商、模型名、输入/输出价格、状态、排序）
  - 新增模型定价
  - 编辑定价（实时调整单价）
  - 上架/下架模型
  - 定价历史日志（谁在什么时间改了什么）
```

#### 5.3.3 算力使用报表页

```
路由: /credits-report
功能:
  - 总览卡片：今日消耗积分、今日 AI 请求数、活跃用户数、总积分池
  - 趋势图表：过去 7/30 天消耗趋势（按天）
  - 模型分布：各模型消耗占比（饼图）
  - 用户排行：积分消耗 Top 20
  - 明细查询：按时间/用户/模型筛选交易记录
  - 导出 CSV
```

#### 5.3.4 会员详情页扩展

在现有会员详情页中新增"算力使用"标签页：

```
会员详情 > 算力使用
  - 积分余额
  - 近期交易记录（充值、消耗、退款）
  - 使用统计（总对话次数、总 token 数、总消耗积分）
  - 手动调整积分（管理员操作，需备注原因）
```

---

## 6. 积分扣减流程

### 6.1 主流程

```
用户发送消息
    │
    ▼
AivoClaw 检查当前模式
    │
    ├── 自有 Key 模式 ──→ 直连 AI API（不扣费，流程结束）
    │
    │（算力模式）
    ▼
Gateway 将请求发往 server 代理端点
    │
    ▼
POST /api/ai/chat
Headers: Authorization: Bearer <JWT>
Body: { model: "claude-sonnet-4-20250514", messages: [...], stream: true }
    │
    ▼
┌─────────────────────────────────────┐
│ Server 处理流程                      │
│                                     │
│ 1. 验证 JWT Token → 获取 memberId   │
│    └─ 无效/过期 → 返回 401          │
│                                     │
│ 2. 查询 member.points               │
│    └─ points <= 0 → 返回 402        │
│       { code: "INSUFFICIENT_CREDITS",│
│         balance: 0,                  │
│         message: "余额不足，请充值"   │
│       }                              │
│                                     │
│ 3. 查找积分定价                      │
│    credits_pricing WHERE             │
│    modelId = req.model               │
│    └─ 未找到 → 返回 400 "不支持的模型"│
│                                     │
│ 4. 创建交易记录                      │
│    credits_transaction {             │
│      status: PENDING,                │
│      memberId,                       │
│      type: CHAT,                     │
│      balanceBefore: member.points    │
│    }                                 │
│                                     │
│ 5. 选取系统 Key                      │
│    SystemKeyService.selectKey(       │
│      provider, model                 │
│    )                                 │
│    └─ 无可用 Key → 返回 503          │
│       "系统繁忙，请稍后重试"          │
│                                     │
│ 6. 调用 AI API（SSE 流式）           │
│    用解密后的系统 Key                 │
│    流式转发给客户端                   │
│    同时累计 input/output token 数     │
│                                     │
│ 7. 请求完成，计算实际消耗             │
│    cost = (inputTokens/1000)         │
│           × pricing.inputPrice       │
│         + (outputTokens/1000)        │
│           × pricing.outputPrice      │
│                                     │
│ 8. 原子事务扣减积分                   │
│    BEGIN TRANSACTION                 │
│    member.points -= cost             │
│    transaction.status = COMPLETED    │
│    transaction.amount = -cost        │
│    transaction.balanceAfter = 新余额  │
│    COMMIT                            │
│                                     │
│ 9. 更新系统 Key 使用计数             │
│    systemKey.dailyUsed += 1          │
│    systemKey.totalUsed += 1          │
│    systemKey.lastUsedAt = now()      │
│                                     │
│ 10. 发送积分消耗 SSE 事件            │
│     data: { type: "credits_usage",   │
│       cost, balance, tokens }        │
│                                     │
└─────────────────────────────────────┘
    │
    ▼
AivoClaw 接收响应
    │
    ├── 正常响应 → 显示 AI 回复 + 底部积分消耗
    ├── 402 → 显示"余额不足"提示 + 充值入口
    ├── 401 → 清除登录态，弹出重新登录
    └── 503 → 显示"系统繁忙"提示
```

### 6.2 异常处理

| 异常场景 | 处理方式 |
|---------|---------|
| AI API 调用中途断开 | 按已消耗的 token 计费（不全额退还） |
| AI API 返回错误（非网络） | 不扣费，交易标记 FAILED |
| 用户中途取消（abort） | 按已消耗 token 计费 |
| 积分为负数（并发场景） | 数据库层 CHECK 约束 `points >= 0`，并发扣减用乐观锁 |
| 系统 Key 被封/额度耗尽 | 自动切换到下一个可用 Key，标记当前 Key 为异常 |
| Server 宕机 | AivoClaw 显示连接错误，提示用户切换到自有 Key 模式 |

### 6.3 并发安全

积分扣减使用**乐观锁**方式：

```sql
-- 扣减前查询
SELECT points, version FROM member WHERE id = ? FOR UPDATE;

-- 扣减（带版本号校验）
UPDATE member
SET points = points - ?,
    version = version + 1
WHERE id = ? AND version = ? AND points >= ?;

-- 如果影响行数 = 0，说明并发冲突或余额不足，重试或拒绝
```

---

## 7. 安全设计

### 7.1 安全矩阵

| 安全层面 | 威胁 | 防护措施 |
|---------|------|---------|
| 系统 Key 泄露 | Key 被客户端截获 | Server 代理模式，Key 永远不离开 server |
| Key 存储安全 | 数据库泄露导致 Key 暴露 | 数据库中 AES-256-GCM 加密存储，加密密钥与数据库分离 |
| 请求伪造 | 未授权调用 AI 代理 | JWT Token 验证 + 会员状态校验 |
| 刷量攻击 | 恶意大量请求消耗系统 Key 额度 | 每分钟请求频率限制 + 单日请求上限 |
| 积分操控 | 篡改积分余额 | 积分操作全部在 server 端完成，客户端只读 |
| 重放攻击 | 重复提交同一请求 | 请求去重（transactionNo 唯一约束） |
| Token 窃取 | 本地 Token 被窃取 | 加密存储 + JWT 有效期 7 天 + 互踢机制 |
| 中间人攻击 | 网络嗅探 | 生产环境全 HTTPS |

### 7.2 系统 Key 安全生命周期

```
管理员添加 Key
    │
    ▼
明文 Key → AES-256-GCM 加密 → 存入数据库 encryptedKey 字段
加密密钥来源：环境变量 SYSTEM_KEY_ENCRYPTION_SECRET（不在代码/数据库中）
    │
    ▼
收到 AI 请求 → 从数据库读取 encryptedKey → 内存中解密 → 调用 AI API
    │
    ▼
调用完成 → 解密后的 Key 从内存释放（不缓存明文）
```

### 7.3 频率限制策略

| 限制维度 | 限制值 | 说明 |
|---------|--------|------|
| 每用户每分钟请求数 | 10 次 | 防止单用户刷量 |
| 每用户每日请求数 | 500 次 | 日上限 |
| 全局每分钟请求数 | 100 次 | 保护系统 Key 配额 |
| 单次最大 token | 32,000 | 防止单次超长对话 |

使用 Redis 实现滑动窗口限流。

---

## 8. 数据模型设计

### 8.0 积分取整策略

**积分全程使用整数（INTEGER）**，`member.points` 不做类型变更。

定价表（`credits_pricing`）用 DECIMAL 存储单价（允许灵活配置如 0.5 积分/千token），实际扣减时**向上取整**：

```
原始消耗 = (inputTokens/1000) × inputPrice + (outputTokens/1000) × outputPrice + ...
实际扣减 = Math.ceil(原始消耗)   // 向上取整，最少扣 1 积分
```

**示例**：Claude Sonnet（输入 3 积分/千token，输出 15 积分/千token），输入 520 token、输出 180 token：
- 原始 = 1.56 + 2.7 = 4.26 → 实际扣减 = **5 积分**

### 8.1 数据库 ER 关系

```
┌──────────────────┐     ┌────────────────────────┐
│     member       │     │  credits_transaction   │
│──────────────────│     │────────────────────────│
│ id (PK)          │◄────│ memberId (FK)          │
│ points INTEGER   │     │ transactionNo (UQ)     │
│ isVip            │     │ type                   │
│ vipExpireTime    │     │ status                 │
│ wxNickname       │     │ amount INTEGER         │
│ openId           │     │ balanceBefore/After INT│
│ ...              │     │ provider               │
└──────────────────┘     │ modelId                │
                         │ inputTokens            │
                         │ outputTokens           │
┌──────────────────┐     │ systemKeyId (FK) ──────│──┐
│   system_key     │     │ sessionId              │  │
│──────────────────│     └────────────────────────┘  │
│ id (PK)       ◄──│─────────────────────────────────┘
│ provider         │
│ keyAlias         │     ┌────────────────────────┐
│ encryptedKey     │     │   credits_pricing      │
│ baseURL          │     │────────────────────────│
│ modelWhitelist   │     │ id (PK)                │
│ status           │     │ provider               │
│ priority         │     │ modelId                │
│ dailyLimit       │     │ modelName              │
│ dailyUsed        │     │ inputPrice DECIMAL     │
│ totalUsed        │     │ outputPrice DECIMAL    │
│ ...              │     │ status                 │
└──────────────────┘     │ sortOrder              │
                         └────────────────────────┘
```

### 8.2 与现有模型的关系

- `member` 表：**不修改**，复用已有 `points` 字段（保持 INTEGER）
- `pointsChangeRecord` 表：**仅新增枚举值** `AI_CHAT`，金额字段保持 INTEGER
- `order` 表：**复用现有**，积分套餐购买走现有订单流程
- `package` 表：**复用现有**，添加算力套餐数据
- `system_key` 表：**新增**
- `credits_pricing` 表：**新增**（单价用 DECIMAL，实际扣减取整）
- `credits_transaction` 表：**新增**（amount/balance 均为 INTEGER，与 member.points 一致）

---

## 9. API 接口清单

### 9.1 客户端 API（需 JWT 认证）

| 方法 | 路由 | 功能 | 请求体 | 响应 |
|------|------|------|--------|------|
| POST | `/api/ai/chat` | AI 对话代理（SSE 流式） | `{ model, messages, stream }` | SSE 流 + credits_usage 事件 |
| GET | `/api/ai/models` | 获取系统可用模型列表 | - | `{ models: [{ id, name, provider, inputPrice, outputPrice }] }` |
| GET | `/api/credits/balance` | 查询积分余额 | - | `{ points, memberId }` |
| GET | `/api/credits/records` | 积分变动记录 | `?page&pageSize&type` | `{ records: [...], total }` |
| POST | `/api/credits/estimate` | 预估本次对话消耗 | `{ model, messageLength }` | `{ estimatedCost, currentBalance }` |

### 9.2 管理端 API（需管理员认证）

| 方法 | 路由 | 功能 |
|------|------|------|
| POST | `/system-key/list` | 系统 Key 列表 |
| POST | `/system-key/add` | 添加系统 Key |
| POST | `/system-key/update` | 更新系统 Key |
| POST | `/system-key/delete` | 删除系统 Key |
| POST | `/system-key/test` | 测试 Key 有效性 |
| POST | `/credits-pricing/list` | 积分定价列表 |
| POST | `/credits-pricing/add` | 添加模型定价 |
| POST | `/credits-pricing/update` | 更新模型定价 |
| POST | `/credits-pricing/delete` | 删除模型定价 |
| POST | `/credits-report/overview` | 算力使用总览 |
| POST | `/credits-report/trend` | 消耗趋势数据 |
| POST | `/credits-report/model-distribution` | 模型消耗分布 |
| POST | `/credits-report/user-ranking` | 用户消耗排行 |
| POST | `/credits-report/export` | 导出报表 |

---

## 10. 开发任务分解

### Phase 1: Server 端基础（预计 5-7 天）

| # | 任务 | 涉及文件 | 优先级 |
|---|------|---------|--------|
| 1.1 | 创建 `system_key` 数据模型 + 迁移 | models/systemKey.model.ts | P0 |
| 1.2 | 创建 `credits_pricing` 数据模型 + 迁移 | models/creditsPricing.model.ts | P0 |
| 1.3 | 创建 `credits_transaction` 数据模型 + 迁移 | models/creditsTransaction.model.ts | P0 |
| 1.4 | 系统 Key CRUD 服务 + 控制器 + 路由 | services/ + controllers/ + routes/ | P0 |
| 1.5 | Key 加密/解密工具函数 | utils/encryption.ts | P0 |
| 1.6 | Key 智能选取策略（优先级 + 轮询 + 降级） | services/systemKeyService.ts | P0 |
| 1.7 | 积分定价 CRUD 服务 + 控制器 + 路由 | services/ + controllers/ + routes/ | P0 |
| 1.8 | 积分扣减/查询/记录服务 | services/creditsService.ts | P0 |
| 1.9 | 每日重置 Key 用量定时任务 | schedule/ | P1 |

### Phase 2: Server 端 AI 代理（预计 5-7 天）

| # | 任务 | 涉及文件 | 优先级 |
|---|------|---------|--------|
| 2.1 | AI 代理控制器（SSE 流式转发） | controllers/aiProxyController.ts | P0 |
| 2.2 | AI 代理服务（多 Provider 适配） | services/aiProxyService.ts | P0 |
| 2.3 | Anthropic API 适配器 | services/adapters/anthropicAdapter.ts | P0 |
| 2.4 | OpenAI API 适配器 | services/adapters/openaiAdapter.ts | P0 |
| 2.5 | Token 计数 + 积分计算逻辑 | services/aiProxyService.ts | P0 |
| 2.6 | 频率限制中间件（Redis 滑动窗口） | middlewares/rateLimit.ts | P1 |
| 2.7 | 异常处理（中途断开、Key 失败降级） | services/aiProxyService.ts | P1 |
| 2.8 | 请求/响应日志记录 | middlewares/aiProxyLogger.ts | P2 |

### Phase 3: AivoClaw 客户端（预计 7-10 天）

| # | 任务 | 涉及文件 | 优先级 |
|---|------|---------|--------|
| 3.1 | 微信扫码登录模块 | src/credits-auth.ts | P0 |
| 3.2 | 登录窗口 BrowserWindow | src/credits-auth.ts | P0 |
| 3.3 | JWT Token 管理（存储/刷新/验证） | src/credits-auth.ts | P0 |
| 3.4 | 模式切换模块 | src/credits-mode.ts | P0 |
| 3.5 | Provider 配置切换（算力 ↔ 自有Key） | src/credits-mode.ts + provider-config.ts | P0 |
| 3.6 | 积分代理模块（余额同步、消耗展示） | src/credits-proxy.ts | P0 |
| 3.7 | IPC handler 注册 | src/credits-ipc.ts + preload.ts | P0 |
| 3.8 | Chat UI 侧边栏用户区域 | chat-ui/ui/src/ui/sidebar.ts | P0 |
| 3.9 | Chat UI 积分消耗展示 | chat-ui/ui/src/ui/chat/ | P1 |
| 3.10 | Chat UI 余额不足提示 + 充值引导 | chat-ui/ui/src/ui/chat/ | P1 |
| 3.11 | 设置页模式切换 UI | settings/settings.js | P1 |
| 3.12 | 充值页面（BrowserWindow 或外链） | src/credits-auth.ts | P1 |

### Phase 4: 管理后台（预计 3-5 天）

| # | 任务 | 涉及文件 | 优先级 |
|---|------|---------|--------|
| 4.1 | 系统 Key 管理页面 | views/systemKey/ | P1 |
| 4.2 | 积分定价配置页面 | views/creditsPricing/ | P1 |
| 4.3 | 算力使用报表页面（总览 + 趋势 + 分布） | views/creditsReport/ | P2 |
| 4.4 | 会员详情页"算力使用"标签扩展 | views/member/detail/ | P2 |

### Phase 5: 测试与优化（预计 3-5 天）

| # | 任务 | 优先级 |
|---|------|--------|
| 5.1 | 端到端测试：注册 → 充值 → 对话 → 扣费 全流程 | P0 |
| 5.2 | 并发测试：多用户同时对话的积分扣减正确性 | P0 |
| 5.3 | 安全测试：Key 不暴露、Token 校验、频率限制 | P0 |
| 5.4 | 性能测试：SSE 代理延迟、大量并发下的响应时间 | P1 |
| 5.5 | 异常测试：Key 失败降级、网络中断、余额不足 | P1 |

**总预估工期：23-34 天**

---

## 11. 风险与注意事项

### 11.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| SSE 流式代理延迟 | 用户感知响应变慢 | 优化 server 转发逻辑，减少缓冲；支持 WebSocket 作为备选 |
| 系统 Key 额度耗尽 | 服务不可用 | 多 Key 轮换 + 管理后台监控告警 + 自动降级提示 |
| 高并发积分扣减 | 超扣/负数 | 乐观锁 + 数据库 CHECK 约束 + 事务保证 |
| Gateway 适配 | OpenClaw 版本升级可能改变 API 协议 | 使用标准 OpenAI 兼容协议，降低耦合 |

### 11.2 业务注意事项

| 注意事项 | 说明 |
|---------|------|
| 积分精度 | 积分全程使用整数（INTEGER），扣减时向上取整（Math.ceil），最少扣 1 积分 |
| 退款策略 | AI 对话积分一般不退（已消耗资源），充值退款走人工审核 |
| 免费额度 | 可配置新用户赠送 X 积分体验（通过管理后台手动或注册时自动） |
| 套餐有效期 | 积分套餐无有效期限制（充值即永久有效，直到用完） |
| 容剪 VIP 权益 | VIP 用户可享每日 N 次免费对话额度（可选，需讨论） |
| 多端同步 | 积分余额以 server 为准，客户端只缓存，定期同步 |
