# AivoClaw 算力聊天 — 数据库表结构变更清单

日期: 2026-03-14 | 关联文档: aivoclaw-credits-plan.md

---

# 一、变更总览

| 变更类型 | 表名                   | 变更说明                                       |
|---------|------------------------|-----------------------------------------------|
| 修改     | points_change_record   | changeType 枚举新增 AI_CHAT 值                  |
| 修改     | order_record           | orderType 枚举新增 AI_RECHARGE（可选）            |
| 新增     | system_key             | 系统 API Key 加密存储表                          |
| 新增     | credits_pricing        | AI 模型积分定价配置表                             |
| 新增     | credits_transaction    | AI 对话算力交易明细表                             |

member 表不做修改。points 字段保持 INTEGER 类型，积分全程使用整数，扣减时向上取整（Math.ceil）。

---

# 二、积分取整策略

定价表（credits_pricing）用 DECIMAL 存储单价，允许灵活配置。实际扣减时计算后向上取整：

计算公式：

原始消耗 = (输入token数 / 1000) x 输入单价 + (输出token数 / 1000) x 输出单价 + (缓存读取token / 1000) x 缓存读取单价 + (缓存写入token / 1000) x 缓存写入单价

实际扣减 = Math.ceil(原始消耗)，最少扣 1 积分

示例：Claude Sonnet（输入 3 积分/千token，输出 15 积分/千token），本次对话输入 520 token、输出 180 token：

- 原始 = (520/1000) x 3 + (180/1000) x 15 = 1.56 + 2.7 = 4.26
- 实际扣减 = ceil(4.26) = 5 积分

---

# 三、修改现有表

## 3.1 points_change_record 表

变更内容：changeType 枚举新增 AI_CHAT 值

| 字段名称     | 当前定义                                                     | 变更后定义                                                               |
|-------------|-------------------------------------------------------------|-------------------------------------------------------------------------|
| changeType  | ENUM('RECHARGE','PURCHASE','REWARD','REFUND','SYSTEM')       | ENUM('RECHARGE','PURCHASE','REWARD','REFUND','SYSTEM','AI_CHAT')         |

金额字段 changeAmount、balanceBefore、balanceAfter 保持 INTEGER 不变。

迁移 SQL：

```sql
ALTER TABLE points_change_record MODIFY COLUMN change_type ENUM('RECHARGE','PURCHASE','REWARD','REFUND','SYSTEM','AI_CHAT') NOT NULL COMMENT '变动类型';
```

Sequelize 变更：changeType 的 DataTypes.ENUM 参数末尾追加 'AI_CHAT'

---

## 3.2 order_record 表（可选）

变更内容：orderType 枚举新增 AI_RECHARGE 值

| 字段名称     | 当前定义                                    | 变更后定义                                                    |
|-------------|--------------------------------------------|------------------------------------------------------------|
| orderType   | ENUM('MEMBER','RENEWAL','RECHARGE')         | ENUM('MEMBER','RENEWAL','RECHARGE','AI_RECHARGE')            |

迁移 SQL：

```sql
ALTER TABLE order_record MODIFY COLUMN order_type ENUM('MEMBER','RENEWAL','RECHARGE','AI_RECHARGE') NOT NULL COMMENT '订单类型';
```

备注：AI_RECHARGE 为可选。如果不需要在订单层面区分，可统一使用 RECHARGE，通过 package.packageType 区分套餐类别。

---

# 四、新增表

## 4.1 system_key 表（系统 API Key）

存储供 AI 对话代理使用的系统级 API Key，加密存储，用户不可见。

### 字段定义

