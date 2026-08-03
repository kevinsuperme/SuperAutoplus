# HTTP API 参考

所有主后端业务接口统一挂载在 `/api` 下。接口声明来自 `src/api/*.py` 的 FastAPI router。

## 公开接口

当 `APP_PASSWORD` 已配置时，以下接口仍然公开：

| 方法 | 路径                            | 说明                    |
| ---- | ------------------------------- | ----------------------- |
| GET  | `/api/health`                   | 健康检查                |
| GET  | `/api/ready`                    | 就绪检查                |
| GET  | `/api/auth/check`               | 查询是否需要后台密码    |
| POST | `/api/auth/login`               | 后台登录                |
| POST | `/api/sms/pingme/callback`      | PingMe 接码回调         |
| POST | `/api/pix-gpt-plus/client/open` | PXL/PIX 客户自助开通    |
| POST | `/api/luckmail/client/code`     | LuckMail 客户验证码查询 |

## Auth

| 方法 | 路径              | 处理函数     | 说明                                         |
| ---- | ----------------- | ------------ | -------------------------------------------- |
| GET  | `/api/auth/check` | `auth_check` | 返回 `required`，表示是否启用 `APP_PASSWORD` |
| POST | `/api/auth/login` | `auth_login` | 使用密码换取前端 Bearer token                |

## Accounts

| 方法   | 路径                                              | 处理函数                          | 说明                                     |
| ------ | ------------------------------------------------- | --------------------------------- | ---------------------------------------- |
| GET    | `/api/accounts`                                   | `list_accounts`                   | 账号分页列表，支持 platform/status/email |
| POST   | `/api/accounts`                                   | `create_account`                  | 手动创建账号资产                         |
| GET    | `/api/accounts/stats`                             | `get_stats`                       | 账号统计                                 |
| GET    | `/api/accounts/export`                            | `export_accounts`                 | 旧 CSV 导出                              |
| POST   | `/api/accounts/export/json`                       | `export_accounts_json`            | ChatGPT JSON 导出                        |
| POST   | `/api/accounts/export/csv`                        | `export_accounts_csv`             | ChatGPT CSV 导出                         |
| POST   | `/api/accounts/export/sub2api`                    | `export_accounts_sub2api`         | Sub2API 导出                             |
| POST   | `/api/accounts/export/cpa`                        | `export_accounts_cpa`             | CPA 导出                                 |
| POST   | `/api/accounts/export/email-api`                  | `export_accounts_email_api`       | 邮箱 API 文本导出                        |
| POST   | `/api/accounts/export/cockpit`                    | `export_accounts_cockpit`         | Cockpit 导出                             |
| POST   | `/api/accounts/export/kiro-go`                    | `export_accounts_kiro_go`         | Kiro-Go 导出                             |
| POST   | `/api/accounts/export/any2api`                    | `export_accounts_any2api`         | Any2API 导出                             |
| POST   | `/api/accounts/import`                            | `import_accounts`                 | 文本导入账号                             |
| GET    | `/api/accounts/{account_id}`                      | `get_account`                     | 单账号详情                               |
| PATCH  | `/api/accounts/{account_id}`                      | `update_account`                  | 更新账号资产                             |
| DELETE | `/api/accounts/{account_id}`                      | `delete_account`                  | 删除账号                                 |
| POST   | `/api/accounts/phone-bind`                        | `phone_bind_accounts`             | 同步手机号绑定                           |
| POST   | `/api/accounts/ctf-gpt-plus/export-status`        | `mark_ctf_gpt_plus_export_status` | 标记 CTF GPT Plus 导出状态               |
| POST   | `/api/accounts/{account_id}/codex-oauth/start`    | `start_account_codex_oauth`       | 开始 Codex OAuth                         |
| POST   | `/api/accounts/{account_id}/codex-oauth/complete` | `complete_account_codex_oauth`    | 完成 Codex OAuth callback                |

## Account Checks

| 方法 | 路径                               | 处理函数             | 说明               |
| ---- | ---------------------------------- | -------------------- | ------------------ |
| POST | `/api/accounts/check-all`          | `check_all_accounts` | 创建批量检测任务   |
| POST | `/api/accounts/refresh-plan`       | `refresh_plan`       | 刷新计划状态       |
| POST | `/api/accounts/{account_id}/check` | `check_account`      | 创建单账号检测任务 |

