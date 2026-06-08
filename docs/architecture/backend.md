# 后端架构

## FastAPI 应用

主后端应用定义在 `main.py`：

- 应用名：`Account Manager`
- 版本：`2.0.0`
- 所有业务路由统一通过 `app.include_router(..., prefix="/api")` 挂载。
- 静态前端构建产物位于 `static/`，存在时：
  - `/assets` 挂载为静态资源目录。
  - 其他非 API 路径返回 `static/index.html`，用于 React SPA 路由。

## 路由模块

`src/api/` 只做 HTTP 适配，不直接承载复杂业务逻辑。

| 模块 | 前缀 | 责任 |
| --- | --- | --- |
| `api.accounts` | `/api/accounts` | 账号 CRUD、导入导出、Codex OAuth、Phone bind 直连能力 |
| `api.account_checks` | `/api/accounts` | 单账号/批量有效性检测、计划刷新 |
| `api.actions` | `/api/actions` | 平台能力动作列表和执行 |
| `api.auth` | `/api/auth` | 密码保护状态和登录 |
| `api.bitbrowser_profiles` | `/api/bitbrowser/profiles` | BitBrowser profile 池配置 |
| `api.config` | `/api/config` | 全局配置读写和选项 |
| `api.health` | `/api/health`, `/api/ready` | 健康检查和就绪检查 |
| `api.idp_team_automation` | `/api/idp-team-automation` | ITA 仓库状态、受管账号、同步历史、策略和工件下载 |
| `api.lifecycle` | `/api/lifecycle` | 生命周期检查、刷新、预警触发 |
| `api.luckmail_client` | `/api/luckmail/client/code` | LuckMail 公开客户验证码查询 |
| `api.pix_gpt_plus` | `/api/pix-gpt-plus` | 后台 PIX 批量生成和公开 PXL 客户开通 |
| `api.platforms` | `/api/platforms` | 平台列表和桌面状态 |
| `api.platform_capabilities` | `/api/platforms/{name}/capabilities` | 平台能力覆盖保存/重置 |
| `api.provider_definitions` | `/api/provider-definitions` | Provider 定义 CRUD 和驱动列表 |
| `api.provider_settings` | `/api/provider-settings` | Provider 设置 CRUD 和在线测试 |
| `api.proxies` | `/api/proxies` | 代理池 CRUD、批量导入、检测 |
| `api.sms` | `/api/sms` | HeroSMS/SMSBower 查询、PingMe callback |
| `api.sms_pool` | `/api/sms-pool` | 接码号码池黑名单 |
| `api.stats` | `/api/stats` | 成功率、平台、日期、代理和错误统计 |
| `api.system` | `/api/solver`, `/api/version` | Solver 状态、重启和版本 |
| `api.tasks` | `/api/tasks` | 任务查询和事件列表 |
| `api.task_commands` | `/api/tasks` | 任务创建、取消和 SSE 日志 |
| `api.task_logs` | `/api/tasks/logs` | 历史任务日志 |

## Application 服务

`src/application/` 是业务编排层：

- `accounts.py`, `account_exports.py`, `account_checks.py`: 账号资产展示、更新、导出和检测。
- `tasks.py`, `task_commands.py`, `tasks_query.py`: 持久化任务创建、claim、执行、日志、取消和查询。
- `pix_gpt_plus.py`: Nerver PIX 调用、后台批量模式、公开 CKD 客户模式。
- `idp_team_automation.py`: ITA safe mode 集成、授权导入、受控同步、同步历史和定时策略。
- `luckmail_client.py`: 客户粘贴文本解析、LuckMail token 查询和脱敏响应。
- `ctf_plus.py`: CTF Plus 账号按需注册、域名绑定和用户管理。
- `gopay_pay_chatgpt.py`: GoPay 协议付款 ChatGPT Plus 批量支付。
- `provider_definitions.py`, `provider_settings.py`: Provider 定义和运行时设置。
- `platforms.py`, `platform_capabilities.py`: 平台清单和能力覆盖。
- `proxies.py`, `phone_binding.py`, `system.py`, `health.py`: 代理、手机号绑定、系统状态和健康状态。
- `config.py`, `bitbrowser_profiles.py`, `actions.py`: 全局配置选项、BitBrowser 浏览器 profile 配置、平台能力动作。

## 任务运行时

`src/services/task_runtime.py` 提供单进程持久化任务调度：

- 默认 `max_parallel_tasks=3`。
- 默认 `max_parallel_per_platform=1`。
- 每 0.5 秒轮询可执行任务。
- 启动时调用 `mark_incomplete_tasks_interrupted()`，把上次异常退出遗留任务标记为 interrupted。
- `claim_next_runnable_task()` 会考虑同平台并发限制和同账号互斥。
- 每个任务由独立 daemon worker 线程执行 `application.tasks.execute_task(task_id)`。

当前任务类型定义在 `application.tasks`：

- `register`
- `account_check`
- `account_check_all`
- `platform_action`
- `phone_bind`
- `codex_oauth`
- `gopay_pay_chatgpt`
- `idp_team_automation_preflight`
- `idp_team_automation_sync`

任务状态：

- `pending`, `claimed`, `running`
- `succeeded`, `failed`, `interrupted`
- `cancel_requested`, `cancelled`

终态集合为 `succeeded`, `failed`, `interrupted`, `cancelled`。

## 认证与公开接口

`src/core/auth.py` 使用简单 Bearer token/COOKIE 密码保护：

- 环境变量 `APP_PASSWORD` 为空时不要求登录。
- 非空时，后台 API 请求需携带 `Authorization: Bearer <APP_PASSWORD>` 或 `_auth=<APP_PASSWORD>` cookie。
- 公开 API 前缀由 `_PUBLIC_PREFIXES` 声明。

公开客户接口必须自己完成业务授权：

- `/api/pix-gpt-plus/client/open` 使用 CKD 授权码。
- `/api/luckmail/client/code` 只根据客户提交的 LuckMail 邮箱 token 查询，不暴露后台管理能力。

## Solver 和生命周期

- `services.solver_manager` 管理本地 Turnstile Solver 子进程，端口默认由配置决定，Docker 暴露 `8889`。
- `src/services/turnstile_solver/` 包含基于 Quart/patchright/Camoufox 的 Solver 子服务。
- `core.lifecycle.lifecycle_manager` 在主应用启动时运行，用于账号有效性检测、token 刷新和过期预警。
- `core.scheduler.scheduler` 在启动时运行，为定时任务和后台检查提供基础调度能力。