| 字段名（camelCase）   | 数据库列名（snake_case） | 数据类型         | 约束条件    | 默认值              | 字段说明                                          |
|----------------------|------------------------|-----------------|-----------|--------------------|-------------------------------------------------|
| id                   | id                     | BIGINT          | PK 自增    | -                  | 主键                                             |
| provider             | provider               | VARCHAR(50)     | 非空       | -                  | AI 供应商：anthropic / openai / google / deepseek  |
| keyAlias             | key_alias              | VARCHAR(100)    | 非空       | -                  | Key 别名（如"Claude 主力 Key-1"）                   |
| encryptedKey         | encrypted_key          | TEXT            | 非空       | -                  | AES-256-GCM 加密后的 API Key                       |
| encryptionIv         | encryption_iv          | VARCHAR(64)     | 非空       | -                  | 加密初始化向量（每个 Key 独立 IV）                    |
| baseURL              | base_url               | VARCHAR(500)    | 非空       | -                  | API 端点地址                                       |
| apiType              | api_type               | VARCHAR(50)     | 非空       | openai-completions | API 协议类型                                       |
| modelWhitelist       | model_whitelist        | JSON            | 可空       | NULL               | 允许使用的模型列表，NULL 表示不限制                    |
| status               | status                 | TINYINT         | 非空       | 1                  | 0=禁用 1=启用 2=额度耗尽 3=Key 失效                  |
| priority             | priority               | INT             | 非空       | 100                | 优先级（数值越小越优先选取）                           |
| weight               | weight                 | INT             | 非空       | 1                  | 同优先级内的轮询权重                                  |
| dailyLimit           | daily_limit            | INT             | 非空       | 0                  | 每日请求次数上限（0 表示不限制）                        |
| dailyUsed            | daily_used             | INT             | 非空       | 0                  | 今日已使用次数（每日凌晨定时重置）                      |
| totalUsed            | total_used             | INT             | 非空       | 0                  | 累计使用次数                                        |
| totalTokens          | total_tokens           | BIGINT          | 非空       | 0                  | 累计消耗 token 数                                   |
| lastUsedAt           | last_used_at           | DATETIME        | 可空       | NULL               | 最后使用时间                                        |
| lastErrorAt          | last_error_at          | DATETIME        | 可空       | NULL               | 最后错误发生时间                                     |
| lastError            | last_error             | TEXT            | 可空       | NULL               | 最后错误信息                                        |
| consecutiveErrors    | consecutive_errors     | INT             | 非空       | 0                  | 连续错误次数（成功后重置为 0）                         |
| remark               | remark                 | VARCHAR(500)    | 可空       | NULL               | 备注                                              |
| createdAt            | created_at             | DATETIME        | 非空       | CURRENT_TIMESTAMP  | 创建时间                                           |
| updatedAt            | updated_at             | DATETIME        | 非空       | CURRENT_TIMESTAMP  | 更新时间                                           |
| deletedAt            | deleted_at             | DATETIME        | 可空       | NULL               | 软删除时间                                          |

### 索引

| 索引名称              | 索引字段                | 索引类型   | 用途说明                |
|----------------------|------------------------|-----------|------------------------|
| idx_provider_status  | (provider, status)     | 普通索引   | Key 选取查询加速         |
| idx_priority         | (priority, weight)     | 普通索引   | 优先级排序加速            |

### Key 选取策略

1. 按 provider 筛选启用的 Key
2. 排除达到日限额的 Key
3. 按优先级排序
4. 同优先级内加权轮询
5. 调用失败自动降级

---

## 4.2 credits_pricing 表（积分定价配置）

配置各 AI 模型的积分单价，管理后台可动态调整。单价用 DECIMAL（灵活精度），实际扣减时 Math.ceil() 取整。

### 字段定义

