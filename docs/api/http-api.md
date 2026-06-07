# HTTP API 参考

所有主后端业务接口统一挂载在 `/api` 下。接口声明来自 `src/api/*.py` 的 FastAPI router。

## 公开接口

当 `APP_PASSWORD` 已配置时，以下接口仍然公开：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/ready` | 就绪检查 |
| GET | `/api/auth/check` | 查询是否需要后台密码 |
| POST | `/api/auth/login` | 后台登录 |
| POST | `/api/sms/pingme/callback` | PingMe 接码回调 |
| POST | `/api/pix-gpt-plus/client/open` | PXL/PIX 客户自助开通 |
| POST | `/api/luckmail/client/code` | LuckMail 客户验证码查询 |

## Auth

| 方法 | 路径 | 处理函数 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/auth/check` | `auth_check` | 返回 `required`，表示是否启用 `APP_PASSWORD` |
| POST | `/api/auth/login` | `auth_login` | 使用密码换取前端 Bearer token |

## Accounts

| 方法 | 路径 | 处理函数 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/accounts` | `list_accounts` | 账号分页列表，支持 platform/status/email |
| POST | `/api/accounts` | `create_account` | 手动创建账号资产 |
| GET | `/api/accounts/stats` | `get_stats` | 账号统计 |
| GET | `/api/accounts/export` | `export_accounts` | 旧 CSV 导出 |
| POST | `/api/accounts/export/json` | `export_accounts_json` | ChatGPT JSON 导出 |
| POST | `/api/accounts/export/csv` | `export_accounts_csv` | ChatGPT CSV 导出 |
| POST | `/api/accounts/export/sub2api` | `export_accounts_sub2api` | Sub2API 导出 |
| POST | `/api/accounts/export/cpa` | `export_accounts_cpa` | CPA 导出 |
| POST | `/api/accounts/export/email-api` | `export_accounts_email_api` | 邮箱 API 文本导出 |
| POST | `/api/accounts/export/cockpit` | `export_accounts_cockpit` | Cockpit 导出 |
| POST | `/api/accounts/export/kiro-go` | `export_accounts_kiro_go` | Kiro-Go 导出 |
| POST | `/api/accounts/export/any2api` | `export_accounts_any2api` | Any2API 导出 |
| POST | `/api/accounts/import` | `import_accounts` | 文本导入账号 |
| GET | `/api/accounts/{account_id}` | `get_account` | 单账号详情 |
| PATCH | `/api/accounts/{account_id}` | `update_account` | 更新账号资产 |
| DELETE | `/api/accounts/{account_id}` | `delete_account` | 删除账号 |
| POST | `/api/accounts/phone-bind` | `phone_bind_accounts` | 同步手机号绑定 |
| POST | `/api/accounts/ctf-gpt-plus/export-status` | `mark_ctf_gpt_plus_export_status` | 标记 CTF GPT Plus 导出状态 |
| POST | `/api/accounts/{account_id}/codex-oauth/start` | `start_account_codex_oauth` | 开始 Codex OAuth |
| POST | `/api/accounts/{account_id}/codex-oauth/complete` | `complete_account_codex_oauth` | 完成 Codex OAuth callback |

## Account Checks

| 方法 | 路径 | 处理函数 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/accounts/check-all` | `check_all_accounts` | 创建批量检测任务 |
| POST | `/api/accounts/refresh-plan` | `refresh_plan` | 刷新计划状态 |
| POST | `/api/accounts/{account_id}/check` | `check_account` | 创建单账号检测任务 |

## Platform Actions

| 方法 | 路径 | 处理函数 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/actions/{platform}` | `list_actions` | 平台动作列表 |
| GET | `/api/actions/{platform}/capabilities` | `list_capabilities` | 平台能力列表 |
| POST | `/api/actions/{platform}/{account_id}/{action_id}` | `execute_action` | 对单账号执行平台动作 |

## Tasks

| 方法 | 路径 | 处理函数 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/tasks/register` | `create_register_task` | 创建注册任务 |
| POST | `/api/tasks/phone-bind` | `create_phone_bind_task` | 创建手机号绑定任务 |
| POST | `/api/tasks/codex-oauth` | `create_codex_oauth_task` | 创建 Codex OAuth 任务 |
| POST | `/api/tasks/gopay-pay-chatgpt` | `create_gopay_pay_chatgpt_task` | 创建 GoPay 付款 ChatGPT Plus 任务 |
| POST | `/api/tasks/{task_id}/cancel` | `cancel_task` | 请求取消任务 |
| GET | `/api/tasks/{task_id}/logs/stream` | `stream_logs` | SSE 任务日志流 |
| GET | `/api/tasks` | `list_tasks` | 任务列表 |
| GET | `/api/tasks/{task_id}` | `get_task` | 单任务详情 |
| GET | `/api/tasks/{task_id}/events` | `list_task_events` | 任务事件列表 |
| GET | `/api/tasks/logs` | `list_task_logs` | 历史任务日志 |

## Provider

