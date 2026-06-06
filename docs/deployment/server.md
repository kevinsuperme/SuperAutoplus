# 服务器与 Docker 部署

## Docker 部署

主应用提供 `Dockerfile` 和 `docker-compose.yml`。

启动：

```bash
docker compose up -d --build
```

端口：

| 端口 | 服务 |
| --- | --- |
| `8000` | FastAPI / Web UI |
| `6080` | noVNC |
| `8889` | Turnstile Solver |

持久化目录：

```text
./data:/app/data
```

Docker 默认数据库：

```text
sqlite:////app/data/account_manager.db
```

## Docker 镜像内容

`Dockerfile` 分两阶段：

1. `node:20-slim` 构建前端：
   - `npm ci`
   - `npm run build`
2. `python:3.12-slim` 运行后端：
   - 安装 Chromium、chromium-driver、Xvfb、x11vnc、noVNC、websockify 和浏览器运行依赖。
   - `pip install -r requirements.txt`
   - `playwright install --with-deps chromium`
   - `python -m camoufox fetch`
   - 复制后端源码。
   - 注入 `core/version.py`。
   - 复制前端构建产物到 `/app/static`。

启动脚本 `docker-entrypoint.sh`：

1. 启动 `Xvfb :99`。
2. 启动 `x11vnc`。
3. 启动 noVNC `6080 -> 5900`。
4. 启动 `uvicorn main:app --host 0.0.0.0 --port 8000`。

## 推荐环境变量

```env
ACCOUNT_MANAGER_DATABASE_URL=sqlite:////app/data/account_manager.db
APP_PASSWORD=change-this-password
PIX_CLIENT_CKD_CODES=CKD-1,CKD-2
NERVER_API_BASE_URL=https://cha.nerver.cc
NERVER_API_TIMEOUT=120
NERVER_PIX_SHORT_TOKEN=
NERVER_PIX_BUSINESS_TOKEN=
VNC_PASSWORD=
```

Provider 的 API Key 建议通过 Web UI 的设置页保存，避免写入部署脚本。

## 静态前端

生产部署时，FastAPI 会托管 `static/`：

- `/assets/*` -> `static/assets/*`
- 其他非 API 路由 -> `static/index.html`

因此以下页面均由同一服务提供：

```text
http://<server>:8000/
http://<server>:8000/pxl-plus
http://<server>:8000/luckmail-code
```

## 在线检查清单

部署后建议检查：

```bash
curl -i http://127.0.0.1:8000/api/health
curl -i http://127.0.0.1:8000/api/ready
curl -i http://127.0.0.1:8000/pxl-plus
curl -i http://127.0.0.1:8000/luckmail-code
```

公开 API 检查：

```bash
curl -sS -H "Content-Type: application/json" \
  -d '{"ticket":"bad"}' \
  http://127.0.0.1:8000/api/luckmail/client/code
```

预期返回 JSON，状态为 `invalid_ticket_format`，且不应返回 401。

PXL 公开接口在未配置 CKD 时：

```bash
curl -sS -H "Content-Type: application/json" \
  -d '{"ckd":"TEST","credential":"token"}' \
  http://127.0.0.1:8000/api/pix-gpt-plus/client/open
```

预期返回 `ckd_not_configured` 或 `invalid_ckd`，不应返回后台登录页。

## Customer Portal API 部署

独立 Docker Compose：

```bash
docker compose -f customer_portal_api/docker-compose.yml up --build
```

默认端口：

```text
8100
```

文档：

```text
http://127.0.0.1:8100/docs
http://127.0.0.1:8100/openapi.json
```

默认管理员账号由 `customer_portal_api/README.md` 描述，生产环境必须通过环境变量更换。