| 字段名（camelCase）     | 数据库列名（snake_case）   | 数据类型         | 约束条件     | 默认值              | 字段说明                             |
|------------------------|--------------------------|-----------------|------------|--------------------|------------------------------------|
| id                     | id                       | BIGINT          | PK 自增     | -                  | 主键                                |
| provider               | provider                 | VARCHAR(50)     | 非空        | -                  | AI 供应商标识                         |
| modelId                | model_id                 | VARCHAR(100)    | 非空 唯一    | -                  | 模型标识（如 claude-sonnet-4-20250514）|
| modelName              | model_name               | VARCHAR(100)    | 非空        | -                  | 模型显示名（如 Claude Sonnet 4）       |
| inputPrice             | input_price              | DECIMAL(10,4)   | 非空        | 0.0000             | 输入价格（积分 / 千 token）             |
| outputPrice            | output_price             | DECIMAL(10,4)   | 非空        | 0.0000             | 输出价格（积分 / 千 token）             |
| cacheReadPrice         | cache_read_price         | DECIMAL(10,4)   | 非空        | 0.0000             | 缓存读取价格（积分 / 千 token）          |
| cacheWritePrice        | cache_write_price        | DECIMAL(10,4)   | 非空        | 0.0000             | 缓存写入价格（积分 / 千 token）          |
| maxTokensPerRequest    | max_tokens_per_request   | INT             | 非空        | 32000              | 单次请求最大 token 数限制               |
| status                 | status                   | TINYINT         | 非空        | 1                  | 0=下架 1=上架                         |
| sortOrder              | sort_order               | INT             | 非空        | 0                  | 排序（数值越小越靠前）                   |
| description            | description              | VARCHAR(500)    | 可空        | NULL               | 模型描述（前端展示用）                   |
| remark                 | remark                   | VARCHAR(500)    | 可空        | NULL               | 备注（仅管理后台可见）                   |
| createdAt              | created_at               | DATETIME        | 非空        | CURRENT_TIMESTAMP  | 创建时间                              |
| updatedAt              | updated_at               | DATETIME        | 非空        | CURRENT_TIMESTAMP  | 更新时间                              |
| deletedAt              | deleted_at               | DATETIME        | 可空        | NULL               | 软删除时间                             |

为什么单价用 DECIMAL？定价表是管理配置，需要灵活精度（如 GPT-4o-mini 输入单价 0.5 积分/千token）。最终扣减到 member.points 时 Math.ceil() 取整，保证积分始终是整数。

### 索引

| 索引名称              | 索引字段                | 索引类型   | 用途说明                  |
|----------------------|------------------------|-----------|-------------------------|
| uk_model_id          | model_id               | 唯一索引   | 模型标识唯一约束            |
| idx_provider_status  | (provider, status)     | 普通索引   | 按供应商查询上架模型         |

### 初始定价数据

| AI 供应商  | 模型 ID                   | 显示名称          | 输入价格 | 输出价格 | 缓存读取 | 缓存写入 | 排序 | 描述说明               |
|-----------|--------------------------|------------------|---------|---------|---------|---------|------|----------------------|
| anthropic | claude-sonnet-4-20250514 | Claude Sonnet 4  | 3.0     | 15.0    | 0.3     | 3.75    | 10   | 主力模型，性能与成本平衡  |
| anthropic | claude-haiku-3.5         | Claude Haiku 3.5 | 1.0     | 5.0     | 0.1     | 1.25    | 20   | 轻量高速，适合简单对话    |
| openai    | gpt-4o                   | GPT-4o           | 5.0     | 15.0    | 2.5     | 0.0     | 30   | 高端多模态模型           |
| openai    | gpt-4o-mini              | GPT-4o Mini      | 0.5     | 2.0     | 0.25    | 0.0     | 40   | 经济实惠的轻量模型       |
| deepseek  | deepseek-chat            | DeepSeek V3      | 0.5     | 2.0     | 0.1     | 0.0     | 50   | 国产高性价比模型         |

---

## 4.3 credits_transaction 表（算力交易明细）

记录每次 AI 对话的 token 级消费明细。积分变动量使用 INTEGER，与 member.points 保持一致。

### 字段定义

