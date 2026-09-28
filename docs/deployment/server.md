# 服务器与 Docker 部署

## Docker 部署

主应用提供 `Dockerfile` 和 `docker-compose.yml`。

启动：

```bash
# 首次部署先复制环境模板并填写随机密码、实际域名和必要的第三方配置
cp .env.example .env
docker compose up -d --build
```

Compose 会把 `.env` 中显式声明的运行变量传入容器。生产环境不能省略
`APP_PASSWORD`；空值只适合本机调试。

端口：

| 端口 | 服务 |
| --- | --- |
| `8000` | FastAPI / Web UI |
| `6080` | noVNC |
| `8889` | Turnstile Solver |

## 直接使用 IP 访问

主应用的 Uvicorn 监听 `0.0.0.0:8000`，Compose 端口默认绑定宿主机所有网卡，前端生产构建
使用相对路径 `/api`。因此在局域网内可以直接使用宿主机 IP 访问，无需域名：

```text
http://<HOST_IP>:8000/
http://<HOST_IP>:8000/pxl-plus
http://<HOST_IP>:8000/luckmail-code
```

生产服务器建议只公开主应用和 Portal。noVNC 与 Solver 仍使用 `6080`、`8889`，但绑定到
`127.0.0.1`，通过 SSH 隧道或受控反向代理访问；不要仅依靠 UFW 保护 Docker 发布端口，
因为 Docker 的转发规则可能绕过 UFW。服务器部署可在项目目录创建 `compose.server.yml`：

```yaml
services:
  app:
    ports: !override
      - "0.0.0.0:8000:8000"
      - "127.0.0.1:6080:6080"
      - "127.0.0.1:8889:8889"
```

Portal 的 `src/customer_portal_api/compose.server.yml` 只绑定 `0.0.0.0:8100:8100`。启动时
同时传入两个 Compose 文件，并先用 `docker compose ... config --quiet` 校验。防火墙至少保留
SSH 管理端口和既有 Web 端口，再放行 `8000/tcp`、`8100/tcp`；不放行 `6080/tcp`、
`8889/tcp`。

如果通过 `.env` 修改了 `APP_PORT`、`VNC_PORT` 或 `SOLVER_HOST_PORT`，访问地址要使用修改后
的宿主机端口。Windows 防火墙和局域网网络配置还必须允许对应 TCP 端口；本机访问成功不
代表其他设备一定能访问。

Customer Portal 默认使用 `8100` 端口。若 Portal 页面由其他 IP/端口的前端调用，必须在
`src/customer_portal_api/.env` 中把 `PORTAL_CORS_ORIGINS` 设置为实际的完整来源，例如：

```env
PORTAL_CORS_ORIGINS=http://192.168.111.231:8000
```

不要填写路径、尾随 `/` 或 `*`。如果 Portal 前端与 API 同源，则填写实际的
`http://<HOST_IP>:8100`；模板中的 `https://portal.example.com` 只是示例，未替换时服务会
拒绝启动。

开发时若要让 Vite 被局域网设备访问，需要显式监听所有网卡；生产构建后的静态前端不需要
这个设置：

```bash
npm run dev -- --host 0.0.0.0 --port 5173
```

Vite 开发代理仍会把 `/api` 转发到运行开发机上的 `localhost:8000`。公网或跨网络部署不能
只依赖裸 IP：应使用 HTTPS、访问控制和反向代理；第三方 OAuth、支付回调或平台白名单是否
接受 IP 地址，还要按对应服务的回调地址规则单独确认。

持久化目录：

```text
./data:/app/data
```

Docker 默认数据库：

```text
sqlite:////app/data/account_manager.db
```

## Docker Desktop 本机故障恢复

如果 Windows 上出现 `permission denied`、`Docker Desktop is unable to start`，或日志中出现
`sailor-ingest.sock` / `docker-secrets-engine\engine.sock` 的 stale Unix socket 错误，先停止
Docker Desktop 并释放 WSL 句柄：

```powershell
docker desktop stop
wsl --shutdown
docker desktop start
docker version
```