## Platform Actions

| 方法 | 路径                                               | 处理函数            | 说明                 |
| ---- | -------------------------------------------------- | ------------------- | -------------------- |
| GET  | `/api/actions/{platform}`                          | `list_actions`      | 平台动作列表         |
| GET  | `/api/actions/{platform}/capabilities`             | `list_capabilities` | 平台能力列表         |
| POST | `/api/actions/{platform}/{account_id}/{action_id}` | `execute_action`    | 对单账号执行平台动作 |

## Tasks

| 方法 | 路径                                       | 处理函数                                    | 说明                              |
| ---- | ------------------------------------------ | ------------------------------------------- | --------------------------------- |
| POST | `/api/tasks/register`                      | `create_register_task`                      | 创建注册任务                      |
| POST | `/api/tasks/phone-bind`                    | `create_phone_bind_task`                    | 创建手机号绑定任务                |
| POST | `/api/tasks/codex-oauth`                   | `create_codex_oauth_task`                   | 创建 Codex OAuth 任务             |
| POST | `/api/tasks/gopay-pay-chatgpt`             | `create_gopay_pay_chatgpt_task`             | 创建 GoPay 付款 ChatGPT Plus 任务 |
| POST | `/api/tasks/idp-team-automation/preflight` | `create_idp_team_automation_preflight_task` | 创建 ITA 预检任务                 |
| POST | `/api/tasks/idp-team-automation/sync`      | `create_idp_team_automation_sync_task`      | 创建 ITA 受控同步任务             |
| POST | `/api/tasks/{task_id}/cancel`              | `cancel_task`                               | 请求取消任务                      |
| GET  | `/api/tasks/{task_id}/logs/stream`         | `stream_logs`                               | SSE 任务日志流                    |
| GET  | `/api/tasks`                               | `list_tasks`                                | 任务列表                          |
| GET  | `/api/tasks/{task_id}`                     | `get_task`                                  | 单任务详情                        |
| GET  | `/api/tasks/{task_id}/events`              | `list_task_events`                          | 任务事件列表                      |
| GET  | `/api/tasks/logs`                          | `list_task_logs`                            | 历史任务日志                      |

`/api/tasks/register` 请求体（`RegisterTaskRequest`）：

| 字段             | 类型        | 默认       | 说明                                       |
| ---------------- | ----------- | ---------- | ------------------------------------------ |
| `platform`       | `str`       | 必填       | 平台 key，如 `chatgpt`                     |
| `email`          | `str\|null` | `null`     | 指定邮箱，通常由 mailbox provider 自动分配 |
| `password`       | `str\|null` | `null`     | 指定密码，不填时平台按需生成               |
| `count`          | `int`       | `1`        | 注册数量                                   |
| `concurrency`    | `int`       | `1`        | 任务内部并发                               |
| `proxy`          | `str\|null` | `null`     | 显式代理                                   |
| `executor_type`  | `str`       | `protocol` | `protocol` / `headless` / `headed`         |
| `captcha_solver` | `str`       | `auto`     | `auto` 或指定 captcha provider key         |
| `extra`          | `dict`      | `{}`       | 平台扩展参数                               |

`/api/tasks/gopay-pay-chatgpt` 请求体（`GoPayPayChatGptTaskRequest`）：

