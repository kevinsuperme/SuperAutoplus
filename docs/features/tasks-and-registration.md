# 任务与注册流程

## 注册任务入口

后台注册任务通过：

```text
POST /api/tasks/register
```

请求模型定义在 `api/task_commands.py` 的 `RegisterTaskRequest`：

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `platform` | 必填 | 平台 key，如 `chatgpt` |
| `email` | `None` | 指定邮箱，通常由 mailbox provider 自动分配 |
| `password` | `None` | 指定密码，不填时平台按需生成 |
| `count` | `1` | 注册数量 |
| `concurrency` | `1` | 任务内部并发 |
| `proxy` | `None` | 显式代理 |
| `executor_type` | `protocol` | `protocol`, `headless`, `headed` |
| `captcha_solver` | `auto` | `auto` 或指定 captcha provider key |
| `extra` | `{}` | 平台扩展参数 |

任务创建后写入 `tasks` 表，等待 `TaskRuntime` claim 执行。

## 任务执行链路

```text
TaskRuntime
  -> claim_next_runnable_task()
  -> execute_task(task_id)
  -> _execute_register_task()
  -> _build_platform_instance()
  -> BasePlatform.register()
  -> RegistrationFlow
  -> save_account()
  -> TaskEventModel / TaskLog
```

`TaskRuntime` 默认限制：

- 全局最多 3 个任务并发。
- 同一平台最多 1 个任务并发。
- 同一账号相关任务互斥，避免同时刷新/切换/付款。

## 注册流选择

`BasePlatform.register()` 根据执行器和身份模式选择：

| 条件 | 注册流 |
| --- | --- |
| `executor_type` 为 `headless` 或 `headed` | `BrowserRegistrationFlow` |
| identity provider 为 `oauth_browser` | `ProtocolOAuthFlow` 或浏览器 OAuth runner |
| 其他 | `ProtocolMailboxFlow` |

注册流能力：

- 邮箱 OTP 回调。
- 邮件验证链接回调。
- Captcha solver。
- 手机号回调和清理函数。
- OAuth 浏览器复用检测。
- 平台 adapter 的 preflight 校验。

## Provider 选择

注册任务会根据平台配置和 Provider settings 构造运行时依赖：

- mailbox: 生成/读取邮箱，等待 OTP 或验证链接。
- captcha: 云端或本地 Solver。
- sms: 注册或绑定手机号时拿号/收码。
- proxy: 静态代理池、API 提取代理或旋转网关。

Provider 运行时配置由 `ProviderSettingsRepository.resolve_runtime_settings()` 合并数据库设置、默认定义和显式 extra。

## 账号保存

注册完成后，平台返回 `core.base_platform.Account`：

- `platform`
- `email`
- `password`
- `user_id`
- `region`
- `token`
- `status`
- `trial_end_time`
- `extra`

`core.db.save_account()` 会把主账号写入 `accounts`，并同步账号图到：

- `account_overviews`
- `account_credentials`
- `provider_accounts`
- `provider_resources`

## 平台动作任务

平台动作入口：

```text
POST /api/actions/{platform}/{account_id}/{action_id}
```

也可创建持久化任务：

```text
POST /api/tasks/... 
```

平台动作由 `BasePlatform.execute_action()` 分发。标准 capability 包括：

- `query_state`
- `refresh_token`
- `generate_link`
- `switch_desktop`
- `upload_cpa`
- `upload_tm`
- `check_trial`
- `generate_link_browser`
- `create_api_key`

平台可覆盖 `_handle_<capability>` 或 `execute_action()` 实现具体能力。

## GoPay 付款 ChatGPT Plus

入口：

```text
POST /api/tasks/gopay-pay-chatgpt
```

请求模型 `GoPayPayChatGptTaskRequest` 支持：

- 选择已有 ChatGPT 账号或先注册新账号。
- 指定或自动选择 GoPay 账号。
- `cashier_url_override` / `midtrans_url_override` 跳过部分流程。
- Camoufox/BitBrowser checkout 模式。
- 自动注册 GoPay。
- HeroSMS、SMSBower、SMS API 等 OTP 渠道。
- GoPay 号来源：`auto`, `pool`, `register`。
- 可选付款后自动换绑。
- 抓包调试模式。
- Stripe init 或短链模式。

执行逻辑在 `application/tasks.py` 和 `application/gopay_pay_chatgpt.py`，GoPay 协议工具位于 `platforms/gopay/`、`gopay-auto-protocol/` 和 `platforms/gopay-deploy/`。

## 任务日志

任务过程日志写入 `task_events`，前端通过：

```text
GET /api/tasks/{task_id}/logs/stream
```

读取 SSE 日志流。

历史摘要写入 `task_logs`，通过：

```text
GET /api/tasks/logs
```

查询。
