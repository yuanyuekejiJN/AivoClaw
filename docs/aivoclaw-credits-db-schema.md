# AivoClaw 算力聊天 — 数据库表结构变更清单

> 日期: 2026-03-14 | 关联文档: aivoclaw-credits-plan.md

---

## 变更总览

| 类型 | 表名 | 说明 |
|------|------|------|
| **修改** | `points_change_record` | changeType 枚举新增 `AI_CHAT` 值 |
| **修改** | `order_record` | orderType 枚举新增 `AI_RECHARGE` 值（可选） |
| **新增** | `system_key` | 系统 API Key 加密存储表 |
| **新增** | `credits_pricing` | AI 模型积分定价配置表 |
| **新增** | `credits_transaction` | AI 对话算力交易明细表 |

> **`member` 表不做修改**。`points` 字段保持 `INTEGER` 类型，积分全程使用整数，扣减时向上取整（`Math.ceil`）。

---

## 积分取整策略

定价表（`credits_pricing`）用 DECIMAL 存储单价，允许灵活配置。实际扣减时按以下公式计算后**向上取整**：

```
原始消耗 = (inputTokens / 1000) × inputPrice
         + (outputTokens / 1000) × outputPrice
         + (cacheReadTokens / 1000) × cacheReadPrice
         + (cacheWriteTokens / 1000) × cacheWritePrice

实际扣减积分 = Math.ceil(原始消耗)   // 向上取整，最少扣 1 积分
```

**示例**：用 Claude Sonnet（输入 3 积分/千token，输出 15 积分/千token），本次对话输入 520 token、输出 180 token：
- 原始消耗 = (520/1000) × 3 + (180/1000) × 15 = 1.56 + 2.7 = 4.26
- 实际扣减 = ceil(4.26) = **5 积分**

---

## 一、修改现有表

### 1.1 points_change_record 表（积分变动记录）

#### 变更内容

| 字段 | 当前定义 | 变更后 | 原因 |
|------|---------|--------|------|
| changeType | `ENUM('RECHARGE','PURCHASE','REWARD','REFUND','SYSTEM')` | `ENUM('RECHARGE','PURCHASE','REWARD','REFUND','SYSTEM','AI_CHAT')` | 新增 AI 对话消耗类型 |

> 金额字段 `changeAmount`、`balanceBefore`、`balanceAfter` 保持 `INTEGER` 不变。

#### SQL 迁移

```sql
ALTER TABLE `points_change_record`
  MODIFY COLUMN `change_type` ENUM('RECHARGE','PURCHASE','REWARD','REFUND','SYSTEM','AI_CHAT')
  NOT NULL COMMENT '变动类型：RECHARGE=充值, PURCHASE=消费, REWARD=奖励, REFUND=退款, SYSTEM=系统, AI_CHAT=AI对话消耗';
```

#### Sequelize 模型变更

```typescript
// pointsChangeRecord.model.ts — 仅修改 changeType 枚举
changeType: {
  type: DataTypes.ENUM('RECHARGE', 'PURCHASE', 'REWARD', 'REFUND', 'SYSTEM', 'AI_CHAT'),
  allowNull: false,
  field: 'change_type',
},
```

---

### 1.2 order_record 表（订单）— 可选

#### 变更内容

| 字段 | 当前定义 | 变更后 | 原因 |
|------|---------|--------|------|
| orderType | `ENUM('MEMBER','RENEWAL','RECHARGE')` | `ENUM('MEMBER','RENEWAL','RECHARGE','AI_RECHARGE')` | 区分普通充值和 AI 算力充值 |

#### SQL 迁移

```sql
ALTER TABLE `order_record`
  MODIFY COLUMN `order_type` ENUM('MEMBER','RENEWAL','RECHARGE','AI_RECHARGE')
  NOT NULL COMMENT '订单类型：MEMBER=开通会员, RENEWAL=续费, RECHARGE=充值, AI_RECHARGE=AI算力充值';
```

#### Sequelize 模型变更

```typescript
// order.model.ts
orderType: {
  type: DataTypes.ENUM('MEMBER', 'RENEWAL', 'RECHARGE', 'AI_RECHARGE'),
  allowNull: false,
  field: 'order_type',
},
```

> **备注**：`AI_RECHARGE` 类型为可选。如果不需要在订单层面区分普通积分充值和 AI 算力充值，可以统一使用 `RECHARGE`，通过 `package.packageType` 来区分套餐类别。

---

## 二、新增表

### 2.1 system_key 表（系统 API Key）

存储供 AI 对话代理使用的系统级 API Key，加密存储，用户不可见。

#### 完整字段定义

