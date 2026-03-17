# AivoClaw 会员算力聊天功能规划

版本: v1.0 | 日期: 2026-03-14 | 状态: 规划中

---

# 一、项目背景

## 涉及项目

- **容剪 client** — 智能视频自动剪辑桌面应用（Electron + Vue 3 + Go）
- **AivoClaw** — AI 对话桌面客户端（Electron + Lit 3 + OpenClaw Gateway）
- **yyac-server** — 统一后台服务（Koa + MySQL + Redis）
- **yyac-admin** — 管理后台前端（Vue 3 + Element Plus）

## 需求目标

1. AivoClaw 内置系统 API Key，用户无需自行申请即可 AI 对话
2. 系统 Key 安全不泄露，通过 Server 代理请求
3. 对话消耗账户积分，支持充值购买积分套餐
4. 用户可在设置页切换为自有 Key，不走积分扣分
5. 与容剪共用同一套会员体系（微信扫码登录、统一积分池）

---

# 二、现状分析

## 容剪 client 现有能力

- 微信扫码 OAuth 登录（全链路已打通）
- VIP 会员体系（订阅制，按天计费）
- 积分字段（member.points）+ 变动记录
- 微信支付（创建订单 → 扫码 → 回调 → 权益发放）
- 套餐类型：MEMBER（会员）/ POINTS（积分）/ COMBO（组合）
- 每日使用次数限制（featureLimit）

## AivoClaw 现有能力

- 完整 AI 对话功能（多 Provider：Anthropic/OpenAI/Google/Moonshot/自定义）
- API Key 本地存储管理
- 用量统计（token 数、费用、模型分布）
- 无用户系统、无积分计费

## yyac-server 现有能力

- 完整 member 数据模型（含 points 积分字段）
- 微信 OAuth 回调接口
- JWT RS256 认证
- 积分变动记录（pointsChangeRecord）
- 微信 Native 支付完整流程
- 套餐管理 CRUD
- 激活码兑换

---

# 三、核心设计决策

## 决策 1：统一会员体系

共用一套 yyac-server 会员系统，不新建独立用户体系。

**理由：**
- server 已有完整的会员 + 积分 + 支付 + 套餐全套基础设施
- 用户一个微信号 = 一个 member，同时拥有容剪 VIP 天数 + AivoClaw 算力积分
- 避免重复建设，降低维护成本

**一个微信账号 = 一个 member → VIP 天数（容剪）+ 算力积分（AivoClaw）**

## 决策 2：双模式运行

| 模式 | 使用的 Key | 计费方式 | 适用场景 |
|------|-----------|---------|---------|
| 算力模式（默认） | 系统内置 Key | 消耗账户积分 | 普通用户 |
| 自有 Key 模式 | 用户自行配置 | 不消耗积分 | 高级用户 |

## 决策 3：Server 完全代理

AI 请求发到 server，server 用系统 Key 转发 AI API。Key 永远不离开 server。

为什么不直接下发 Key 给客户端：
- 临时 Key 也有暴露窗口
- 客户端上报用量不可信
- Server 代理可精确控制计费

## 决策 4：独立登录，共享账户

容剪和 AivoClaw 各自微信扫码登录，各自持有 JWT Token，但指向同一个 member 记录。积分余额实时从 server 查询，天然同步。

---

# 四、整体架构

## 架构图

```
AivoClaw 桌面端
├── Chat UI (Lit 3) — AI 对话界面
├── 登录/充值 — 微信扫码弹窗
├── 设置页 — 算力模式 / 自有 Key 切换
│
├── Electron 主进程
│   ├── credits-auth.ts — 登录 + JWT 管理
│   ├── credits-proxy.ts — AI 请求代理拦截
│   └── credits-mode.ts — 模式切换管理
│
├── OpenClaw Gateway（自有 Key 模式 → 直连 AI API）
└── 积分代理（算力模式 → 请求发往 server）
         │
         ▼
    yyac-server（统一后台）
    ├── AI 代理模块 — 系统 Key → 调用 AI API → 流式返回
    ├── 积分扣减模块 — 按 token 用量计算积分
    ├── 会员/支付/套餐 — 现有系统复用
    └── 系统 Key 管理 — 加密存储 + 智能选取
```

## 算力模式请求流程