| 字段名（camelCase）   | 数据库列名（snake_case） | 数据类型         | 约束条件    | 默认值              | 字段说明                                    |
|----------------------|------------------------|-----------------|-----------|--------------------|--------------------------------------------|
| id                   | id                     | BIGINT          | PK 自增    | -                  | 主键                                        |
| transactionNo        | transaction_no         | VARCHAR(64)     | 非空 唯一   | -                  | 交易流水号（格式：CT + 时间戳 + 随机数）         |
| memberId             | member_id              | BIGINT          | 非空       | -                  | 会员 ID（关联 member.id）                     |
| type                 | type                   | ENUM            | 非空       | -                  | 交易类型（见下方枚举说明）                      |
| status               | status                 | ENUM            | 非空       | PENDING            | 交易状态（见下方枚举说明）                      |
| amount               | amount                 | INTEGER         | 非空       | 0                  | 积分变动量（消耗为负，充值为正，整数）             |
| balanceBefore        | balance_before         | INTEGER         | 非空       | -                  | 变动前积分余额（整数）                          |
| balanceAfter         | balance_after          | INTEGER         | 可空       | NULL               | 变动后积分余额（PENDING 时为 null，整数）         |
| provider             | provider               | VARCHAR(50)     | 可空       | NULL               | AI 供应商（仅 CHAT 类型有值）                   |
| modelId              | model_id               | VARCHAR(100)    | 可空       | NULL               | 使用的模型（仅 CHAT 类型有值）                   |
| inputTokens          | input_tokens           | INT             | 可空       | 0                  | 输入 token 数                                |
| outputTokens         | output_tokens          | INT             | 可空       | 0                  | 输出 token 数                                |
| cacheReadTokens      | cache_read_tokens      | INT             | 可空       | 0                  | 缓存读取 token 数                             |
| cacheWriteTokens     | cache_write_tokens     | INT             | 可空       | 0                  | 缓存写入 token 数                             |
| totalTokens          | total_tokens           | INT             | 可空       | 0                  | 总 token 数                                  |
| sessionId            | session_id             | VARCHAR(100)    | 可空       | NULL               | 对话会话 ID                                   |
| systemKeyId          | system_key_id          | BIGINT          | 可空       | NULL               | 使用的系统 Key ID（关联 system_key.id）          |
| requestDuration      | request_duration       | INT             | 可空       | NULL               | 请求耗时（毫秒）                               |
| errorMessage         | error_message          | TEXT            | 可空       | NULL               | 错误信息（仅 FAILED 状态有值）                   |
| remark               | remark                 | VARCHAR(500)    | 可空       | NULL               | 备注                                         |
| createdAt            | created_at             | DATETIME        | 非空       | CURRENT_TIMESTAMP  | 创建时间                                      |
| updatedAt            | updated_at             | DATETIME        | 非空       | CURRENT_TIMESTAMP  | 更新时间                                      |

### 枚举值

type（交易类型）：

| 枚举值    | 说明                         |
|----------|------------------------------|
| CHAT     | AI 对话消耗                    |
| RECHARGE | 充值（购买积分套餐）             |
| REFUND   | 退款                          |
| REWARD   | 奖励（如新用户赠送体验积分）      |
| SYSTEM   | 系统调整（管理员手动操作）        |

status（交易状态）：

| 枚举值      | 说明                               |
|------------|-----------------------------------|
| PENDING    | 进行中（AI 请求尚未完成，未扣费）      |
| COMPLETED  | 已完成（积分已扣减或已充值到账）       |
| FAILED     | 失败（AI 请求出错，不扣费）           |

### 索引

| 索引名称              | 索引字段                | 索引类型   | 用途说明                  |
|----------------------|------------------------|-----------|-------------------------|
| uk_transaction_no    | transaction_no         | 唯一索引   | 交易流水号唯一约束          |
| idx_member_id        | member_id              | 普通索引   | 按会员查询交易记录          |
| idx_member_type      | (member_id, type)      | 普通索引   | 按会员 + 类型联合查询       |
| idx_created_at       | created_at             | 普通索引   | 按时间范围查询（报表统计）    |
| idx_system_key_id    | system_key_id          | 普通索引   | 按系统 Key 统计用量         |

---

# 五、模型关联关系

在 models/index.ts 中新增以下关联：

- member (1) → (N) credits_transaction — 一个会员有多条算力交易记录
- system_key (1) → (N) credits_transaction — 一个系统 Key 对应多条交易记录
- credits_pricing 为独立配置表，无外键关联

---

# 六、ER 关系图

| 主表               | 关系  | 关联表                  | 关联字段（外键）       | 说明                                  |
|-------------------|------|------------------------|--------------------|-----------------------------------------|
| member            | 1:N  | credits_transaction    | memberId → member.id  | 一个会员有多条算力交易记录                  |
| member            | 1:N  | points_change_record   | memberId → member.id  | 一个会员有多条积分变动记录（新增 AI_CHAT 类型）|
| system_key        | 1:N  | credits_transaction    | systemKeyId → system_key.id | 一个系统 Key 对应多条交易记录         |
| credits_pricing   | 无   | -                      | -                  | 独立配置表，不与其他表建外键关联             |
| order_record      | 无   | -                      | -                  | orderType 可选新增 AI_RECHARGE            |

