# 数据模型

数据库模型定义在 `src/core/db.py`，使用 SQLModel + SQLite。默认数据库 URL：

```text
sqlite:///account_manager.db
```

可通过环境变量覆盖：

```text
ACCOUNT_MANAGER_DATABASE_URL
```

Docker 默认使用：

```text
sqlite:////app/data/account_manager.db
```

## 表结构

| 表 | SQLModel | 责任 |
| --- | --- | --- |
| `accounts` | `AccountModel` | 平台账号主表，保存 platform/email/password/user_id |
| `account_overviews` | `AccountOverviewModel` | 生命周期状态、有效性、套餐状态、展示状态和摘要 JSON |
| `account_credentials` | `AccountCredentialModel` | 账号凭据图，按 scope/provider/key 保存 token、secret、cookie 等 |
| `provider_accounts` | `ProviderAccountModel` | 邮箱/短信/外部 Provider 账号资产 |
| `provider_resources` | `ProviderResourceModel` | Provider 资源，如邮箱订单、手机号、外部资源句柄 |
| `provider_definitions` | `ProviderDefinitionModel` | 内置或自定义 Provider 定义、字段和认证模式 |
| `provider_settings` | `ProviderSettingModel` | Provider 运行时配置、auth、默认启用状态 |
| `platform_capability_overrides` | `PlatformCapabilityOverrideModel` | 平台能力覆盖，按平台唯一 |
| `task_logs` | `TaskLog` | 历史任务摘要日志 |
| `tasks` | `TaskModel` | 持久化任务状态、payload/result、进度和统计 |
| `task_events` | `TaskEventModel` | 任务事件/SSE 日志 |
| `proxies` | `ProxyModel` | 静态代理池、成功失败计数和启用状态 |
| `sms_pool_blacklist` | `SmsPoolBlacklistModel` | 接码号码池黑名单 |

## 账号资产图

`accounts` 是账号主记录，扩展资产通过以下表补充：

- `account_overviews`: 汇总展示状态。
- `account_credentials`: 平台 token、refresh token、cookie、cashier url 等凭据。
- `provider_accounts`: 与 Provider 账号相关的登录标识和元数据。
- `provider_resources`: Provider 分配出的资源，如 LuckMail 订单号、邮箱地址、短信号码。

`core.db.save_account()` 会：

1. 按 `platform + email` 查找现有账号。
2. 存在则更新 password/user_id/updated_at。
3. 不存在则创建账号。
4. 调用 `core.account_graph.sync_platform_account_graph()` 同步账号资产图。

## Provider 配置模型

`provider_definitions` 存内置定义和 UI 字段描述。

唯一约束：

```text
provider_type + provider_key
```

`provider_settings` 存运行时配置。

唯一约束：

```text
provider_type + provider_key
```

字段分层：

- `config_json`: 服务地址、默认选项、轮询间隔等非密字段。
- `auth_json`: API Key、Token、密码等认证字段。
- `metadata_json`: 运行时补充信息。

## 任务模型

`TaskModel` 字段：

- `id`: `task_<timestamp>_<uuid6>`。
- `type`: 任务类型。
- `platform`: 平台。
- `status`: 当前状态。
- `payload_json`: 任务输入。
- `result_json`: 任务输出，默认 `{"errors": [], "cashier_urls": [], "data": None}`。
- `progress_current`, `progress_total`
- `success_count`, `error_count`
- `error`
- `started_at`, `finished_at`, `created_at`, `updated_at`

`TaskEventModel` 保存任务过程日志：

- `task_id`
- `type`: 默认 `log`，也可为状态事件。
- `level`: `info`, `warning`, `error` 等。
- `message`
- `detail_json`

## 初始化与迁移

`init_db()` 负责创建表和兼容旧数据结构，当前代码包含：

- legacy accounts schema 迁移到账户图。
- Provider key/auth_mode 迁移。
- Provider definitions seed。
- 清理空 Provider settings 和非真实 generic_http 数据。

迁移逻辑在 `src/core/db.py` 内部集中维护，项目当前没有单独 Alembic 迁移目录。