| 字段                                                   | 类型        | 默认              | 说明                                                                 |
| ------------------------------------------------------ | ----------- | ----------------- | -------------------------------------------------------------------- |
| `chatgpt_account_ids`                                  | `list[int]` | `[]`              | 要付款的 ChatGPT 账号 id 列表；留空且填 `register_count` 时先注册    |
| `register_count`                                       | `int`       | `0`               | 未选账号时先注册 N 个 ChatGPT 账号再付款                             |
| `gopay_account_id`                                     | `int`       | `0`               | 指定 GoPay 付款账号；留空按 `gopay_source` 策略自动选/注册           |
| `gopay_source`                                         | `str`       | `auto`            | `auto`（先用池后注册）/ `pool`（只用池）/ `register`（强制注册）     |
| `country` / `currency`                                 | `str`       | `ID` / `IDR`      | Stripe 地区与币种                                                    |
| `checkout_mode`                                        | `str`       | `camoufox_headed` | 浏览器后端：`camoufox_headed` / `camoufox_headless` / `bitbrowser_*` |
| `bit_profile_id`                                       | `str`       | `""`              | BitBrowser profile ID（`bitbrowser_*` 模式下必填）                   |
| `headless`                                             | `bool`      | `false`           | 浏览器无头（建议 false 让用户看见进度）                              |
| `cashier_url_override`                                 | `str`       | `""`              | 跳过 generate_plus_link 协议步骤                                     |
| `midtrans_url_override`                                | `str`       | `""`              | 跳过浏览器抓 URL 步骤                                                |
| `envelope_url`                                         | `str`       | `""`              | 付款前先领红包补 GoPay 余额                                          |
| `concurrency`                                          | `int`       | `1`               | 多账号并发数                                                         |
| `grab_timeout`                                         | `int`       | `300`             | 浏览器等用户跳到 Midtrans 的最大秒数                                 |
| `phone_ttl_seconds`                                    | `int`       | `1200`            | 手机号租期秒数                                                       |
| `auto_register_gopay`                                  | `bool`      | `true`            | 无可用 GoPay 号时自动注册                                            |
| `gopay_pin`                                            | `str`       | `147258`          | GoPay PIN 默认值                                                     |
| `sms_provider`                                         | `str`       | `herosms`         | GoPay 注册接码渠道：`herosms` / `smspool` / `smsbower` / `smsapi`    |
| `smspool_api_key`                                      | `str`       | `""`              | SMSPool API key（覆盖环境变量）                                      |
| `smsbower_api_key`                                     | `str`       | `""`              | SMSBower API key（覆盖环境变量）                                     |
| `herosms_api_key`                                      | `str`       | `""`              | HeroSMS API key（覆盖环境变量 `OPAI_HEROSMS_API_KEY`）               |
| `smsapi_url` / `smsapi_phone`                          | `str`       | `""`              | 固定手机号 + 查最新短信 API 渠道                                     |
| `max_price`                                            | `str`       | `""`              | 拿号价格上限（USD），空串走插件默认（0.11）                          |
| `auto_rebind`                                          | `bool`      | `false`           | 付款成功后自动换绑（买临时外国号绑上去）                             |
| `rebind_provider`                                      | `str`       | `herosms`         | 换绑专用接码渠道                                                     |
| `rebind_sms_key` / `rebind_country` / `rebind_service` | `str`       | `""`              | 换绑渠道参数                                                         |
| `use_stripe_init`                                      | `bool`      | `false`           | 用 Stripe payment_pages/init 协议生成 cashier_url                    |
| `use_short_link`                                       | `bool`      | `false`           | 短链模式（checkout_ui_mode=custom）                                  |
| `capture_payment`                                      | `bool`      | `false`           | 调试抓包：停在付款页不跑协议付款                                     |
| `capture_dir`                                          | `str`       | `""`              | 抓包产物目录；留空用 `_gopay_capture/<时间戳>/`                      |
| `proxy`                                                | `str\|null` | `null`            | 显式代理                                                             |
| `register_extra`                                       | `dict`      | `{}`              | 先注册 ChatGPT 时的 extra 参数                                       |

`/api/tasks/phone-bind` 请求体（`PhoneBindTaskRequest`）：

| 字段             | 类型        | 默认              | 说明                  |
| ---------------- | ----------- | ----------------- | --------------------- |
| `platform`       | `str`       | `chatgpt`         | 平台                  |
| `ids`            | `list[int]` | `[]`              | 主账号 id 列表        |
| `fallback_ids`   | `list[int]` | `[]`              | 备选账号 id           |
| `phone_lines`    | `str`       | 必填              | 手机号文本，每行一条  |
| `browser_mode`   | `str`       | `camoufox_headed` | 浏览器模式            |
| `bit_profile_id` | `str`       | `""`              | BitBrowser profile ID |
| `concurrency`    | `int`       | `1`               | 并发数                |

`/api/tasks/codex-oauth` 请求体（`CodexOAuthTaskRequest`）：

| 字段             | 类型        | 默认              | 说明                  |
| ---------------- | ----------- | ----------------- | --------------------- |
| `platform`       | `str`       | `chatgpt`         | 平台                  |
| `account_id`     | `int`       | `0`               | 单账号 id             |
| `ids`            | `list[int]` | `[]`              | 批量账号 id           |
| `browser_mode`   | `str`       | `camoufox_headed` | 浏览器模式            |
| `bit_profile_id` | `str`       | `""`              | BitBrowser profile ID |
| `concurrency`    | `int`       | `1`               | 并发数                |