| 字段名 | 数据库列名 | 类型 | 约束 | 默认值 | 说明 |
|--------|-----------|------|------|--------|------|
| id | id | BIGINT | PK, 自增 | - | 主键 |
| provider | provider | VARCHAR(50) | 非空 | - | AI 供应商标识：anthropic / openai / google / deepseek / moonshot / custom |
| keyAlias | key_alias | VARCHAR(100) | 非空 | - | Key 别名（管理辨识用，如"Claude 主力 Key-1"） |
| encryptedKey | encrypted_key | TEXT | 非空 | - | AES-256-GCM 加密后的 API Key |
| encryptionIv | encryption_iv | VARCHAR(64) | 非空 | - | 加密初始化向量（每个 Key 独立 IV） |
| baseURL | base_url | VARCHAR(500) | 非空 | - | API 端点地址（如 https://api.anthropic.com/v1） |
| apiType | api_type | VARCHAR(50) | 非空 | 'openai-completions' | API 协议类型：openai-completions / anthropic-messages |
| modelWhitelist | model_whitelist | JSON | 可空 | NULL | 该 Key 允许使用的模型列表，NULL 表示不限制 |
| status | status | TINYINT | 非空 | 1 | 0=禁用 1=启用 2=额度耗尽 3=Key失效 |
| priority | priority | INT | 非空 | 100 | 优先级（越小越优先） |
| weight | weight | INT | 非空 | 1 | 同优先级内的轮询权重 |
| dailyLimit | daily_limit | INT | 非空 | 0 | 每日请求次数上限（0=不限） |
| dailyUsed | daily_used | INT | 非空 | 0 | 今日已用次数（每日凌晨重置） |
| totalUsed | total_used | INT | 非空 | 0 | 累计使用次数 |
| totalTokens | total_tokens | BIGINT | 非空 | 0 | 累计消耗 token 数 |
| lastUsedAt | last_used_at | DATETIME | 可空 | NULL | 最后使用时间 |
| lastErrorAt | last_error_at | DATETIME | 可空 | NULL | 最后错误时间 |
| lastError | last_error | TEXT | 可空 | NULL | 最后错误信息 |
| consecutiveErrors | consecutive_errors | INT | 非空 | 0 | 连续错误次数（成功后重置） |
| remark | remark | VARCHAR(500) | 可空 | NULL | 备注 |
| createdAt | created_at | DATETIME | 非空 | NOW | 创建时间 |
| updatedAt | updated_at | DATETIME | 非空 | NOW | 更新时间 |
| deletedAt | deleted_at | DATETIME | 可空 | NULL | 软删除时间 |

#### 索引

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_provider_status | (provider, status) | 普通索引 | Key 选取查询加速 |
| idx_priority | (priority, weight) | 普通索引 | 排序加速 |

#### 建表 SQL

```sql
CREATE TABLE `system_key` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `provider` VARCHAR(50) NOT NULL COMMENT 'AI供应商: anthropic/openai/google/deepseek/moonshot/custom',
  `key_alias` VARCHAR(100) NOT NULL COMMENT 'Key别名',
  `encrypted_key` TEXT NOT NULL COMMENT 'AES-256-GCM加密后的API Key',
  `encryption_iv` VARCHAR(64) NOT NULL COMMENT '加密初始化向量',
  `base_url` VARCHAR(500) NOT NULL COMMENT 'API端点地址',
  `api_type` VARCHAR(50) NOT NULL DEFAULT 'openai-completions' COMMENT 'API协议: openai-completions/anthropic-messages',
  `model_whitelist` JSON DEFAULT NULL COMMENT '允许的模型列表(JSON数组), NULL=不限',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '0=禁用 1=启用 2=额度耗尽 3=Key失效',
  `priority` INT NOT NULL DEFAULT 100 COMMENT '优先级(越小越优先)',
  `weight` INT NOT NULL DEFAULT 1 COMMENT '同优先级轮询权重',
  `daily_limit` INT NOT NULL DEFAULT 0 COMMENT '每日请求上限(0=不限)',
  `daily_used` INT NOT NULL DEFAULT 0 COMMENT '今日已用次数',
  `total_used` INT NOT NULL DEFAULT 0 COMMENT '累计使用次数',
  `total_tokens` BIGINT NOT NULL DEFAULT 0 COMMENT '累计消耗token数',
  `last_used_at` DATETIME DEFAULT NULL COMMENT '最后使用时间',
  `last_error_at` DATETIME DEFAULT NULL COMMENT '最后错误时间',
  `last_error` TEXT DEFAULT NULL COMMENT '最后错误信息',
  `consecutive_errors` INT NOT NULL DEFAULT 0 COMMENT '连续错误次数',
  `remark` VARCHAR(500) DEFAULT NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_provider_status` (`provider`, `status`),
  INDEX `idx_priority` (`priority`, `weight`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='系统API Key加密存储表';
```

#### Sequelize 模型

```typescript
// src/models/systemKey.model.ts
import { DataTypes } from 'sequelize';
import sequelize from '../db/mysql';

const SystemKey = sequelize.define('SystemKey', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  provider: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'provider',
    comment: 'AI供应商: anthropic/openai/google/deepseek/moonshot/custom',
  },
  keyAlias: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'key_alias',
    comment: 'Key别名',
  },
  encryptedKey: {
    type: DataTypes.TEXT,
    allowNull: false,
    field: 'encrypted_key',
    comment: 'AES-256-GCM加密后的API Key',
  },
  encryptionIv: {
    type: DataTypes.STRING(64),
    allowNull: false,
    field: 'encryption_iv',
    comment: '加密初始化向量',
  },
  baseURL: {
    type: DataTypes.STRING(500),
    allowNull: false,
    field: 'base_url',
    comment: 'API端点地址',
  },
  apiType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'openai-completions',
    field: 'api_type',
    comment: 'API协议类型: openai-completions/anthropic-messages',
  },
  modelWhitelist: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null,
    field: 'model_whitelist',
    comment: '允许的模型列表(JSON数组), null=不限制',
  },
  status: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1,
    comment: '0=禁用 1=启用 2=额度耗尽 3=Key失效',
  },
  priority: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 100,
    comment: '优先级(越小越优先)',
  },
  weight: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: '同优先级轮询权重',
  },
  dailyLimit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'daily_limit',
    comment: '每日请求上限(0=不限)',
  },
  dailyUsed: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'daily_used',
    comment: '今日已用次数',
  },
  totalUsed: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_used',
    comment: '累计使用次数',
  },
  totalTokens: {
    type: DataTypes.BIGINT,
    allowNull: false,
    defaultValue: 0,
    field: 'total_tokens',
    comment: '累计消耗token数',
  },
  lastUsedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_used_at',
  },
  lastErrorAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_error_at',
  },
  lastError: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'last_error',
  },
  consecutiveErrors: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'consecutive_errors',
    comment: '连续错误次数(成功后重置为0)',
  },
  remark: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
}, {
  tableName: 'system_key',
  freezeTableName: true,
  paranoid: true,
  underscored: true,
  indexes: [
    { name: 'idx_provider_status', fields: ['provider', 'status'] },
    { name: 'idx_priority', fields: ['priority', 'weight'] },
  ],
});