必须确认 `docker version` 同时显示 Client 和 Server；只有 Client 能运行不代表 named pipe
和 Linux engine 已恢复。如果 socket 错误在上述步骤后仍反复出现，重启 Windows 后再启动
Docker Desktop。不要点击 `Reset to factory defaults`，除非已经备份并接受删除本机镜像、容器
和 Docker volumes 的影响。

如果容器已经运行，但 `6080/vnc.html` 打开后没有画面，优先重启服务，让入口脚本重新创建
`Xvfb :99`、`x11vnc :5900` 和 noVNC：

```powershell
docker compose restart app
curl.exe -i http://127.0.0.1:6080/vnc.html
```

入口脚本将 x11vnc 固定为 `-localhost`，由 noVNC 代理访问 5900；这样 VNC 端口不会直接暴露
到局域网。若调试容器因旧的 `/tmp/.X99-lock` 无法恢复，应先停止并重新创建容器，避免在
运行容器内直接删除正在使用的 X11 socket。公网部署仍必须限制 6080/noVNC 和 8889/Solver
到内网或反向代理，并启用 `VNC_PASSWORD` 与 `OPAI_SOLVER_API_KEY`。

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
   - 注入 `src/core/version.py`。
   - 复制前端构建产物到 `/app/static`。

因此，使用本项目提供的 Docker Compose 部署时，宿主机不需要另外安装 Google Chrome：自动注册的 `headless` / `headed` 浏览器流程和本地 Solver 默认使用容器内的 Camoufox，镜像同时包含 Debian Chromium、Chromium Driver 和 Playwright Chromium。`headed` 模式通过容器内的 Xvfb 提供虚拟显示，调试时再通过 noVNC 查看。

只有在显式把 `SOLVER_BROWSER_TYPE` 改为 `chrome`、`msedge`，或绕过 Docker 直接在宿主机运行源码并指定系统浏览器时，才需要额外准备对应的浏览器可执行文件。`bitbrowser_*` 模式使用外部 BitBrowser profile，不等同于安装宿主机 Chrome。

启动脚本 `docker-entrypoint.sh`：

1. 启动 `Xvfb :99`。
2. 启动 `x11vnc`。
3. 启动 noVNC `6080 -> 5900`。
4. 启动 `uvicorn main:app --host 0.0.0.0 --port 8000`。

## 生产环境变量

```env
ACCOUNT_MANAGER_DATABASE_URL=sqlite:////app/data/account_manager.db
APP_PASSWORD=<long-random-password>
APP_PORT=8000
VNC_PORT=6080
SOLVER_HOST_PORT=8889
PIX_CLIENT_CKD_CODES=CKD-1,CKD-2
NERVER_API_BASE_URL=https://cha.nerver.cc
NERVER_API_TIMEOUT=120
NERVER_PIX_SHORT_TOKEN=
NERVER_PIX_BUSINESS_TOKEN=
VNC_PASSWORD=<different-vnc-password>
ACCOUNT_MANAGER_DISABLE_SOLVER=false
SOLVER_BROWSER_TYPE=camoufox
OPAI_SOLVER_API_KEY=<random-solver-api-key>
```

Provider 的 API Key 建议通过 Web UI 的设置页保存，避免写入部署脚本。

公网部署还必须在反向代理上启用 HTTPS，并将 6080/noVNC 和 8889/Solver
限制在内网或仅绑定到 `127.0.0.1`。不要把无密码 VNC 或 Solver API 直接暴露到公网。

## 数据库与备份

主应用使用 `data/account_manager.db`。Customer Portal 使用同一个持久化目录，
但使用独立的 `data/customer_portal.db`；Portal 通过
`ACCOUNT_MANAGER_DATABASE_URL` 访问主业务库。两个文件都必须纳入备份。

停止容器后执行备份：

```bash
docker compose stop
python scripts/sqlite_backup.py backup data/account_manager.db backups
python scripts/sqlite_backup.py backup data/customer_portal.db backups
docker compose start
```