`/api/tasks/idp-team-automation/preflight` 请求体（`IdpTeamAutomationPreflightTaskRequest`）：

| 字段        | 类型   | 默认   | 说明              |
| ----------- | ------ | ------ | ----------------- |
| `run_tests` | `bool` | `true` | 是否执行 `pytest` |

`/api/tasks/idp-team-automation/sync` 请求体（`IdpTeamAutomationSyncTaskRequest`）：

| 字段             | 类型        | 默认    | 说明                               |
| ---------------- | ----------- | ------- | ---------------------------------- |
| `account_ids`    | `list[int]` | `[]`    | 受控同步的账号 id 列表；为空则全量 |
| `export_sub2api` | `bool`      | `true`  | 是否导出 sub2api 产物              |
| `export_any2api` | `bool`      | `true`  | 是否导出 any2api 产物              |
| `push_sub2api`   | `bool`      | `false` | 是否推送 sub2api 产物到上游        |

`/api/tasks/{task_id}/cancel` 与 `GET /api/tasks/{task_id}/logs/stream`、`GET /api/tasks`、`GET /api/tasks/{task_id}`、`GET /api/tasks/{task_id}/events`、`GET /api/tasks/logs` 均无请求体；`list_tasks` 支持 query 参数 `platform`、`status`、`page`、`page_size`，`list_task_events` 支持 `since`、`limit`，`list_task_logs` 支持 `platform`、`page`、`page_size`。

## Provider

| 方法   | 路径                                        | 处理函数                     | 说明                                  |
| ------ | ------------------------------------------- | ---------------------------- | ------------------------------------- |
| GET    | `/api/provider-definitions`                 | `list_provider_definitions`  | Provider 定义列表                     |
| GET    | `/api/provider-definitions/drivers`         | `list_provider_drivers`      | 已注册 Provider driver                |
| PUT    | `/api/provider-definitions`                 | `save_provider_definition`   | 保存 Provider 定义                    |
| POST   | `/api/provider-definitions`                 | `create_provider_definition` | 创建 Provider 定义                    |
| DELETE | `/api/provider-definitions/{definition_id}` | `delete_provider_definition` | 删除 Provider 定义                    |
| GET    | `/api/provider-settings`                    | `list_provider_settings`     | Provider 设置列表，需 `provider_type` |
| PUT    | `/api/provider-settings`                    | `save_provider_setting`      | 保存 Provider 设置                    |
| POST   | `/api/provider-settings`                    | `create_provider_setting`    | 创建 Provider 设置                    |
| DELETE | `/api/provider-settings/{setting_id}`       | `delete_provider_setting`    | 删除 Provider 设置                    |
| POST   | `/api/provider-settings/test`               | `test_provider`              | Provider 在线测试                     |

## Platforms

| 方法   | 路径                                      | 处理函数                       | 说明             |
| ------ | ----------------------------------------- | ------------------------------ | ---------------- |
| GET    | `/api/platforms`                          | `list_platforms`               | 平台列表和能力   |
| GET    | `/api/platforms/{platform}/desktop-state` | `get_desktop_state`            | 桌面应用状态     |
| PUT    | `/api/platforms/{name}/capabilities`      | `update_platform_capabilities` | 保存平台能力覆盖 |
| DELETE | `/api/platforms/{name}/capabilities`      | `reset_platform_capabilities`  | 重置平台能力覆盖 |

## PXL / PIX GPT Plus

| 方法 | 路径                            | 处理函数          | 说明                                     |
| ---- | ------------------------------- | ----------------- | ---------------------------------------- |
| POST | `/api/pix-gpt-plus/generate`    | `generate_pix`    | 后台批量选择 ChatGPT 账号生成 PIX        |
| POST | `/api/pix-gpt-plus/client/open` | `open_pix_client` | 公开客户页根据 CKD 和客户 token 生成 PIX |

`/api/pix-gpt-plus/generate` 请求体（`PixGptPlusGenerateRequest`）：

| 字段                  | 类型        | 默认                | 说明                               |
| --------------------- | ----------- | ------------------- | ---------------------------------- |
| `chatgpt_account_ids` | `list[int]` | `[]`                | 要生成 PIX 的 ChatGPT 账号 id 列表 |
| `promo_id`            | `str`       | `plus-1-month-free` | 促销 ID                            |
| `api_mode`            | `str`       | `short`             | `short` / `business` / `long`      |
| `concurrency`         | `int`       | `1`                 | 并发数                             |