export default SystemKey;
```

---

### 2.2 credits_pricing 表（积分定价配置）

配置各 AI 模型的积分单价，管理后台可动态调整。单价允许小数（DECIMAL），实际扣减时向上取整。

#### 完整字段定义

| 字段名 | 数据库列名 | 类型 | 约束 | 默认值 | 说明 |
|--------|-----------|------|------|--------|------|
| id | id | BIGINT | PK, 自增 | - | 主键 |
| provider | provider | VARCHAR(50) | 非空 | - | AI 供应商标识 |
| modelId | model_id | VARCHAR(100) | 非空, unique | - | 模型标识（如 claude-sonnet-4-20250514） |
| modelName | model_name | VARCHAR(100) | 非空 | - | 模型显示名（如 Claude Sonnet） |
| inputPrice | input_price | DECIMAL(10,4) | 非空 | 0.0000 | 输入价格（积分/千token），实际扣减时取整 |
| outputPrice | output_price | DECIMAL(10,4) | 非空 | 0.0000 | 输出价格（积分/千token），实际扣减时取整 |
| cacheReadPrice | cache_read_price | DECIMAL(10,4) | 非空 | 0.0000 | 缓存读取价格（积分/千token） |
| cacheWritePrice | cache_write_price | DECIMAL(10,4) | 非空 | 0.0000 | 缓存写入价格（积分/千token） |
| maxTokensPerRequest | max_tokens_per_request | INT | 非空 | 32000 | 单次请求最大 token 数限制 |
| status | status | TINYINT | 非空 | 1 | 0=下架 1=上架 |
| sortOrder | sort_order | INT | 非空 | 0 | 排序（客户端模型列表展示顺序，越小越靠前） |
| description | description | VARCHAR(500) | 可空 | NULL | 模型描述（前端展示用） |
| remark | remark | VARCHAR(500) | 可空 | NULL | 备注（仅管理后台可见） |
| createdAt | created_at | DATETIME | 非空 | NOW | 创建时间 |
| updatedAt | updated_at | DATETIME | 非空 | NOW | 更新时间 |
| deletedAt | deleted_at | DATETIME | 可空 | NULL | 软删除时间 |

> **为什么单价用 DECIMAL 而不是 INTEGER？** 定价表是管理配置，需要灵活精度（如 GPT-4o-mini 输入单价 0.5 积分/千token）。最终扣减到 `member.points` 时 `Math.ceil()` 取整，保证积分始终是整数。

#### 索引

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| uk_model_id | model_id | 唯一索引 | 模型标识唯一 |
| idx_provider_status | (provider, status) | 普通索引 | 按供应商查询上架模型 |

#### 建表 SQL

```sql
CREATE TABLE `credits_pricing` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `provider` VARCHAR(50) NOT NULL COMMENT 'AI供应商标识',
  `model_id` VARCHAR(100) NOT NULL COMMENT '模型标识',
  `model_name` VARCHAR(100) NOT NULL COMMENT '模型显示名',
  `input_price` DECIMAL(10,4) NOT NULL DEFAULT 0.0000 COMMENT '输入价格(积分/千token)',
  `output_price` DECIMAL(10,4) NOT NULL DEFAULT 0.0000 COMMENT '输出价格(积分/千token)',
  `cache_read_price` DECIMAL(10,4) NOT NULL DEFAULT 0.0000 COMMENT '缓存读取价格(积分/千token)',
  `cache_write_price` DECIMAL(10,4) NOT NULL DEFAULT 0.0000 COMMENT '缓存写入价格(积分/千token)',
  `max_tokens_per_request` INT NOT NULL DEFAULT 32000 COMMENT '单次请求最大token数',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '0=下架 1=上架',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序(越小越靠前)',
  `description` VARCHAR(500) DEFAULT NULL COMMENT '模型描述(前端展示)',
  `remark` VARCHAR(500) DEFAULT NULL COMMENT '备注(管理后台)',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_model_id` (`model_id`),
  INDEX `idx_provider_status` (`provider`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='AI模型积分定价配置表';
```

