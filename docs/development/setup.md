# 开发指南

## 环境要求

- Python 3.11+
- Node.js 18+
- Windows、macOS 或 Linux

后端依赖在 `requirements.txt`，前端依赖在 `frontend/package.json`。

## 后端安装

Windows PowerShell：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

macOS / Linux：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

浏览器相关能力需要额外安装：

```bash
python -m playwright install chromium
python -m camoufox fetch
```

## 前端安装

```bash
cd frontend
npm install
```

开发模式：

```bash
npm run dev
```

生产构建：

```bash
npm run build
```

## 启动主后端

```bash
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

或：

```bash
python main.py
```

访问：

```text
http://127.0.0.1:8000
```

开发时可以让 Vite 运行在 `http://127.0.0.1:5173`，API 默认转发到 `/api`。

## 关键环境变量

| 变量 | 说明 |
| --- | --- |
| `ACCOUNT_MANAGER_DATABASE_URL` | SQLite/SQLModel 数据库 URL |
| `APP_PASSWORD` | 后台访问密码；为空时后台 API 不加锁 |
| `PIX_CLIENT_CKD_CODES` | `/pxl-plus` 客户 CKD 授权码列表 |
| `NERVER_API_BASE_URL` | Nerver API base URL |
| `NERVER_API_TIMEOUT` | Nerver API 超时秒 |
| `NERVER_PIX_SHORT_TOKEN` | Nerver short PIX Bearer token |
| `NERVER_PIX_BUSINESS_TOKEN` | Nerver business PIX Bearer token |
| `VITE_API_BASE` | 前端构建/开发时 API base，默认 `/api` |
| `VNC_PASSWORD` | Docker noVNC 密码 |

Provider API Key 推荐通过 Web UI 写入 `provider_settings`，不要提交到仓库。

## 项目架构与代码组织

项目采用分层架构（API → Application → Domain → Infrastructure），后端源码位于 `src/`，运行时导入名保持 `api.*`、`application.*`、`core.*` 等。

### 分层说明

| 层 | 目录 | 职责 |
| --- | --- | --- |
| API 适配 | `src/api/` | HTTP 路由，只做请求模型验证和服务调用，不承载复杂业务逻辑 |
| 业务编排 | `src/application/` | 业务流程、多步骤编排、跨服务调用 |
| 领域模型 | `src/domain/` | 纯数据类：`AccountRecord`、`TaskSummary`、`ProxyRecord`、`PlatformAction` 等 |
| 数据访问 | `src/infrastructure/` | Repository 模式：`AccountsRepository`、`TasksReadRepository`、`ProxiesRepository` 等 |

### `src/api/` 路由模块

| 模块 | 说明 |
| --- | --- |
| `api.accounts` | 账号 CRUD、导入导出、OAuth callback、Phone bind |
| `api.account_checks` | 单账号/批量有效性检测、计划刷新 |
| `api.actions` | 平台能力动作列表和执行 |
| `api.auth` | 密码保护状态和登录 |
| `api.bitbrowser_profiles` | BitBrowser profile 池配置 |
| `api.config` | 全局配置读写和选项 |
| `api.health` | 健康检查和就绪检查 |
| `api.lifecycle` | 生命周期检查、刷新、预警触发 |
| `api.luckmail_client` | LuckMail 公开客户验证码查询 |
| `api.pix_gpt_plus` | 后台 PIX 批量生成和公开 PXL 客户开通 |
| `api.platforms` | 平台列表和桌面状态 |
| `api.platform_capabilities` | 平台能力覆盖保存/重置 |
| `api.provider_definitions` | Provider 定义 CRUD 和驱动列表 |
| `api.provider_settings` | Provider 设置 CRUD 和在线测试 |
| `api.proxies` | 代理池 CRUD、批量导入、检测 |
| `api.sms` | HeroSMS/SMSBower 查询、PingMe callback |
| `api.sms_pool` | 接码号码池黑名单 |
| `api.stats` | 成功率、平台、日期、代理和错误统计 |
| `api.system` | Solver 状态、重启和版本 |
| `api.tasks` | 任务查询和事件列表 |
| `api.task_commands` | 任务创建、取消和 SSE 日志 |
| `api.task_logs` | 历史任务日志 |