`/api/pix-gpt-plus/client/open` 请求体（`PixGptPlusClientOpenRequest`）：

| 字段         | 类型  | 默认 | 说明                                |
| ------------ | ----- | ---- | ----------------------------------- |
| `ckd`        | `str` | `""` | 客户授权码，需匹配服务端配置        |
| `credential` | `str` | `""` | access token 或 session json 字符串 |
| `email`      | `str` | `""` | 可选，客户邮箱                      |

```json
{
  "ckd": "CUSTOMER-CODE",
  "credential": "access token 或 session json"
}
```

常见状态：

- `success`
- `ckd_not_configured`
- `invalid_ckd`
- `missing_credential`
- `invalid_credential`
- `missing_token`
- `invalid_api_mode`
- `remote_error`
- `remote_failed`

## LuckMail Client

| 方法 | 路径                        | 处理函数                   | 说明               |
| ---- | --------------------------- | -------------------------- | ------------------ |
| POST | `/api/luckmail/client/code` | `get_luckmail_client_code` | 公开客户验证码查询 |

请求：

```json
{
  "ticket": "user@example.com----tok_example"
}
```

也支持只提交：

```json
{
  "ticket": "tok_example"
}
```

服务会调用 LuckMail 已购邮箱 token 查询接口：

```text
/api/v1/openapi/email/token/{token}/code
```

常见状态：

- `missing_ticket`
- `invalid_ticket_format`
- `invalid_email`
- `missing_token`
- `remote_error`
- `code_not_ready`
- `success`

## SMS

| 方法 | 路径                             | 处理函数                | 说明              |
| ---- | -------------------------------- | ----------------------- | ----------------- |
| GET  | `/api/sms/herosms/countries`     | `herosms_countries`     | HeroSMS 国家列表  |
| GET  | `/api/sms/herosms/services`      | `herosms_services`      | HeroSMS 服务列表  |
| POST | `/api/sms/herosms/balance`       | `herosms_balance`       | HeroSMS 余额      |
| POST | `/api/sms/herosms/prices`        | `herosms_prices`        | HeroSMS 价格      |
| POST | `/api/sms/herosms/top-countries` | `herosms_top_countries` | HeroSMS 推荐国家  |
| POST | `/api/sms/herosms/best-country`  | `herosms_best_country`  | HeroSMS 最优国家  |
| GET  | `/api/sms/smsbower/countries`    | `smsbower_countries`    | SMSBower 国家列表 |
| GET  | `/api/sms/smsbower/services`     | `smsbower_services`     | SMSBower 服务列表 |
| POST | `/api/sms/smsbower/balance`      | `smsbower_balance`      | SMSBower 余额     |
| POST | `/api/sms/smsbower/prices`       | `smsbower_prices`       | SMSBower 价格     |
| POST | `/api/sms/pingme/callback`       | `pingme_callback`       | PingMe 回调       |

## SMS Pool

| 方法   | 路径                              | 处理函数           | 说明           |
| ------ | --------------------------------- | ------------------ | -------------- |
| GET    | `/api/sms-pool/blacklist`         | `list_blacklist`   | 黑名单列表     |
| POST   | `/api/sms-pool/blacklist`         | `add_blacklist`    | 添加黑名单号码 |
| DELETE | `/api/sms-pool/blacklist/{phone}` | `remove_blacklist` | 移除单个号码   |
| DELETE | `/api/sms-pool/blacklist`         | `clear_blacklist`  | 清空黑名单     |

## Proxies

| 方法   | 路径                             | 处理函数              | 说明          |
| ------ | -------------------------------- | --------------------- | ------------- |
| GET    | `/api/proxies`                   | `list_proxies`        | 代理列表      |
| POST   | `/api/proxies`                   | `create_proxy`        | 创建代理      |
| POST   | `/api/proxies/bulk`              | `bulk_create_proxies` | 批量创建代理  |
| DELETE | `/api/proxies/{proxy_id}`        | `delete_proxy`        | 删除代理      |
| PATCH  | `/api/proxies/{proxy_id}/toggle` | `toggle_proxy`        | 启用/禁用代理 |
| POST   | `/api/proxies/check`             | `check_proxies`       | 检测代理      |