#### 初始数据

```sql
INSERT INTO `credits_pricing` (`provider`, `model_id`, `model_name`, `input_price`, `output_price`, `cache_read_price`, `cache_write_price`, `sort_order`, `description`) VALUES
('anthropic', 'claude-sonnet-4-20250514',   'Claude Sonnet 4',  3.0000, 15.0000, 0.3000, 3.7500, 10, '主力模型，性能与成本平衡'),
('anthropic', 'claude-haiku-3.5',           'Claude Haiku 3.5', 1.0000,  5.0000, 0.1000, 1.2500, 20, '轻量高速模型，适合简单对话'),
('openai',    'gpt-4o',                     'GPT-4o',           5.0000, 15.0000, 2.5000, 0.0000, 30, '高端多模态模型'),
('openai',    'gpt-4o-mini',                'GPT-4o Mini',      0.5000,  2.0000, 0.2500, 0.0000, 40, '经济实惠的轻量模型'),
('deepseek',  'deepseek-chat',              'DeepSeek V3',      0.5000,  2.0000, 0.1000, 0.0000, 50, '国产高性价比模型');
```

#### Sequelize 模型

```typescript
// src/models/creditsPricing.model.ts
import { DataTypes } from 'sequelize';
import sequelize from '../db/mysql';

const CreditsPricing = sequelize.define('CreditsPricing', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  provider: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'AI供应商标识',
  },
  modelId: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    field: 'model_id',
    comment: '模型标识',
  },
  modelName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'model_name',
    comment: '模型显示名',
  },
  inputPrice: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0.0000,
    field: 'input_price',
    comment: '输入价格(积分/千token)',
  },
  outputPrice: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0.0000,
    field: 'output_price',
    comment: '输出价格(积分/千token)',
  },
  cacheReadPrice: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0.0000,
    field: 'cache_read_price',
    comment: '缓存读取价格(积分/千token)',
  },
  cacheWritePrice: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0.0000,
    field: 'cache_write_price',
    comment: '缓存写入价格(积分/千token)',
  },
  maxTokensPerRequest: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 32000,
    field: 'max_tokens_per_request',
    comment: '单次请求最大token数',
  },
  status: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1,
    comment: '0=下架 1=上架',
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'sort_order',
    comment: '排序(越小越靠前)',
  },
  description: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '模型描述(前端展示)',
  },
  remark: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '备注(管理后台)',
  },
}, {
  tableName: 'credits_pricing',
  freezeTableName: true,
  paranoid: true,
  underscored: true,
  indexes: [
    { name: 'idx_provider_status', fields: ['provider', 'status'] },
  ],
});

export default CreditsPricing;
```

---

### 2.3 credits_transaction 表（算力交易明细）

记录每次 AI 对话的 token 级消费明细。积分变动量（amount）使用 **INTEGER**，与 `member.points` 保持一致。

#### 完整字段定义