1. 用户发送消息
2. Chat UI → Gateway → 请求发往 server 代理端点
3. `POST /api/ai/chat`（携带 JWT Token）
4. server 验证 Token → 检查积分余额
5. 选取系统 Key → 解密 → 调用 AI API
6. SSE 流式转发给客户端，累计 token 数
7. 完成后按实际 token × 模型单价计算积分消耗
8. 原子事务扣减积分 + 记录交易
9. 返回积分消耗信息给客户端

## 自有 Key 模式请求流程

1. 用户发送消息
2. Chat UI → Gateway → 直连 AI API（用户自己的 Key）
3. 不经过 server，不消耗积分

---

# 五、功能模块设计

## 5.1 Server 端新增

### 系统 Key 管理

数据模型 `system_key`：

| 字段 | 说明 |
|------|------|
| provider | 供应商（anthropic / openai / google） |
| keyAlias | Key 别名 |
| encryptedKey | AES-256-GCM 加密后的 Key |
| baseURL | API 端点地址 |
| modelWhitelist | 允许使用的模型列表 |
| status | 0=禁用 1=启用 2=额度耗尽 |
| priority | 优先级（越小越优先） |
| dailyLimit | 每日请求上限 |
| dailyUsed / totalUsed | 今日/累计用量 |

Key 选取策略：
1. 按 provider 筛选启用的 Key
2. 排除达到日限额的 Key
3. 按优先级排序
4. 同优先级内加权轮询
5. 调用失败自动降级

### 积分定价配置

数据模型 `credits_pricing`：

| 字段 | 说明 |
|------|------|
| provider | 供应商 |
| modelId | 模型标识 |
| modelName | 模型显示名 |
| inputPrice | 输入价格（积分/千token） |
| outputPrice | 输出价格（积分/千token） |
| status | 上架/下架 |

默认定价参考：

| 模型 | 输入 | 输出 |
|------|------|------|
| Claude Sonnet | 3 积分/千token | 15 积分/千token |
| Claude Haiku | 1 | 5 |
| GPT-4o | 5 | 15 |
| GPT-4o-mini | 0.5 | 2 |
| DeepSeek-V3 | 0.5 | 2 |

管理后台可动态调整。

### 算力交易记录

数据模型 `credits_transaction`：

| 字段 | 说明 |
|------|------|
| transactionNo | 交易流水号 |
| memberId | 会员 ID |
| type | CHAT / RECHARGE / REFUND / REWARD / SYSTEM |
| status | PENDING / COMPLETED / FAILED |
| amount | 积分变动量 |
| balanceBefore / balanceAfter | 变动前后余额 |
| provider / modelId | AI 供应商和模型 |
| inputTokens / outputTokens | token 用量 |
| sessionId | 对话会话 ID |

### AI 代理模块

核心端点：`POST /api/ai/chat`

处理流程：
1. 验证 JWT → 获取 memberId
2. 查询积分余额 → 不足返回 402
3. 查找模型定价 → 不支持返回 400
4. 创建交易记录（PENDING）
5. 选取系统 Key → 解密
6. 调用 AI API（SSE 流式转发）
7. 累计 token 数
8. 完成后计算实际消耗 = token × 单价
9. 原子事务扣减积分
10. 发送积分消耗 SSE 事件

### 套餐扩展

在现有套餐体系中添加算力套餐：

| 套餐 | 类型 | 积分 | 参考价 |
|------|------|------|-------|
| 算力体验包 | POINTS | 1,000 | ¥9.9 |
| 算力基础包 | POINTS | 5,000 | ¥39.9 |
| 算力专业包 | POINTS | 20,000 | ¥129.9 |
| 全能组合包 | COMBO | VIP 30天 + 10,000 积分 | ¥199 |

---

## 5.2 AivoClaw 客户端新增

### 新增模块

| 文件 | 功能 |
|------|------|
| credits-auth.ts | 微信扫码登录 + JWT Token 管理 |
| credits-proxy.ts | 算力代理拦截层 |
| credits-mode.ts | 模式切换管理 |
| credits-ipc.ts | 积分相关 IPC 注册 |

### 微信扫码登录

登录流程：
1. 用户点击侧边栏"登录"按钮
2. 打开新窗口 → 加载微信 OAuth URL
3. 用户扫码确认
4. 微信回调 → yyac-server → 返回 JWT Token + 用户信息
5. 窗口 postMessage 回传主进程
6. 保存到 `~/.openclaw/aivoclaw.config.json`（加密）
7. 如果是算力模式，配置系统 Provider 并重启 Gateway