## Stats

| 方法 | 路径                     | 处理函数            | 说明       |
| ---- | ------------------------ | ------------------- | ---------- |
| GET  | `/api/stats/overview`    | `stats_overview`    | 总览统计   |
| GET  | `/api/stats/by-platform` | `stats_by_platform` | 按平台统计 |
| GET  | `/api/stats/by-day`      | `stats_by_day`      | 按日期统计 |
| GET  | `/api/stats/by-proxy`    | `stats_by_proxy`    | 按代理统计 |
| GET  | `/api/stats/errors`      | `stats_errors`      | 错误聚合   |

## System

| 方法 | 路径                  | 处理函数         | 说明        |
| ---- | --------------------- | ---------------- | ----------- |
| GET  | `/api/solver/status`  | `solver_status`  | Solver 状态 |
| POST | `/api/solver/restart` | `solver_restart` | 重启 Solver |
| GET  | `/api/version`        | `get_version`    | 版本信息    |

## Config / BitBrowser / Lifecycle

| 方法   | 路径                                    | 处理函数                 | 说明                    |
| ------ | --------------------------------------- | ------------------------ | ----------------------- |
| GET    | `/api/config`                           | `get_config`             | 全局配置                |
| GET    | `/api/config/options`                   | `get_config_options`     | 配置选项                |
| PUT    | `/api/config`                           | `update_config`          | 更新配置                |
| GET    | `/api/bitbrowser/profiles`              | `list_profiles`          | BitBrowser profile 列表 |
| POST   | `/api/bitbrowser/profiles`              | `add_profile`            | 添加 profile            |
| DELETE | `/api/bitbrowser/profiles/{profile_id}` | `remove_profile`         | 删除 profile            |
| PUT    | `/api/bitbrowser/profiles`              | `replace_profiles`       | 覆盖 profile 列表       |
| POST   | `/api/lifecycle/check`                  | `trigger_validity_check` | 触发有效性检查          |
| POST   | `/api/lifecycle/refresh`                | `trigger_token_refresh`  | 触发 token 刷新         |
| POST   | `/api/lifecycle/warn`                   | `trigger_expiry_warning` | 触发过期预警            |
| GET    | `/api/lifecycle/status`                 | `lifecycle_status`       | 生命周期状态            |

## IDP Team Automation

| 方法 | 路径                                           | 处理函数                                        | 说明                                        |
| ---- | ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| GET  | `/api/idp-team-automation/status`              | `get_idp_team_automation_status`                | 获取 ITA 仓库状态和受管账号统计             |
| GET  | `/api/idp-team-automation/accounts`            | `get_idp_team_automation_accounts`              | 获取受管账号列表                            |
| GET  | `/api/idp-team-automation/history`             | `get_idp_team_automation_history`               | 获取受控同步历史                            |
| GET  | `/api/idp-team-automation/policy`              | `get_idp_team_automation_policy`                | 获取定时同步策略                            |
| PUT  | `/api/idp-team-automation/policy`              | `put_idp_team_automation_policy`                | 保存定时同步策略                            |
| POST | `/api/idp-team-automation/authorized-import`   | `import_idp_team_automation_authorized_payload` | 导入 callback URL 或 token JSON             |
| GET  | `/api/idp-team-automation/artifacts/{task_id}` | `download_idp_team_automation_artifact`         | 下载某次同步生成的工件（query: `filename`） |

`PUT /api/idp-team-automation/policy` 请求体（`SyncPolicyRequest`）：

| 字段               | 类型   | 默认          | 说明                                   |
| ------------------ | ------ | ------------- | -------------------------------------- |
| `enabled`          | `bool` | 必填          | 是否启用定时同步                       |
| `interval_minutes` | `int`  | `60`          | 同步间隔（分钟）                       |
| `export_sub2api`   | `bool` | `true`        | 是否导出 sub2api 产物                  |
| `export_any2api`   | `bool` | `false`       | 是否导出 any2api 产物                  |
| `push_sub2api`     | `bool` | `false`       | 是否推送 sub2api 产物到上游            |
| `scope`            | `str`  | `all_managed` | 同步范围：`all_managed` 或指定账号集合 |

`POST /api/idp-team-automation/authorized-import` 请求体（`AuthorizedImportRequest`）：