| 字段名 | 数据库列名 | 类型 | 约束 | 默认值 | 说明 |
|--------|-----------|------|------|--------|------|
| id | id | BIGINT | PK, 自增 | - | 主键 |
| transactionNo | transaction_no | VARCHAR(64) | 非空, unique | - | 交易流水号（格式：CT + 时间戳 + 随机数） |
| memberId | member_id | BIGINT | 非空 | - | 会员 ID（关联 member.id） |
| type | type | ENUM | 非空 | - | 交易类型（见枚举说明） |
| status | status | ENUM | 非空 | 'PENDING' | 交易状态（见枚举说明） |
| amount | amount | INTEGER | 非空 | 0 | 积分变动量（消耗为负，充值为正，整数） |
| balanceBefore | balance_before | INTEGER | 非空 | - | 变动前余额（整数） |
| balanceAfter | balance_after | INTEGER | 可空 | NULL | 变动后余额（PENDING 时为 null，整数） |
| provider | provider | VARCHAR(50) | 可空 | NULL | AI 供应商（仅 CHAT 类型） |
| modelId | model_id | VARCHAR(100) | 可空 | NULL | 使用的模型（仅 CHAT 类型） |
| inputTokens | input_tokens | INT | 可空 | 0 | 输入 token 数 |
| outputTokens | output_tokens | INT | 可空 | 0 | 输出 token 数 |
| cacheReadTokens | cache_read_tokens | INT | 可空 | 0 | 缓存读取 token 数 |
| cacheWriteTokens | cache_write_tokens | INT | 可空 | 0 | 缓存写入 token 数 |
| totalTokens | total_tokens | INT | 可空 | 0 | 总 token 数 |
| sessionId | session_id | VARCHAR(100) | 可空 | NULL | 对话会话 ID |
| systemKeyId | system_key_id | BIGINT | 可空 | NULL | 使用的系统 Key ID（关联 system_key.id） |
| requestDuration | request_duration | INT | 可空 | NULL | 请求耗时（毫秒） |
| errorMessage | error_message | TEXT | 可空 | NULL | 错误信息（仅 FAILED 状态） |
| remark | remark | VARCHAR(500) | 可空 | NULL | 备注 |
| createdAt | created_at | DATETIME | 非空 | NOW | 创建时间 |
| updatedAt | updated_at | DATETIME | 非空 | NOW | 更新时间 |

#### 枚举值说明

**type（交易类型）：**

| 值 | 说明 |
|---|------|
| CHAT | AI 对话消耗 |
| RECHARGE | 充值 |
| REFUND | 退款 |
| REWARD | 奖励（如新用户赠送） |
| SYSTEM | 系统调整（管理员手动） |

**status（交易状态）：**

| 值 | 说明 |
|---|------|
| PENDING | 进行中（AI 请求尚未完成） |
| COMPLETED | 已完成（积分已扣减/充值） |
| FAILED | 失败（AI 请求出错，不扣费） |

#### 索引

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| uk_transaction_no | transaction_no | 唯一索引 | 流水号唯一 |
| idx_member_id | member_id | 普通索引 | 按会员查询 |
| idx_member_type | (member_id, type) | 普通索引 | 按会员+类型查询 |
| idx_created_at | created_at | 普通索引 | 按时间范围查询（报表） |
| idx_system_key_id | system_key_id | 普通索引 | 按 Key 统计用量 |

#### 建表 SQL

```sql
CREATE TABLE `credits_transaction` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `transaction_no` VARCHAR(64) NOT NULL COMMENT '交易流水号',
  `member_id` BIGINT NOT NULL COMMENT '会员ID',
  `type` ENUM('CHAT','RECHARGE','REFUND','REWARD','SYSTEM') NOT NULL COMMENT '交易类型',
  `status` ENUM('PENDING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING' COMMENT '交易状态',
  `amount` INT NOT NULL DEFAULT 0 COMMENT '积分变动量(消耗为负,充值为正,整数)',
  `balance_before` INT NOT NULL COMMENT '变动前余额',
  `balance_after` INT DEFAULT NULL COMMENT '变动后余额(PENDING时为null)',
  `provider` VARCHAR(50) DEFAULT NULL COMMENT 'AI供应商(仅CHAT)',
  `model_id` VARCHAR(100) DEFAULT NULL COMMENT '使用的模型(仅CHAT)',
  `input_tokens` INT DEFAULT 0 COMMENT '输入token数',
  `output_tokens` INT DEFAULT 0 COMMENT '输出token数',
  `cache_read_tokens` INT DEFAULT 0 COMMENT '缓存读取token数',
  `cache_write_tokens` INT DEFAULT 0 COMMENT '缓存写入token数',
  `total_tokens` INT DEFAULT 0 COMMENT '总token数',
  `session_id` VARCHAR(100) DEFAULT NULL COMMENT '对话会话ID',
  `system_key_id` BIGINT DEFAULT NULL COMMENT '使用的系统Key ID',
  `request_duration` INT DEFAULT NULL COMMENT '请求耗时(毫秒)',
  `error_message` TEXT DEFAULT NULL COMMENT '错误信息(仅FAILED)',
  `remark` VARCHAR(500) DEFAULT NULL COMMENT '备注',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_transaction_no` (`transaction_no`),
  INDEX `idx_member_id` (`member_id`),
  INDEX `idx_member_type` (`member_id`, `type`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_system_key_id` (`system_key_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='AI对话算力交易明细表';
```

#### Sequelize 模型

```typescript
// src/models/creditsTransaction.model.ts
import { DataTypes } from 'sequelize';
import sequelize from '../db/mysql';

const CreditsTransaction = sequelize.define('CreditsTransaction', {
  id: {
    type: DataTypes.BIGINT,
    primaryKey: true,
    autoIncrement: true,
  },
  transactionNo: {
    type: DataTypes.STRING(64),
    allowNull: false,
    unique: true,
    field: 'transaction_no',
    comment: '交易流水号',
  },
  memberId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'member_id',
    comment: '会员ID',
  },
  type: {
    type: DataTypes.ENUM('CHAT', 'RECHARGE', 'REFUND', 'REWARD', 'SYSTEM'),
    allowNull: false,
    comment: '交易类型',
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'COMPLETED', 'FAILED'),
    allowNull: false,
    defaultValue: 'PENDING',
    comment: '交易状态',
  },
  amount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: '积分变动量(消耗为负,充值为正,整数)',
  },
  balanceBefore: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'balance_before',
    comment: '变动前余额',
  },
  balanceAfter: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null,
    field: 'balance_after',
    comment: '变动后余额(PENDING时为null)',
  },
  provider: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'AI供应商(仅CHAT类型)',
  },
  modelId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'model_id',
    comment: '使用的模型(仅CHAT类型)',
  },
  inputTokens: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    field: 'input_tokens',
    comment: '输入token数',
  },
  outputTokens: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    field: 'output_tokens',
    comment: '输出token数',
  },
  cacheReadTokens: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    field: 'cache_read_tokens',
    comment: '缓存读取token数',
  },
  cacheWriteTokens: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    field: 'cache_write_tokens',
    comment: '缓存写入token数',
  },
  totalTokens: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    field: 'total_tokens',
    comment: '总token数',
  },
  sessionId: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'session_id',
    comment: '对话会话ID',
  },
  systemKeyId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'system_key_id',
    comment: '使用的系统Key ID',
  },
  requestDuration: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'request_duration',
    comment: '请求耗时(毫秒)',
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'error_message',
    comment: '错误信息(仅FAILED状态)',
  },
  remark: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },
}, {
  tableName: 'credits_transaction',
  freezeTableName: true,
  underscored: true,
  // 交易记录不软删除
  paranoid: false,
  indexes: [
    { name: 'idx_member_id', fields: ['member_id'] },
    { name: 'idx_member_type', fields: ['member_id', 'type'] },
    { name: 'idx_created_at', fields: ['created_at'] },
    { name: 'idx_system_key_id', fields: ['system_key_id'] },
  ],
});

