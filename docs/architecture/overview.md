# 系统架构总览

## 架构边界

项目由五个主要运行单元组成：

| 单元 | 路径 | 责任 |
| --- | --- | --- |
| 主后端 | `main.py`, `api/`, `application/`, `core/`, `infrastructure/`, `domain/` | FastAPI API、任务编排、平台注册、Provider 配置、账号资产和统计 |
| Web 前端 | `frontend/` | React 管理后台和公开客户页面 |
| Electron 桌面壳 | `electron/` | 打包后端可执行文件并通过 Electron 启动桌面客户端 |
| 客户门户 API | `customer_portal_api/` | 独立 C 端/管理端后端，复用主项目注册内核和账号/任务能力 |
| GoPay 协议工具 | `gopay-auto-protocol/`, `platforms/gopay-deploy/` | GoPay 协议注册、付款、部署 worker 和调试工具 |

## 主应用启动链路

`main.py` 是主应用唯一入口。

启动顺序：

1. 强制 stdout/stderr 使用 UTF-8，避免 Windows 中文环境遇到特殊字符崩溃。
2. `core.server_guard.guard_duplicate_start()` 防止重复启动。
3. FastAPI lifespan 执行：
   - `core.db.init_db()`
   - `core.registry.load_all()`
   - `providers.registry.load_all()`
   - 启动 `core.scheduler.scheduler`
   - 启动 `services.task_runtime.task_runtime`
   - 启动 `services.solver_manager.start_async()`
   - 启动 `core.lifecycle.lifecycle_manager`
4. 注册 AuthMiddleware、CORS 和所有 `/api` 路由。
5. 若存在 `static/`，挂载 `/assets` 并用 SPA fallback 服务前端页面。

关闭顺序：

1. 停止生命周期管理器。
2. 停止调度器。
3. 停止任务运行时。
4. 停止 Solver 管理器。

## 分层结构

| 层 | 目录 | 说明 |
| --- | --- | --- |
| API Adapter | `api/` | FastAPI 路由、Pydantic 请求模型、HTTP 错误转换 |
| Application | `application/` | 业务用例和服务编排，如账号、任务、Provider、PXL、LuckMail |
| Domain | `domain/` | 领域 DTO/Command/Query，隔离接口数据结构 |
| Infrastructure | `infrastructure/` | SQLModel repository、runtime adapter、配置读取、统计查询 |
| Core | `core/` | 数据库模型、平台基类、注册流、Provider 基类、调度、认证、生命周期、Solver |
| Platform Plugins | `platforms/` | 每个平台的注册/校验/动作能力 |
| Provider Plugins | `providers/` | mailbox/captcha/sms/proxy 驱动注册与工厂 |

## 请求流

典型后台请求：

```text
React 页面
  -> frontend/src/lib/utils.ts apiFetch()
  -> /api/... FastAPI route
  -> application service
  -> infrastructure repository / core runtime / platform provider
  -> SQLite 或远端平台/API
```

典型注册任务：

```text
POST /api/tasks/register
  -> TaskCommandsService
  -> application.tasks.create_register_task()
  -> TaskModel pending
  -> services.task_runtime.TaskRuntime claim
  -> application.tasks.execute_task()
  -> core.registry.get(platform)
  -> BasePlatform.register()
  -> ProtocolMailboxFlow / ProtocolOAuthFlow / BrowserRegistrationFlow
  -> save_account() + account graph sync
```

典型公开客户请求：

```text
/pxl-plus 或 /luckmail-code
  -> AppContent 在登录判断前渲染公开页面
  -> fetch('/api/.../client/...')
  -> AuthMiddleware 公共前缀放行
  -> application service 返回脱敏响应
```

## 安全边界

- `APP_PASSWORD` 非空时，`AuthMiddleware` 保护所有 `/api/*`，但以下前缀公开：
  - `/api/health`
  - `/api/ready`
  - `/api/auth/`
  - `/api/sms/pingme/callback`
  - `/api/pix-gpt-plus/client/`
  - `/api/luckmail/client/`
- `/pxl-plus` 依赖 CKD 校验，不依赖后台登录。
- `/luckmail-code` 只接受客户提供的 token 查询验证码，不创建邮箱订单，不返回远端原始异常。
- 文档和代码不得提交真实 token、API Key、Cookie、Session JSON、HAR 或本地数据库。