恢复前必须停止使用该数据库的服务。脚本会先做 `PRAGMA integrity_check`，恢复时
默认拒绝覆盖现有文件；确认备份来源后再显式使用 `--force`：

```bash
docker compose stop
python scripts/sqlite_backup.py restore backups/account_manager-YYYYMMDD-HHMMSS.db data/account_manager.db --force
python scripts/sqlite_backup.py restore backups/customer_portal-YYYYMMDD-HHMMSS.db data/customer_portal.db --force
docker compose start
```

恢复后必须重新执行健康检查和关键业务冒烟，确认表结构、账号和订单数据可读。

## 静态前端

生产部署时，FastAPI 会托管 `static/`：

- `/assets/*` -> `static/assets/*`
- `/superautoplus-logo.png`、`/favicon.svg` 等 `frontend/public` 文件 -> `static/*`
- 其他非 API 路由 -> `static/index.html`

网站品牌资源位于 [frontend/public/superautoplus-logo.png](../../frontend/public/superautoplus-logo.png)，
并在侧边栏、登录页、Dashboard 品牌徽章和浏览器 favicon 中复用。新增 `frontend/public` 文件后，
必须重新执行前端构建并重建 Docker 镜像，确保文件进入 `/app/static`。

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
curl -i http://127.0.0.1:6080/vnc.html
```

同时确认 Compose 健康状态：

```bash
docker compose ps
```

主应用的 `/api/ready` 只有在数据库、平台注册表和必需的 Solver 均就绪时才返回
`"ok": true`。如果本次部署明确不使用 Solver，可设置
`ACCOUNT_MANAGER_DISABLE_SOLVER=true`，此时就绪检查会明确标记 Solver 为非必需。

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
cp src/customer_portal_api/.env.example src/customer_portal_api/.env
# 编辑 src/customer_portal_api/.env：更换 JWT、管理员密码和 CORS 域名
docker compose --env-file src/customer_portal_api/.env -f src/customer_portal_api/docker-compose.yml up --build
```

该 Compose 的构建上下文是仓库根目录，因此
`src/customer_portal_api/requirements.txt` 需要使用 `-r ../../requirements.txt` 解析根依赖；
若改为其他构建上下文，必须同步调整 Dockerfile 和依赖引用，并重新执行镜像构建。

默认端口：

```text
8100
```

文档：

```text
http://127.0.0.1:8100/docs
http://127.0.0.1:8100/openapi.json
```

Portal 不提供可用于上线的默认管理员账号；生产启动前必须通过环境变量设置管理员用户名、强密码、JWT 密钥和实际 CORS 域名。

Portal Compose 会把 `../../data` 挂载到 `/app/data`，并使用：

```text
PORTAL_DATABASE_URL=sqlite:////app/data/customer_portal.db
ACCOUNT_MANAGER_DATABASE_URL=sqlite:////app/data/account_manager.db
```

不要使用 `change-me-in-production`、`admin123456` 或 `PORTAL_CORS_ORIGINS=*`。
Portal 的 `/health`、`/ready` 可分别用于进程和数据库就绪检查：

```bash
curl -i http://127.0.0.1:8100/health
curl -i http://127.0.0.1:8100/ready
```

## 上线前验收

上线前必须同时满足以下条件：

1. `docker compose config --quiet` 和 Portal Compose 校验通过。
2. `docker compose ps` 显示服务为 `healthy`，而不只是 `running`。
3. 主应用和 Portal 的两个数据库均位于持久化目录，并已完成一次备份和恢复演练。
4. `APP_PASSWORD`、Portal JWT、管理员密码、CORS 和 Solver API key 已替换默认值。
5. 已完成前端构建、受影响 pytest 分组和容器内依赖完整性检查。
6. 已验证 `/api/health`、`/api/ready`、Portal `/health`、`/ready`、公开页面和一条最小业务路径。
7. 已确认 Playwright、Camoufox 和系统 Chromium 均可用；如果禁用 Solver，必须明确记录业务影响。
8. 已配置 HTTPS、访问控制、日志保留、备份周期和回滚步骤。