export default CreditsTransaction;
```

---

## 三、模型关联关系补充

在 `src/models/index.ts` 中新增以下关联：

```typescript
// === 算力相关关联 ===

// member (1) → (N) credits_transaction
Member.hasMany(CreditsTransaction, {
  foreignKey: 'memberId',
  as: 'creditsTransactions',
});
CreditsTransaction.belongsTo(Member, {
  foreignKey: 'memberId',
  as: 'member',
});

// system_key (1) → (N) credits_transaction
SystemKey.hasMany(CreditsTransaction, {
  foreignKey: 'systemKeyId',
  as: 'transactions',
});
CreditsTransaction.belongsTo(SystemKey, {
  foreignKey: 'systemKeyId',
  as: 'systemKey',
});
```

---

## 四、ER 关系图

```
┌──────────────────────┐
│       member         │
│──────────────────────│
│ id (PK)              │
│ points INTEGER       │  ← 不变，保持整数
│ isVip                │
│ ...                  │
└──────┬───────────────┘
       │ 1:N
       │
       ├───────────────────────┐
       │                       │
       ▼                       ▼
┌──────────────────────┐ ┌─────────────────────────┐
│ points_change_record │ │  credits_transaction    │
│──────────────────────│ │─────────────────────────│
│ id (PK)              │ │ id (PK)                 │
│ memberId (FK)        │ │ transactionNo (UK)      │
│ changeType (+AI_CHAT)│ │ memberId (FK → member)  │
│ changeAmount INT     │ │ type                    │
│ balanceBefore INT    │ │ status                  │
│ balanceAfter INT     │ │ amount INTEGER          │
│ ...                  │ │ balanceBefore/After INT │
└──────────────────────┘ │ provider / modelId      │
                         │ inputTokens             │
┌──────────────────────┐ │ outputTokens            │
│     system_key       │ │ systemKeyId (FK) ───────│──┐
│──────────────────────│ │ sessionId               │  │
│ id (PK)           ◄──│─│ ...                     │  │
│ provider             │ └─────────────────────────┘  │
│ keyAlias             │                              │
│ encryptedKey         │◄─────────────────────────────┘
│ baseURL              │
│ status               │
│ priority / weight    │ ┌─────────────────────────┐
│ dailyLimit/dailyUsed │ │   credits_pricing       │
│ totalUsed/totalTokens│ │─────────────────────────│
│ ...                  │ │ id (PK)                 │
└──────────────────────┘ │ provider                │
                         │ modelId (UK)            │