### 表字段类型要点

| 表名                  | 关键字段                                    | 数据类型   | 备注                          |
|----------------------|---------------------------------------------|-----------|-------------------------------|
| member               | points                                      | INTEGER   | 不修改，积分始终为整数            |
| credits_transaction  | amount / balanceBefore / balanceAfter        | INTEGER   | 积分变动量和余额均为整数           |
| credits_pricing      | inputPrice / outputPrice / cacheReadPrice    | DECIMAL   | 单价允许小数，扣减时 ceil 取整     |
| points_change_record | changeAmount / balanceBefore / balanceAfter  | INTEGER   | 不修改，保持整数                 |

---

# 七、完整迁移 SQL

以下为合并后的完整迁移脚本，执行前请备份数据库。

**[1] 修改 points_change_record 表**

```sql
ALTER TABLE points_change_record MODIFY COLUMN change_type ENUM('RECHARGE','PURCHASE','REWARD','REFUND','SYSTEM','AI_CHAT') NOT NULL COMMENT '变动类型';
```

**[2] 修改 order_record 表（可选）**

```sql
ALTER TABLE order_record MODIFY COLUMN order_type ENUM('MEMBER','RENEWAL','RECHARGE','AI_RECHARGE') NOT NULL COMMENT '订单类型';
```

**[3] 新增 system_key 表**

```sql
CREATE TABLE IF NOT EXISTS system_key (
  id BIGINT NOT NULL AUTO_INCREMENT,
  provider VARCHAR(50) NOT NULL COMMENT 'AI供应商',
  key_alias VARCHAR(100) NOT NULL COMMENT 'Key别名',
  encrypted_key TEXT NOT NULL COMMENT 'AES-256-GCM加密后的API Key',
  encryption_iv VARCHAR(64) NOT NULL COMMENT '加密IV',
  base_url VARCHAR(500) NOT NULL COMMENT 'API端点地址',
  api_type VARCHAR(50) NOT NULL DEFAULT 'openai-completions' COMMENT 'API协议类型',
  model_whitelist JSON DEFAULT NULL COMMENT '允许的模型列表',
  status TINYINT NOT NULL DEFAULT 1 COMMENT '0=禁用 1=启用 2=额度耗尽 3=失效',
  priority INT NOT NULL DEFAULT 100 COMMENT '优先级(越小越优先)',
  weight INT NOT NULL DEFAULT 1 COMMENT '轮询权重',
  daily_limit INT NOT NULL DEFAULT 0 COMMENT '每日上限(0=不限)',
  daily_used INT NOT NULL DEFAULT 0 COMMENT '今日已用',
  total_used INT NOT NULL DEFAULT 0 COMMENT '累计使用',
  total_tokens BIGINT NOT NULL DEFAULT 0 COMMENT '累计token',
  last_used_at DATETIME DEFAULT NULL,
  last_error_at DATETIME DEFAULT NULL,
  last_error TEXT DEFAULT NULL,
  consecutive_errors INT NOT NULL DEFAULT 0 COMMENT '连续错误次数',
  remark VARCHAR(500) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  INDEX idx_provider_status (provider, status),
  INDEX idx_priority (priority, weight)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统API Key加密存储表';
```

**[4] 新增 credits_pricing 表**

```sql
CREATE TABLE IF NOT EXISTS credits_pricing (
  id BIGINT NOT NULL AUTO_INCREMENT,
  provider VARCHAR(50) NOT NULL,
  model_id VARCHAR(100) NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  input_price DECIMAL(10,4) NOT NULL DEFAULT 0.0000 COMMENT '输入价格(积分/千token)',
  output_price DECIMAL(10,4) NOT NULL DEFAULT 0.0000 COMMENT '输出价格(积分/千token)',
  cache_read_price DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  cache_write_price DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
  max_tokens_per_request INT NOT NULL DEFAULT 32000,
  status TINYINT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  description VARCHAR(500) DEFAULT NULL,
  remark VARCHAR(500) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_model_id (model_id),
  INDEX idx_provider_status (provider, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI模型积分定价配置表';
```

**[5] 新增 credits_transaction 表**