| 方法 | 路径 | 处理函数 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/provider-definitions` | `list_provider_definitions` | Provider 定义列表 |
| GET | `/api/provider-definitions/drivers` | `list_provider_drivers` | 已注册 Provider driver |
| PUT | `/api/provider-definitions` | `save_provider_definition` | 保存 Provider 定义 |
| POST | `/api/provider-definitions` | `create_provider_definition` | 创建 Provider 定义 |
| DELETE | `/api/provider-definitions/{definition_id}` | `delete_provider_definition` | 删除 Provider 定义 |
| GET | `/api/provider-settings` | `list_provider_settings` | Provider 设置列表，需 `provider_type` |
| PUT | `/api/provider-settings` | `save_provider_setting` | 保存 Provider 设置 |
| POST | `/api/provider-settings` | `create_provider_setting` | 创建 Provider 设置 |
| DELETE | `/api/provider-settings/{setting_id}` | `delete_provider_setting` | 删除 Provider 设置 |
| POST | `/api/provider-settings/test` | `test_provider` | Provider 在线测试 |

## Platforms

| 方法 | 路径 | 处理函数 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/platforms` | `list_platforms` | 平台列表和能力 |
| GET | `/api/platforms/{platform}/desktop-state` | `get_desktop_state` | 桌面应用状态 |
| PUT | `/api/platforms/{name}/capabilities` | `update_platform_capabilities` | 保存平台能力覆盖 |
| DELETE | `/api/platforms/{name}/capabilities` | `reset_platform_capabilities` | 重置平台能力覆盖 |

## PXL / PIX GPT Plus

| 方法 | 路径 | 处理函数 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/pix-gpt-plus/generate` | `generate_pix` | 后台批量选择 ChatGPT 账号生成 PIX |
| POST | `/api/pix-gpt-plus/client/open` | `open_pix_client` | 公开客户页根据 CKD 和客户 token 生成 PIX |

`/api/pix-gpt-plus/client/open` 请求：

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

| 方法 | 路径 | 处理函数 | 说明 |
| --- | --- | --- | --- |
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

| 方法 | 路径 | 处理函数 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/sms/herosms/countries` | `herosms_countries` | HeroSMS 国家列表 |
| GET | `/api/sms/herosms/services` | `herosms_services` | HeroSMS 服务列表 |
| POST | `/api/sms/herosms/balance` | `herosms_balance` | HeroSMS 余额 |
| POST | `/api/sms/herosms/prices` | `herosms_prices` | HeroSMS 价格 |
| POST | `/api/sms/herosms/top-countries` | `herosms_top_countries` | HeroSMS 推荐国家 |
| POST | `/api/sms/herosms/best-country` | `herosms_best_country` | HeroSMS 最优国家 |
| GET | `/api/sms/smsbower/countries` | `smsbower_countries` | SMSBower 国家列表 |
| GET | `/api/sms/smsbower/services` | `smsbower_services` | SMSBower 服务列表 |
| POST | `/api/sms/smsbower/balance` | `smsbower_balance` | SMSBower 余额 |
| POST | `/api/sms/smsbower/prices` | `smsbower_prices` | SMSBower 价格 |
| POST | `/api/sms/pingme/callback` | `pingme_callback` | PingMe 回调 |

## SMS Pool

| 方法 | 路径 | 处理函数 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/sms-pool/blacklist` | `list_blacklist` | 黑名单列表 |
| POST | `/api/sms-pool/blacklist` | `add_blacklist` | 添加黑名单号码 |
| DELETE | `/api/sms-pool/blacklist/{phone}` | `remove_blacklist` | 移除单个号码 |
| DELETE | `/api/sms-pool/blacklist` | `clear_blacklist` | 清空黑名单 |

## Proxies

| 方法 | 路径 | 处理函数 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/proxies` | `list_proxies` | 代理列表 |
| POST | `/api/proxies` | `create_proxy` | 创建代理 |
| POST | `/api/proxies/bulk` | `bulk_create_proxies` | 批量创建代理 |
| DELETE | `/api/proxies/{proxy_id}` | `delete_proxy` | 删除代理 |
| PATCH | `/api/proxies/{proxy_id}/toggle` | `toggle_proxy` | 启用/禁用代理 |
| POST | `/api/proxies/check` | `check_proxies` | 检测代理 |

## Stats

| 方法 | 路径 | 处理函数 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/stats/overview` | `stats_overview` | 总览统计 |
| GET | `/api/stats/by-platform` | `stats_by_platform` | 按平台统计 |
| GET | `/api/stats/by-day` | `stats_by_day` | 按日期统计 |
| GET | `/api/stats/by-proxy` | `stats_by_proxy` | 按代理统计 |
| GET | `/api/stats/errors` | `stats_errors` | 错误聚合 |

## System

| 方法 | 路径 | 处理函数 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/solver/status` | `solver_status` | Solver 状态 |
| POST | `/api/solver/restart` | `solver_restart` | 重启 Solver |
| GET | `/api/version` | `get_version` | 版本信息 |

## Config / BitBrowser / Lifecycle

| 方法 | 路径 | 处理函数 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/config` | `get_config` | 全局配置 |
| GET | `/api/config/options` | `get_config_options` | 配置选项 |
| PUT | `/api/config` | `update_config` | 更新配置 |
| GET | `/api/bitbrowser/profiles` | `list_profiles` | BitBrowser profile 列表 |
| POST | `/api/bitbrowser/profiles` | `add_profile` | 添加 profile |
| DELETE | `/api/bitbrowser/profiles/{profile_id}` | `remove_profile` | 删除 profile |
| PUT | `/api/bitbrowser/profiles` | `replace_profiles` | 覆盖 profile 列表 |
| POST | `/api/lifecycle/check` | `trigger_validity_check` | 触发有效性检查 |
| POST | `/api/lifecycle/refresh` | `trigger_token_refresh` | 触发 token 刷新 |
| POST | `/api/lifecycle/warn` | `trigger_expiry_warning` | 触发过期预警 |
| GET | `/api/lifecycle/status` | `lifecycle_status` | 生命周期状态 |