┌──────────────────────┐ │ modelName               │
│    order_record      │ │ inputPrice DECIMAL      │  ← 单价允许小数
│──────────────────────│ │ outputPrice DECIMAL     │
│ orderType            │ │ cacheReadPrice          │
│ (+AI_RECHARGE 可选)  │ │ cacheWritePrice         │
│ ...                  │ │ status                  │
└──────────────────────┘ │ ...                     │
                         └─────────────────────────┘
```

---

## 五、完整迁移 SQL 脚本

将所有变更合并为一个可执行的迁移脚本：

```sql
-- ================================================================
-- AivoClaw 算力聊天功能 — 数据库迁移脚本
-- 日期: 2026-03-14
-- 警告: 执行前请备份数据库！
-- ================================================================

-- [1] 修改 points_change_record 表 — 新增 AI_CHAT 枚举值
ALTER TABLE `points_change_record`
  MODIFY COLUMN `change_type` ENUM('RECHARGE','PURCHASE','REWARD','REFUND','SYSTEM','AI_CHAT')
  NOT NULL COMMENT '变动类型';

-- [2] 修改 order_record 表（可选）
ALTER TABLE `order_record`
  MODIFY COLUMN `order_type` ENUM('MEMBER','RENEWAL','RECHARGE','AI_RECHARGE')
  NOT NULL COMMENT '订单类型';