```sql
CREATE TABLE IF NOT EXISTS credits_transaction (
  id BIGINT NOT NULL AUTO_INCREMENT,
  transaction_no VARCHAR(64) NOT NULL,
  member_id BIGINT NOT NULL,
  type ENUM('CHAT','RECHARGE','REFUND','REWARD','SYSTEM') NOT NULL,
  status ENUM('PENDING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
  amount INT NOT NULL DEFAULT 0 COMMENT '积分变动量(消耗为负,充值为正,整数)',
  balance_before INT NOT NULL COMMENT '变动前余额',
  balance_after INT DEFAULT NULL COMMENT '变动后余额(PENDING时为null)',
  provider VARCHAR(50) DEFAULT NULL,
  model_id VARCHAR(100) DEFAULT NULL,
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  cache_read_tokens INT DEFAULT 0,
  cache_write_tokens INT DEFAULT 0,
  total_tokens INT DEFAULT 0,
  session_id VARCHAR(100) DEFAULT NULL,
  system_key_id BIGINT DEFAULT NULL,
  request_duration INT DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  remark VARCHAR(500) DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_transaction_no (transaction_no),
  INDEX idx_member_id (member_id),
  INDEX idx_member_type (member_id, type),
  INDEX idx_created_at (created_at),
  INDEX idx_system_key_id (system_key_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI对话算力交易明细表';
```

**[6] 插入默认定价数据**

```sql
INSERT INTO credits_pricing (provider, model_id, model_name, input_price, output_price, cache_read_price, cache_write_price, sort_order, description) VALUES
('anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', 3.0000, 15.0000, 0.3000, 3.7500, 10, '主力模型，性能与成本平衡'),
('anthropic', 'claude-haiku-3.5', 'Claude Haiku 3.5', 1.0000, 5.0000, 0.1000, 1.2500, 20, '轻量高速模型，适合简单对话'),
('openai', 'gpt-4o', 'GPT-4o', 5.0000, 15.0000, 2.5000, 0.0000, 30, '高端多模态模型'),
('openai', 'gpt-4o-mini', 'GPT-4o Mini', 0.5000, 2.0000, 0.2500, 0.0000, 40, '经济实惠的轻量模型'),
('deepseek', 'deepseek-chat', 'DeepSeek V3', 0.5000, 2.0000, 0.1000, 0.0000, 50, '国产高性价比模型');
```

---

# 八、积分扣减伪代码

计算消耗：

```javascript
rawCost = (inputTokens / 1000) * pricing.inputPrice + (outputTokens / 1000) * pricing.outputPrice + (cacheReadTokens / 1000) * pricing.cacheReadPrice + (cacheWriteTokens / 1000) * pricing.cacheWritePrice

cost = Math.max(1, Math.ceil(rawCost))
```

扣减积分（乐观锁）：

```sql
UPDATE member SET points = points - cost WHERE id = memberId AND points >= cost;
```

影响行数 = 0 则重试或拒绝（余额不足）。

---

# 九、影响范围检查清单

## changeType 枚举变更影响

| 涉及代码位置       | 需要调整的内容                          |
|-------------------|---------------------------------------|
| 积分报表筛选下拉框  | 下拉选项新增 AI_CHAT 选项               |
| 积分报表统计逻辑    | 统计逻辑需覆盖 AI_CHAT 新类型            |
| 积分变动列表页面    | 显示文案新增"AI 对话消耗"类型标签         |

## Sequelize 注意事项

- 生产环境：必须手动执行 SQL 迁移脚本
- 开发环境：可用 sync({ alter: true }) 自动同步
- sync.ts 中需要 import 新增的三个模型文件
- index.ts 中需要添加新的关联关系定义

## 不需要改动的现有表

| 表名                    | 说明                                              |
|------------------------|--------------------------------------------------|
| member                 | points 保持 INTEGER，不做任何修改                    |
| points_change_record   | changeAmount / balanceBefore / balanceAfter 保持 INTEGER |
| package                | points 字段已经是 INTEGER，套餐积分为整数              |

---

# 附录 A：定价字段详解

## inputPrice / outputPrice（输入价格 / 输出价格）