| 字段           | 类型  | 默认 | 说明                            |
| -------------- | ----- | ---- | ------------------------------- |
| `email`        | `str` | 必填 | 关联账号邮箱                    |
| `password`     | `str` | `""` | 关联账号密码                    |
| `payload_text` | `str` | 必填 | callback URL 或 token JSON 原文 |
| `account_id`   | `int` | `0`  | 关联已有账号 id；0 表示新建     |

## 使用示例

以下示例假定后端运行在 `http://127.0.0.1:8000`。启用 `APP_PASSWORD` 时，除公开接口外，需在请求头携带登录后获取的 Bearer token：`Authorization: Bearer <token>`。

### 健康检查（公开）

```bash
curl -sS http://127.0.0.1:8000/api/health
curl -sS http://127.0.0.1:8000/api/ready
```

### 后台登录获取 token

```bash
curl -sS -H "Content-Type: application/json" \
  -d '{"password":"your-app-password"}' \
  http://127.0.0.1:8000/api/auth/login
```

### 创建注册任务

```bash
curl -sS -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "platform": "chatgpt",
    "count": 3,
    "concurrency": 2,
    "executor_type": "protocol",
    "captcha_solver": "auto"
  }' \
  http://127.0.0.1:8000/api/tasks/register
```

### 创建手机号绑定任务

```bash
curl -sS -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "platform": "chatgpt",
    "ids": [12, 13],
    "phone_lines": "+6281234567890\n+6281234567891",
    "browser_mode": "camoufox_headed",
    "concurrency": 1
  }' \
  http://127.0.0.1:8000/api/tasks/phone-bind
```

### 创建 Codex OAuth 任务

```bash
curl -sS -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "platform": "chatgpt",
    "ids": [12, 13],
    "browser_mode": "camoufox_headed",
    "concurrency": 2
  }' \
  http://127.0.0.1:8000/api/tasks/codex-oauth
```

### 创建 GoPay 付款 ChatGPT Plus 任务

```bash
curl -sS -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "chatgpt_account_ids": [12, 13],
    "gopay_source": "auto",
    "country": "ID",
    "currency": "IDR",
    "checkout_mode": "camoufox_headed",
    "headless": false,
    "sms_provider": "herosms",
    "auto_register_gopay": true,
    "gopay_pin": "147258",
    "concurrency": 1
  }' \
  http://127.0.0.1:8000/api/tasks/gopay-pay-chatgpt
```

### 跟踪任务日志（SSE）

```bash
curl -N -H "Authorization: Bearer <token>" \
  "http://127.0.0.1:8000/api/tasks/<task_id>/logs/stream?since=0"
```

### 取消任务

```bash
curl -sS -X POST -H "Authorization: Bearer <token>" \
  http://127.0.0.1:8000/api/tasks/<task_id>/cancel
```

### 列出与查询任务

```bash
curl -sS -H "Authorization: Bearer <token>" \
  "http://127.0.0.1:8000/api/tasks?platform=chatgpt&status=success&page=1&page_size=50"

curl -sS -H "Authorization: Bearer <token>" \
  "http://127.0.0.1:8000/api/tasks/<task_id>/events?since=0&limit=200"
```

### PXL 客户自助开通（公开）

```bash
curl -sS -H "Content-Type: application/json" \
  -d '{
    "ckd": "CUSTOMER-CODE",
    "credential": "access token 或 session json",
    "email": "customer@example.com"
  }' \
  http://127.0.0.1:8000/api/pix-gpt-plus/client/open
```

### LuckMail 客户验证码查询（公开）

```bash
curl -sS -H "Content-Type: application/json" \
  -d '{"ticket": "user@example.com----tok_example"}' \
  http://127.0.0.1:8000/api/luckmail/client/code
```

### 保存 ITA 同步策略

```bash
curl -sS -X PUT -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "enabled": true,
    "interval_minutes": 60,
    "export_sub2api": true,
    "export_any2api": false,
    "push_sub2api": false,
    "scope": "all_managed"
  }' \
  http://127.0.0.1:8000/api/idp-team-automation/policy
```

### 创建 ITA 受控同步任务

```bash
curl -sS -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "account_ids": [12, 13],
    "export_sub2api": true,
    "export_any2api": true,
    "push_sub2api": false
  }' \
  http://127.0.0.1:8000/api/tasks/idp-team-automation/sync
```
