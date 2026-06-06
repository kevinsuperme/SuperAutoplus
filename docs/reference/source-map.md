# 源码结构索引

## 根目录

| 路径 | 说明 |
| --- | --- |
| `main.py` | 主 FastAPI 应用入口、生命周期、路由注册、SPA fallback |
| `requirements.txt` | 后端依赖 |
| `pytest.ini` | pytest 配置 |
| `Dockerfile` | 主应用 Docker 镜像 |
| `docker-compose.yml` | 主应用 Docker Compose |
| `docker-entrypoint.sh` | Docker 启动脚本 |
| `README.md` | 项目介绍 |
| `SECURITY.md`, `CONTRIBUTING.md`, `OPEN_SOURCE_RELEASE.md` | 项目安全、贡献和开源说明 |

## 主后端

| 路径 | 说明 |
| --- | --- |
| `api/` | FastAPI 路由适配层 |
| `application/` | 业务用例与服务编排 |
| `domain/` | DTO、Command、Query、领域模型 |
| `infrastructure/` | Repository、配置、runtime adapter |
| `core/` | 数据库、认证、注册流、Provider/Platform 基类、生命周期、Scheduler、Solver、账号图 |
| `core/registration/` | 浏览器、协议邮箱、协议 OAuth 注册流和 adapter 类型 |
| `core/executors/` | 协议和 Playwright 执行器 |
| `services/` | 任务运行时和 Solver 管理器 |
| `services/turnstile_solver/` | 本地 Turnstile Solver 子服务 |

## 平台插件

| 路径 | 说明 |
| --- | --- |
| `platforms/chatgpt/` | ChatGPT 注册、OAuth、Token 刷新、付款链接、PayPal/Stripe/CPA 上传 |
| `platforms/cursor/` | Cursor 注册、OAuth、桌面切换、状态查询 |
| `platforms/kiro/` | Kiro 注册、OAuth、token 刷新、桌面切换 |
| `platforms/windsurf/` | Windsurf 注册、Trial 检查、链接生成、桌面切换 |
| `platforms/gopay/` | GoPay 协议账号和付款能力 |
| `platforms/anything/` | 通用适配器 |
| `platforms/blink/` | Blink.new |
| `platforms/cerebras/` | Cerebras |
| `platforms/grok/` | Grok |
| `platforms/openblocklabs/` | OpenBlockLabs |
| `platforms/tavily/` | Tavily |
| `platforms/trae/` | Trae.ai |
| `platforms/gopay-deploy/` | GoPay 部署 worker |

## Provider

| 路径 | 说明 |
| --- | --- |
| `providers/registry.py` | Provider 注册表与工厂 |
| `providers/mailbox/` | 邮箱 Provider 包装层 |
| `providers/captcha/` | 验证码 Provider |
| `providers/sms/` | 接码 Provider |
| `providers/proxy/` | 代理 Provider |
| `core/base_mailbox.py` | Mailbox 基类和多种邮箱实现注册 |
| `core/luckmail_mailbox.py` | LuckMail API Provider |
| `core/outlook_email_mailbox.py` | outlookEmail Provider |
| `core/local_ms_mailbox.py` | 本地微软邮箱池 |
| `core/pingme_sms.py` | PingMe 接码实现 |

## 前端

| 路径 | 说明 |
| --- | --- |
| `frontend/src/App.tsx` | 路由、登录判断、后台壳、公开页面入口 |
| `frontend/src/pages/` | 页面组件 |
| `frontend/src/components/` | UI 和业务组件 |
| `frontend/src/lib/` | API helper、任务 helper、i18n、公开路由、配置选项 |
| `frontend/src/index.css` | 全局样式和设计变量 |
| `frontend/vite.config.ts` | Vite 配置 |

重点页面：

| 页面 | 路径 |
| --- | --- |
| Dashboard | `frontend/src/pages/Dashboard.tsx` |
| Accounts | `frontend/src/pages/Accounts.tsx` |
| Register | `frontend/src/pages/Register.tsx` |
| Settings | `frontend/src/pages/SettingsPage.tsx` |
| Task History | `frontend/src/pages/TaskHistory.tsx` |
| PIX 后台批量 | `frontend/src/pages/PixGptPlus.tsx` |
| PXL 客户页 | `frontend/src/pages/PxlPlusClient.tsx` |
| LuckMail 客户页 | `frontend/src/pages/LuckMailCodeClient.tsx` |

## Electron

| 路径 | 说明 |
| --- | --- |
| `electron/main.js` | Electron 主进程 |
| `electron/build-backend.sh` | PyInstaller 打包后端 |
| `electron/electron-builder.yml` | electron-builder 配置 |
| `electron/package.json` | Electron 脚本和依赖 |

## Customer Portal API

| 路径 | 说明 |
| --- | --- |
| `customer_portal_api/main.py` | 独立 FastAPI 入口 |
| `customer_portal_api/app/routers/` | auth/app/admin/payment 路由 |
| `customer_portal_api/app/services/` | 门户服务 |
| `customer_portal_api/app/models.py` | 门户模型 |
| `customer_portal_api/app/db.py` | 门户数据库初始化 |
| `customer_portal_api/README.md` | 门户 API 文档 |

## 测试

| 路径 | 说明 |
| --- | --- |
| `tests/conftest.py` | pytest fixtures |
| `tests/test_api_*.py` | API 层测试 |
| `tests/test_*provider*.py` | Provider 测试 |
| `tests/test_gopay_*.py` | GoPay 测试 |
| `tests/test_luckmail_mailbox.py` | LuckMail Provider 测试 |
| `tests/test_api_luckmail_client.py` | LuckMail 公开客户接口测试 |
| `tests/test_api_pix_gpt_plus.py` | PIX/PXL 接口测试 |

## 工具与调试

| 路径 | 说明 |
| --- | --- |
| `tools/` | HAR 捕获、分析、任务尾随等工具 |
| `scripts/smoke.py` | smoke 脚本 |
| `assets/screenshots/` | README 截图资源 |
| `gopay-auto-protocol/` | GoPay 协议实验、抓包和工具代码 |