### `src/application/` 业务服务

| 模块 | 说明 |
| --- | --- |
| `accounts.py` | 账号资产展示、更新 |
| `account_exports.py` | 账号导出 |
| `account_checks.py` | 账号有效性检测 |
| `actions.py` | 平台能力动作执行 |
| `bitbrowser_profiles.py` | BitBrowser 浏览器 profile 配置 |
| `config.py` | 全局配置选项 |
| `ctf_plus.py` | CTF Plus 账号按需注册、域名绑定和用户管理 |
| `gopay_pay_chatgpt.py` | GoPay 协议付款 ChatGPT Plus 批量支付 |
| `health.py` | 系统健康状态 |
| `luckmail_client.py` | 客户粘贴文本解析、LuckMail token 查询和脱敏响应 |
| `phone_binding.py` | 手机号绑定 |
| `pix_gpt_plus.py` | Nerver PIX 调用、后台批量模式、公开 CKD 客户模式 |
| `platforms.py` | 平台清单和桌面状态 |
| `platform_capabilities.py` | 平台能力覆盖 |
| `provider_definitions.py` | Provider 定义管理 |
| `provider_settings.py` | Provider 运行时设置 |
| `proxies.py` | 代理池管理 |
| `system.py` | 系统状态 |
| `tasks.py` | 任务持久化创建和执行 |
| `task_commands.py` | 任务命令（创建、取消、claim） |
| `tasks_query.py` | 任务查询 |
| `task_logs.py` | 任务日志 |

### `src/core/` 核心共享模块

`src/core/` 是跨层共享的基础设施，不依赖 `src/api/`、`src/application/`、`src/infrastructure/` 或 `src/domain/`。

**数据库与模型：**

| 模块 | 说明 |
| --- | --- |
| `db.py` | SQLModel 数据库模型（`AccountModel`、`TaskModel` 等）、初始化、迁移 |
| `account_graph.py` | 账户图数据模型：序列化、合并、同步、状态统计 |

**平台与 Provider 体系：**

| 模块 | 说明 |
| --- | --- |
| `registry.py` | 平台插件注册中心：自动发现、加载、管理平台插件 |
| `base_platform.py` | 平台基类：定义注册、OAuth、能力等标准接口 |
| `base_mailbox.py` | 邮箱基类：定义邮箱适配器接口 |
| `base_sms.py` | 短信基类：定义接码适配器接口 |
| `base_captcha.py` | 验证码基类：定义打码适配器接口 |
| `base_executor.py` | 执行器基类：定义浏览器/协议执行器接口 |
| `base_identity.py` | 身份基类：定义身份提供者接口 |
| `capability_registry.py` | 能力注册表：`CapabilityDefinition` 和 `CapabilityRegistry` |
| `provider_drivers.py` | Provider 驱动定义和元数据 |

**注册流程（`src/core/registration/`）：**

| 模块 | 说明 |
| --- | --- |
| `flows.py` | 注册流程编排：`RegistrationFlow` 标准流程 |
| `adapters.py` | 注册适配器：不同平台的自定义注册逻辑 |
| `errors.py` | 注册异常定义 |
| `helpers.py` | 注册辅助函数 |
| `models.py` | 注册数据模型 |

**执行器（`src/core/executors/`）：**

| 模块 | 说明 |
| --- | --- |
| `playwright.py` | Playwright 浏览器自动化执行器 |
| `protocol.py` | 协议级 HTTP 执行器 |

**邮箱与短信：**

| 模块 | 说明 |
| --- | --- |
| `luckmail_mailbox.py` | LuckMail 邮箱适配器 |
| `outlook_email_mailbox.py` | Outlook 邮箱适配器 |
| `local_ms_mailbox.py` | 本地微软邮箱池适配器 |
| `generic_http_mailbox.py` | 通用 HTTP 邮箱适配器 |
| `pingme_sms.py` | PingMe 接码适配器 |

**OAuth 与认证：**

| 模块 | 说明 |
| --- | --- |
| `auth.py` | 认证中间件：`APP_PASSWORD` 保护、公开前缀白名单 |
| `oauth_browser.py` | OAuth 浏览器流程 |
| `manual_oauth_browser.py` | 手动 OAuth 浏览器流程 |