-- [3] 新增 system_key 表
CREATE TABLE IF NOT EXISTS `system_key` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `provider` VARCHAR(50) NOT NULL COMMENT 'AI供应商',
  `key_alias` VARCHAR(100) NOT NULL COMMENT 'Key别名',
  `encrypted_key` TEXT NOT NULL COMMENT 'AES-256-GCM加密后的API Key',
  `encryption_iv` VARCHAR(64) NOT NULL COMMENT '加密IV',
  `base_url` VARCHAR(500) NOT NULL COMMENT 'API端点地址',
  `api_type` VARCHAR(50) NOT NULL DEFAULT 'openai-completions' COMMENT 'API协议类型',
  `model_whitelist` JSON DEFAULT NULL COMMENT '允许的模型列表',
  `status` TINYINT NOT NULL DEFAULT 1 COMMENT '0=禁用 1=启用 2=额度耗尽 3=失效',
  `priority` INT NOT NULL DEFAULT 100 COMMENT '优先级(越小越优先)',
  `weight` INT NOT NULL DEFAULT 1 COMMENT '轮询权重',
  `daily_limit` INT NOT NULL DEFAULT 0 COMMENT '每日上限(0=不限)',
  `daily_used` INT NOT NULL DEFAULT 0 COMMENT '今日已用',
  `total_used` INT NOT NULL DEFAULT 0 COMMENT '累计使用',
  `total_tokens` BIGINT NOT NULL DEFAULT 0 COMMENT '累计token',
  `last_used_at` DATETIME DEFAULT NULL,
  `last_error_at` DATETIME DEFAULT NULL,
  `last_error` TEXT DEFAULT NULL,
  `consecutive_errors` INT NOT NULL DEFAULT 0 COMMENT '连续错误次数',
  `remark` VARCHAR(500) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_provider_status` (`provider`, `status`),
  INDEX `idx_priority` (`priority`, `weight`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='系统API Key加密存储表';

-- [4] 新增 credits_pricing 表
CREATE TABLE IF NOT EXISTS `credits_pricing` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `provider` VARCHAR(50) NOT NULL,
  `model_id` VARCHAR(100) NOT NULL,
  `model_name` VARCHAR(100) NOT NULL,
  `input_price` DECIMAL(10,4) NOT NULL DEFAULT 0.0000 COMMENT '输入价格(积分/千token)',
  `output_price` DECIMAL(10,4) NOT NULL DEFAULT 0.0000 COMMENT '输出价格(积分/千token)',
  `cache_read_price` DECIMAL(10,4) NOT NULL DEFAULT 0.0000 COMMENT '缓存读取价格(积分/千token)',
  `cache_write_price` DECIMAL(10,4) NOT NULL DEFAULT 0.0000 COMMENT '缓存写入价格(积分/千token)',
  `max_tokens_per_request` INT NOT NULL DEFAULT 32000,
  `status` TINYINT NOT NULL DEFAULT 1,
  `sort_order` INT NOT NULL DEFAULT 0,
  `description` VARCHAR(500) DEFAULT NULL,
  `remark` VARCHAR(500) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_model_id` (`model_id`),
  INDEX `idx_provider_status` (`provider`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='AI模型积分定价配置表';

-- [5] 新增 credits_transaction 表
CREATE TABLE IF NOT EXISTS `credits_transaction` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `transaction_no` VARCHAR(64) NOT NULL,
  `member_id` BIGINT NOT NULL,
  `type` ENUM('CHAT','RECHARGE','REFUND','REWARD','SYSTEM') NOT NULL,
  `status` ENUM('PENDING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  `amount` INT NOT NULL DEFAULT 0 COMMENT '积分变动量(消耗为负,充值为正,整数)',
  `balance_before` INT NOT NULL COMMENT '变动前余额',
  `balance_after` INT DEFAULT NULL COMMENT '变动后余额(PENDING时为null)',
  `provider` VARCHAR(50) DEFAULT NULL,
  `model_id` VARCHAR(100) DEFAULT NULL,
  `input_tokens` INT DEFAULT 0,
  `output_tokens` INT DEFAULT 0,
  `cache_read_tokens` INT DEFAULT 0,
  `cache_write_tokens` INT DEFAULT 0,
  `total_tokens` INT DEFAULT 0,
  `session_id` VARCHAR(100) DEFAULT NULL,
  `system_key_id` BIGINT DEFAULT NULL,
  `request_duration` INT DEFAULT NULL,
  `error_message` TEXT DEFAULT NULL,
  `remark` VARCHAR(500) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_transaction_no` (`transaction_no`),
  INDEX `idx_member_id` (`member_id`),
  INDEX `idx_member_type` (`member_id`, `type`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_system_key_id` (`system_key_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='AI对话算力交易明细表';

-- [6] 插入默认定价数据
INSERT INTO `credits_pricing` (`provider`, `model_id`, `model_name`, `input_price`, `output_price`, `cache_read_price`, `cache_write_price`, `sort_order`, `description`) VALUES
('anthropic', 'claude-sonnet-4-20250514',   'Claude Sonnet 4',  3.0000, 15.0000, 0.3000, 3.7500, 10, '主力模型，性能与成本平衡'),
('anthropic', 'claude-haiku-3.5',           'Claude Haiku 3.5', 1.0000,  5.0000, 0.1000, 1.2500, 20, '轻量高速模型，适合简单对话'),
('openai',    'gpt-4o',                     'GPT-4o',           5.0000, 15.0000, 2.5000, 0.0000, 30, '高端多模态模型'),
('openai',    'gpt-4o-mini',                'GPT-4o Mini',      0.5000,  2.0000, 0.2500, 0.0000, 40, '经济实惠的轻量模型'),
('deepseek',  'deepseek-chat',              'DeepSeek V3',      0.5000,  2.0000, 0.1000, 0.0000, 50, '国产高性价比模型');

-- ================================================================
-- 迁移完成
-- ================================================================
```

---

## 六、影响范围检查清单

### 6.1 changeType 枚举变更影响

| 代码位置 | 需要调整 |
|---------|---------|
| 积分报表筛选 | 下拉选项新增 `AI_CHAT` |
| 积分报表统计 | 统计逻辑覆盖新类型 |
| 积分变动列表 | 显示文案新增"AI 对话消耗" |

### 6.2 积分扣减逻辑（新增代码）

```typescript
// 积分计算伪代码 — creditsService.ts

/**
 * 计算本次 AI 对话消耗的积分（向上取整）
 * @param {number} inputTokens - 输入 token 数
 * @param {number} outputTokens - 输出 token 数
 * @param {number} cacheReadTokens - 缓存读取 token 数
 * @param {number} cacheWriteTokens - 缓存写入 token 数
 * @param {object} pricing - 定价配置（credits_pricing 行）
 * @returns {number} 应扣减积分（正整数，最少 1）
 */
function calculateCreditsCost(inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, pricing) {
  const rawCost =
    (inputTokens / 1000) * pricing.inputPrice +
    (outputTokens / 1000) * pricing.outputPrice +
    (cacheReadTokens / 1000) * pricing.cacheReadPrice +
    (cacheWriteTokens / 1000) * pricing.cacheWritePrice;

  // 向上取整，最少扣 1 积分
  return Math.max(1, Math.ceil(rawCost));
}

// 扣减积分（原子操作）
async function deductCredits(memberId, cost, transaction) {
  const [affectedRows] = await sequelize.query(
    `UPDATE member SET points = points - :cost WHERE id = :memberId AND points >= :cost`,
    { replacements: { cost, memberId }, type: QueryTypes.UPDATE }
  );

  if (affectedRows === 0) {
    throw new Error('余额不足');
  }

  // 更新交易记录
  const member = await Member.findByPk(memberId);
  await transaction.update({
    status: 'COMPLETED',
    amount: -cost,
    balanceAfter: member.points,
  });
}
```

### 6.3 Sequelize 注意事项

该项目没有迁移文件，使用 `sequelize.sync()` 管理表结构。因此：

- **生产环境**：必须手动执行上述 SQL 迁移脚本，不能用 `sync({ alter: true })`
- **开发环境**：可以用 `sync({ alter: true })` 自动同步
- **sync.ts** 中需要 import 新增的三个模型文件
- **index.ts** 中需要添加新的关联关系定义

### 6.4 不需要改动的现有表

| 表名 | 说明 |
|------|------|
| `member` | `points` 保持 INTEGER，不修改 |
| `points_change_record` | `changeAmount`/`balanceBefore`/`balanceAfter` 保持 INTEGER，不修改 |
| `package` | `points` 字段已经是 INTEGER，套餐积分为整数，不修改 |