### 模式切换

设置页新增模式切换区域：

**算力模式（推荐）：**
- 使用系统内置模型
- 显示当前余额
- 提供模型选择、充值入口、消费记录

**自有 Key 模式：**
- 使用用户自己的 API Key
- 不消耗积分
- 显示当前 Provider 配置

切换逻辑：
- 切到算力模式 → 检查登录 → 检查余额 → 配置系统 Provider → 重启 Gateway
- 切到自有 Key → 恢复用户 Provider 配置 → 重启 Gateway

### Chat UI 修改

侧边栏底部新增用户区域：
- 未登录：显示"登录/注册"按钮
- 已登录：显示头像、昵称、积分余额、充值按钮

消息区域新增：
- 每条 AI 回复后显示积分消耗和余额
- 余额不足时显示提示 + 充值/切换模式入口

### 充值方式

打开新窗口加载充值页面（复用容剪的套餐选择 + 微信支付流程），支付完成后自动刷新积分余额。

---

## 5.3 管理后台新增

### 系统 Key 管理页

- Key 列表：供应商、别名、状态、用量、最后使用时间
- 新增/编辑/删除 Key
- Key 有效性测试
- 健康状态监控

### 积分定价配置页

- 模型定价列表
- 新增/编辑定价
- 上架/下架模型
- 定价历史日志

### 算力使用报表页

- 总览：今日消耗、请求数、活跃用户、积分池
- 趋势图表：7/30 天消耗趋势
- 模型分布：各模型消耗占比
- 用户排行：消耗 Top 20
- 明细查询 + CSV 导出

### 会员详情扩展

新增"算力使用"标签页：积分余额、交易记录、使用统计、手动调整积分

---

# 六、积分扣减流程

## 主流程

```
用户发消息 → 检查模式
  │
  ├── 自有 Key → 直连 AI API，不扣费
  │
  └── 算力模式 → 发送到 server
       │
       ├── 1. 验证 JWT Token
       ├── 2. 查询积分余额（不足 → 402）
       ├── 3. 创建交易记录（PENDING）
       ├── 4. 选取系统 Key
       ├── 5. 调用 AI API（SSE 流式转发）
       ├── 6. 累计 token 用量
       ├── 7. 计算消耗 = token × 单价
       ├── 8. 原子事务扣减积分
       ├── 9. 更新交易记录（COMPLETED）
       └── 10. 返回消耗信息
```

## 积分计算公式

积分全程使用**整数**，扣减时向上取整：

```
原始消耗 = (输入 token 数 / 1000) × 输入单价
         + (输出 token 数 / 1000) × 输出单价
         + (缓存读取 token / 1000) × 缓存读取单价
         + (缓存写入 token / 1000) × 缓存写入单价

实际扣减 = Math.ceil(原始消耗)   // 向上取整，最少扣 1 积分
```

示例：Claude Sonnet，输入 520 token，输出 180 token：
- 原始 = (520/1000)×3 + (180/1000)×15 = 1.56 + 2.7 = 4.26
- 实际扣减 = ceil(4.26) = **5 积分**

## 异常处理

| 场景 | 处理 |
|------|------|
| AI 调用中途断开 | 按已消耗 token 计费 |
| AI 返回错误 | 不扣费，交易标记 FAILED |
| 用户取消 | 按已消耗 token 计费 |
| 并发扣减冲突 | 乐观锁 + 数据库约束 points >= 0 |
| 系统 Key 失败 | 自动切换下一个 Key |
| Server 不可用 | 提示切换自有 Key 模式 |

## 并发安全

积分扣减使用乐观锁：

```sql
UPDATE member
SET points = points - ?, version = version + 1
WHERE id = ? AND version = ? AND points >= ?;
```

影响行数 = 0 则重试或拒绝。

---

# 七、安全设计

## 安全矩阵