AI 大模型的计费是输入和输出分开定价的，因为输出比输入消耗更多算力。

- **inputPrice（输入价格）**：用户发送给 AI 的内容所消耗的积分。包括：用户本次输入的文字、携带的历史对话记录（上下文）、系统提示词（system prompt）。这些合在一起就是"输入 token"。
- **outputPrice（输出价格）**：AI 生成回复所消耗的积分。AI 回复的文字越长，输出 token 越多，消耗越多。通常输出价格是输入价格的 3~5 倍，因为生成内容比读取内容算力消耗更大。

举例：Claude Sonnet 配置 inputPrice=3、outputPrice=15，意思是每 1000 个输入 token 扣 3 积分，每 1000 个输出 token 扣 15 积分。

## cacheReadPrice / cacheWritePrice（缓存读取 / 写入价格）

这是针对 Anthropic Claude 的 Prompt Caching 特性。当对话上下文很长时，Claude 可以缓存之前处理过的上下文，下次对话直接读取缓存而不重新处理，速度更快、成本更低。

- **cacheReadPrice（缓存读取价格）**：命中缓存时，读取已缓存内容的价格。通常只有输入价格的 1/10。
- **cacheWritePrice（缓存写入价格）**：首次写入缓存的价格。通常比普通输入价格略高（约 1.25 倍）。

不支持缓存的模型（如 GPT-4o、DeepSeek）这两个字段设为 0 即可。

## maxTokensPerRequest（单次请求最大 token 数）

限制单次 AI 请求允许的最大输出 token 数，防止用户一次对话消耗过多积分。默认 32000。如果 AI 回复达到此上限会被截断。不同模型可以设置不同的上限。

---

# 附录 B：系统 Key 加密解密算法

## 算法选择：AES-256-GCM

AES-256-GCM 是对称加密算法，同时提供加密（保密性）和认证（完整性校验），是目前工业级最推荐的加密方案。

## 加密流程

```
输入：原始 API Key（如 sk-ant-abc123...）

步骤：
1. 从环境变量读取主密钥 SYSTEM_KEY_SECRET（32 字节 / 256 位）
2. 生成 16 字节随机 IV（crypto.randomBytes(16)）
3. 使用 AES-256-GCM 加密：
   - 密钥 = SYSTEM_KEY_SECRET
   - IV = 上一步生成的随机值
   - 明文 = 原始 API Key
4. 拼接 加密密文 + authTag（16字节认证标签）
5. 整体 Base64 编码

输出：
- encryptedKey = Base64(密文 + authTag)  → 存入数据库
- encryptionIv = Base64(IV)              → 存入数据库
```

## 解密流程

```
输入：数据库中的 encryptedKey + encryptionIv

步骤：
1. 从环境变量读取主密钥 SYSTEM_KEY_SECRET
2. Base64 解码 encryptionIv → 得到 IV
3. Base64 解码 encryptedKey → 分离出 密文 + authTag
4. 使用 AES-256-GCM 解密：
   - 密钥 = SYSTEM_KEY_SECRET
   - IV = 上一步解码的 IV
   - 密文 = 分离出的密文
   - authTag = 分离出的认证标签
5. 解密成功 → 得到原始 API Key

输出：原始 API Key（如 sk-ant-abc123...）→ 存入 server 内存缓存
```

## 参考实现（Node.js）

```typescript
import crypto from 'crypto';

// 主密钥从环境变量获取，32 字节
const SECRET = Buffer.from(process.env.SYSTEM_KEY_SECRET!, 'hex');

/**
 * 加密 API Key
 * @param {string} plainKey - 原始 API Key 明文
 * @returns {{ encryptedKey: string, encryptionIv: string }} 密文和 IV（均为 Base64）
 */
function encryptApiKey(plainKey: string) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', SECRET, iv);
  const encrypted = Buffer.concat([cipher.update(plainKey, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedKey: Buffer.concat([encrypted, authTag]).toString('base64'),
    encryptionIv: iv.toString('base64'),
  };
}

/**
 * 解密 API Key
 * @param {string} encryptedKey - 加密后的密文（Base64）
 * @param {string} encryptionIv - 初始化向量（Base64）
 * @returns {string} 原始 API Key 明文
 */
function decryptApiKey(encryptedKey: string, encryptionIv: string) {
  const iv = Buffer.from(encryptionIv, 'base64');
  const data = Buffer.from(encryptedKey, 'base64');
  const authTag = data.subarray(data.length - 16);
  const encrypted = data.subarray(0, data.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', SECRET, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final('utf8');
}
```