**工具与基础设施：**

| 模块 | 说明 |
| --- | --- |
| `config_store.py` | 全局配置键值存储（`ConfigStore`） |
| `lifecycle.py` | 生命周期管理器：账号有效性检测、token 刷新、过期预警 |
| `scheduler.py` | 后台调度器：定时任务和周期检查 |
| `server_guard.py` | 服务守护：防止重复启动、优雅关闭 |
| `version.py` | 版本信息 |
| `http_client.py` | HTTP 客户端封装 |
| `proxy_pool.py` | 代理池管理 |
| `proxy_providers.py` | 代理供应商适配 |
| `any2api_sync.py` | Any2API 同步工具 |
| `tls.py` | TLS 配置 |
| `datetime_utils.py` | 日期时间工具函数 |
| `desktop_apps.py` | 桌面应用管理 |
| `platform_accounts.py` | 平台账号管理 |
| `account_display.py` | 账号展示格式化 |

### `src/services/` 服务层

| 模块 | 说明 |
| --- | --- |
| `task_runtime.py` | 单进程持久化任务调度器（`TaskRuntime`）：并发控制、任务 claim、worker 线程管理 |
| `solver_manager.py` | Turnstile Solver 子进程管理 |
| `turnstile_solver/` | 基于 Quart/patchright/Camoufox 的 Turnstile Solver 子服务 |

### `docs/archives/gopay-protocol-research/` 协议实验归档

GoPay 协议逆向实验、抓包分析、工具代码和部署方案的历史归档。运行中的 GoPay worker 代码位于 `src/platforms/gopay-deploy/`；归档资料独立于主项目运行，不参与主后端构建。

### `scripts/` 和 `tests/`

| 目录 | 说明 |
| --- | --- |
| `scripts/smoke.py` | 启动后 smoke 验证脚本 |
| `tests/` | pytest 测试：`test_api_*.py` 覆盖 API 模块，`test_any2api_sync.py` 等覆盖核心工具 |

### 开发约定

- 新 HTTP 路由放在 `src/api/`，只做请求模型和服务调用。
- 业务逻辑放在 `src/application/`。
- 新领域模型放在 `src/domain/`。
- 新数据访问逻辑放在 `src/infrastructure/` repository。
- 新平台能力放在 `src/platforms/<name>/plugin.py` 和相关 worker/core 文件。
- 新 Provider 驱动放在 `src/providers/<type>/` 并注册到 `providers.registry`。
- 新 Provider UI 定义要同步更新 `infrastructure/provider_definitions_repository.py`。
- 新公开页面要同时更新：
  - `frontend/src/lib/public-routes.ts`
  - `frontend/src/App.tsx`
  - `src/core/auth.py` 的公开 API 前缀
  - `docs/features/public-client-pages.md`

## 本地常用验证

后端重点测试：

```bash
python -m pytest tests/test_api_health.py tests/test_api_platforms.py -q
python -m pytest tests/test_luckmail_mailbox.py tests/test_api_luckmail_client.py -q
python -m pytest tests/test_api_pix_gpt_plus.py -q
```

前端构建：

```bash
cd frontend
npm run build
```

接口 smoke：

```bash
python -m uvicorn main:app --host 127.0.0.1 --port 8000
curl http://127.0.0.1:8000/api/health
curl http://127.0.0.1:8000/api/ready
```

## Electron 开发

Electron 目录：

```text
electron/
```

脚本：

```bash
cd electron
npm install
npm run dev
npm run build:backend
npm run build:win
npm run build:mac
npm run build:linux
```

`electron/build-backend.mjs` 使用 PyInstaller 把 `main.py` 打包为 `electron/backend/backend/backend`，通过 `--paths src` 发现 Python 包，并把 `src/platforms`, `src/core`, `src/api`, `src/services`, `src/providers`, `src/application`, `src/infrastructure`, `src/domain`, `static` 等资源加入包内。

## Customer Portal API

独立入口：

```bash
PYTHONPATH=src python -m uvicorn customer_portal_api.main:app --host 0.0.0.0 --port 8100
```

该服务有自己的 `src/customer_portal_api/README.md`，复用主项目的注册内核、平台元数据、任务运行时、账号资产、代理和系统能力。
