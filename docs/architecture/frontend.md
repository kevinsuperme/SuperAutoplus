# 前端架构

## 技术栈

前端位于 `frontend/`：

- React 19
- React Router 7
- TypeScript 5.9
- Vite 8
- Tailwind CSS 4
- lucide-react 图标
- Radix UI 基础组件

构建命令定义在 `frontend/package.json`：

```bash
npm run build
```

构建脚本实际执行：

```bash
tsc -b && vite build
```

Vite 配置会把构建产物输出到仓库根目录 `static/`，由 FastAPI 生产服务托管。

## API 调用

`frontend/src/lib/utils.ts` 定义：

- `API = import.meta.env.VITE_API_BASE || '/api'`
- `apiFetch(path, opts)`: 自动添加 JSON header 和后台 Bearer token。
- `apiDownload(path, opts)`: 下载导出文件。
- `getAuthToken()` / `setAuthToken()`: 读写本地 `_auth_token`。

公开客户页面使用普通 `fetch()`，不携带后台 Authorization。

## 路由结构

`frontend/src/App.tsx` 是前端路由入口。

公开路由先于后台登录判断渲染：

- `/pxl-plus` -> `frontend/src/pages/PxlPlusClient.tsx`
- `/luckmail-code` -> `frontend/src/pages/LuckMailCodeClient.tsx`

公开路由集合在 `frontend/src/lib/public-routes.ts`：

```ts
const PUBLIC_CLIENT_ROUTES = new Set(["/pxl-plus", "/luckmail-code"]);
```

后台路由在登录判断之后渲染：

| 路径 | 页面 |
| --- | --- |
| `/` | Dashboard |
| `/accounts` | Accounts |
| `/accounts/sms-pool` | SmsPoolBlacklist |
| `/accounts/:platform` | Accounts |
| `/register` | Register |
| `/ctf-gpt-plus` | CtfGptPlus |
| `/gopay-gpt-plus` | GoPayGptPlus |
| `/pix-gpt-plus` | PixGptPlus |
| `/plus-manager` | PlusManager |
| `/history` | TaskHistory |
| `/proxies` | Proxies |
| `/settings` | SettingsPage |

## 后台壳

后台页面由 `Shell` 包裹：

- 左侧导航：Dashboard、CTF GPT Plus、GoPay GPT Plus、PIX GPT Plus、Plus Manager、History、Accounts、Proxies、Settings、Register。
- Accounts 菜单会通过 `getPlatforms()` 读取 `/api/platforms` 并按平台动态展开。
- Settings 页面使用 query 参数 `?tab=` 切换通用、注册、邮箱、验证码、接码、代理、ChatGPT、BitBrowser、高级、关于等区域。
- 主题支持 `light`、`dark`、`system`，保存在 localStorage 的 `theme`。
- 侧边栏折叠状态保存在 localStorage 的 `sidebar-collapsed`。

## 登录行为

`AppContent` 启动时调用 `/api/auth/check`：

- `required=false`: 直接进入后台。
- `required=true` 且 localStorage 有 `_auth_token`: 进入后台。
- `required=true` 且没有 token: 显示登录页。

登录页调用 `/api/auth/login`，成功后把 token 存入 `_auth_token`。

公开页面不会等待 `/api/auth/check` 结果，也不会渲染后台侧边栏或登录页。
