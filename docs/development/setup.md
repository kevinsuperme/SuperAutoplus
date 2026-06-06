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

## 代码组织约定

- 新 HTTP 路由放在 `api/`，只做请求模型和服务调用。
- 业务逻辑放在 `application/`。
- 新数据访问逻辑放在 `infrastructure/` repository。
- 新平台能力放在 `platforms/<name>/plugin.py` 和相关 worker/core 文件。
- 新 Provider 驱动放在 `providers/<type>/` 并注册到 `providers.registry`。
- 新 Provider UI 定义要同步更新 `infrastructure/provider_definitions_repository.py`。
- 新公开页面要同时更新：
  - `frontend/src/lib/public-routes.ts`
  - `frontend/src/App.tsx`
  - `core/auth.py` 的公开 API 前缀
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

`electron/build-backend.sh` 使用 PyInstaller 把 `main.py` 打包为 `electron/backend/backend/backend`，并把 `platforms`, `core`, `api`, `services`, `providers`, `application`, `infrastructure`, `domain`, `static` 等资源加入包内。

## Customer Portal API

独立入口：

```bash
python -m uvicorn customer_portal_api.main:app --host 0.0.0.0 --port 8100
```

该服务有自己的 `customer_portal_api/README.md`，复用主项目的注册内核、平台元数据、任务运行时、账号资产、代理和系统能力。