| 威胁场景                | 防护措施                                                        |
|------------------------|----------------------------------------------------------------|
| 系统 Key 泄露           | Server 代理模式，API Key 永远不离开 server，客户端无法获取        |
| 数据库 Key 明文暴露      | AES-256-GCM 加密存储，加密密钥存放在环境变量中，不入库             |
| 未授权用户发起请求       | JWT Token 验证 + 会员状态校验 + 积分余额检查                     |
| 恶意刷量攻击            | Redis 滑动窗口限流（按用户 / 按全局两级限制）                     |
| 客户端篡改积分           | 积分所有写操作全在 server 端完成，客户端只有只读权限               |
| 重放攻击               | transactionNo 交易流水号全局唯一约束，防止重复扣款                 |
| Token 被窃取           | 本地加密存储 + 7 天自动过期 + 多端互踢（同一账号仅一端在线）       |
| 中间人攻击              | 全链路 HTTPS 加密传输                                           |

## 频率限制

| 限制维度                | 限制值                              |
|------------------------|-------------------------------------|
| 单用户每分钟请求数       | 10 次                               |
| 单用户每日请求数         | 500 次                              |
| 全局每分钟请求数         | 100 次                              |
| 单次请求最大 token 数    | 32,000 token                        |

---

# 八、数据模型关系

## 复用的现有模型

- **member** — 复用 points 字段
- **pointsChangeRecord** — 新增 AI_CHAT 类型
- **order** — 积分套餐走现有订单流程
- **package** — 添加算力套餐数据

## 新增模型

- **system_key** — 系统 API Key 加密存储
- **credits_pricing** — 各模型积分定价
- **credits_transaction** — AI 对话 token 级消费明细

关系：
- member (1) → (N) credits_transaction
- system_key (1) → (N) credits_transaction
- credits_pricing 独立配置表

---

# 九、API 接口清单

## 客户端 API（需 JWT）

| 方法 | 路由 | 功能 |
|------|------|------|
| POST | /api/ai/chat | AI 对话代理（SSE 流式） |
| GET | /api/ai/models | 系统可用模型列表 |
| GET | /api/credits/balance | 查询积分余额 |
| GET | /api/credits/records | 积分变动记录 |
| POST | /api/credits/estimate | 预估对话消耗 |

## 管理端 API（需管理员认证）

| 路由前缀 | 功能 |
|---------|------|
| /system-key/* | 系统 Key CRUD + 测试 |
| /credits-pricing/* | 积分定价 CRUD |
| /credits-report/* | 算力报表（总览/趋势/分布/排行/导出） |

---

# 十、开发任务与排期

## Phase 1: Server 基础

- 创建 system_key / credits_pricing / credits_transaction 数据模型
- 系统 Key CRUD + 加密/解密 + 智能选取策略
- 积分定价 CRUD
- 积分扣减/查询/记录服务
- 每日重置 Key 用量定时任务

## Phase 2: Server AI 代理

- AI 代理控制器（SSE 流式转发）
- Anthropic / OpenAI API 适配器
- Token 计数 + 积分计算
- 频率限制中间件（Redis）
- 异常处理（Key 降级、中途断开）

## Phase 3: AivoClaw 客户端

- 微信扫码登录 + 登录窗口
- JWT Token 管理（存储/刷新/验证/互踢）
- 模式切换（算力 ↔ 自有 Key）+ Provider 配置切换
- 积分代理（余额同步、消耗展示、不足提示）
- Chat UI 用户区域 + 积分展示
- 设置页模式切换 UI
- 充值入口

## Phase 4: 管理后台

- 系统 Key 管理页
- 积分定价配置页
- 算力使用报表页
- 会员详情算力扩展

## Phase 5: 测试优化

- 端到端全流程测试
- 并发积分扣减正确性
- 安全测试（Key、Token、限流）
- 性能测试（SSE 延迟、并发）

---

# 十一、风险与注意事项

## 技术风险

| 风险 | 缓解 |
|------|------|
| SSE 代理延迟 | 优化转发逻辑，支持 WebSocket 备选 |
| 系统 Key 额度耗尽 | 多 Key 轮换 + 监控告警 |
| 高并发超扣 | 乐观锁 + DB 约束 |
| Gateway 协议变更 | 使用 OpenAI 兼容协议降低耦合 |

## 业务注意

- 积分精度：全程使用整数（INTEGER），扣减时 Math.ceil 向上取整，最少扣 1 积分
- 退款策略：AI 对话积分不退，充值退款走人工审核
- 免费额度：可配置新用户赠送体验积分
- 套餐有效期：积分无有效期，充值永久有效
- VIP 联动：容剪 VIP 用户可享每日免费对话额度（可选功能）
- 多端同步：积分以 server 为准，客户端定期同步