## 安全要点

| 要点                   | 说明                                                    |
|-----------------------|--------------------------------------------------------|
| 主密钥存放位置          | 环境变量 SYSTEM_KEY_SECRET，不入库、不入代码仓库             |
| 每个 Key 独立 IV       | 即使两个相同的 API Key，加密后密文也完全不同                  |
| authTag 认证标签       | 防止密文被篡改，解密时自动校验完整性                          |
| 密文格式               | Base64 编码，方便数据库 TEXT 字段存储                       |
| 解密后缓存策略          | 解密后存入 server 进程内存，不落盘、不存 Redis，进程退出即销毁  |

---

# 附录 C：Token 计算方式说明

## 什么是 Token

Token 是 AI 大模型处理文本的最小单位。不等于字数，也不等于词数。

- 英文：大约 1 个单词 = 1~2 个 token（如 "hello" = 1 token，"unfortunately" = 3 token）
- 中文：大约 1 个汉字 = 1~2 个 token（如 "你好" = 2 token，"人工智能" = 3~4 token）
- 代码 / 标点 / 特殊符号：也会占用 token

粗略估算：中文 1000 字约等于 1500~2000 token。

## 输入 Token 和输出 Token 怎么算

| Token 类型      | 来源                                          | 谁统计的              |
|----------------|-----------------------------------------------|----------------------|
| 输入 token      | 用户发送的消息文字 + 历史对话上下文 + 系统提示词    | AI API 返回值中提供     |
| 输出 token      | AI 生成的回复文字                                | AI API 返回值中提供     |
| 缓存读取 token   | 命中 Prompt Cache 的上下文部分（仅 Claude）       | AI API 返回值中提供     |
| 缓存写入 token   | 首次写入 Cache 的上下文部分（仅 Claude）           | AI API 返回值中提供     |

关键点：**token 数不是我们自己算的，是 AI API 在返回结果时告诉我们的**。

## AI API 返回的 usage 字段

每次 AI 请求完成后，API 响应中都会包含一个 usage 对象，告诉我们本次请求的精确 token 用量。

Anthropic Claude 返回格式：

```json
{
  "usage": {
    "input_tokens": 520,
    "output_tokens": 180,
    "cache_creation_input_tokens": 0,
    "cache_read_input_tokens": 0
  }
}
```

OpenAI GPT 返回格式：

```json
{
  "usage": {
    "prompt_tokens": 520,
    "completion_tokens": 180,
    "total_tokens": 700
  }
}
```

## 完整计费流程

```
用户发送消息"帮我写一首诗"
    │
    ▼
server 将消息 + 历史上下文发给 AI API
    │
    ▼
AI 返回回复内容 + usage 字段
    │  usage: { input_tokens: 520, output_tokens: 180 }
    │
    ▼
server 根据 usage 计算积分消耗
    │  查 credits_pricing 表得到该模型单价
    │  消耗 = (520/1000) × 3 + (180/1000) × 15 = 4.26
    │  实际扣减 = ceil(4.26) = 5 积分
    │
    ▼
扣减会员积分，记录交易明细
```

## 为什么输入 token 不只是用户本次输入的文字

每次对话请求发给 AI 的不只是用户当前这句话，还包括：

| 内容              | 说明                                     | 是否每次都发送 |
|------------------|------------------------------------------|-------------|
| 系统提示词         | 告诉 AI 它的角色和行为规则                   | 是          |
| 历史对话记录       | 之前的对话来回，让 AI 理解上下文               | 是          |
| 用户本次输入       | 用户当前发的消息                             | 是          |

所以一段多轮对话中，随着对话越来越长，输入 token 会越来越多（因为每次都要携带历史），单次消耗的积分也会逐渐增加。这也是为什么 Prompt Caching 很有价值——缓存历史上下文后，后续请求的输入成本可以降低到原来的 1/10。
