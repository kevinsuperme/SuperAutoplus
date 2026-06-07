# CPA / sub2api 公开转换页设计

## 背景

仓库根目录现有 `converter.html` 是一个纯静态浏览器工具，支持两类 JSON 格式互转：

- `sub2api` 导出文件按账号拆分为多个 CPA JSON。
- 多个 CPA JSON 合并为一个 `sub2api` 导出文件。

当前页面可以离线双击使用，所有解析、预览和下载都在浏览器内完成。下一步需要把它设计成部署在服务器中运行、开放给用户使用的单独页面，同时保留敏感 token 默认不上传服务器的安全属性。

## 目标

- 新增公开客户页面 `/converter`，不要求后台登录。
- 页面进入前端 React / Vite 构建体系，由现有 FastAPI 静态托管统一部署。
- 默认使用浏览器本地转换，文件内容不上传服务器。
- 保留 CPA 与 sub2api 双向转换能力。
- 提供清晰的文件选择、拖拽上传、结构预览、格式错误提示和下载反馈。
- 将转换核心逻辑拆成可测试的前端纯函数，便于后续复用到后端能力。
- 为后续后端审计、批量 ZIP 打包、格式校验报告预留扩展边界，但本次不默认启用远端上传。

## 非目标

- 不在本次实现后端上传转换接口。
- 不把客户 JSON、access token、refresh token、id token 上传或保存到服务器。
- 不新增客户账号系统、权限码、订单系统或操作审计数据库。
- 不改变现有后台登录、任务系统、账号资产结构。
- 不继续把根目录 `converter.html` 作为主要生产入口。
- 不依赖浏览器插件、桌面端能力或外部第三方转换服务。

## 推荐方案

采用“公开 React 页面 + 默认本地转换 + 后端能力预留”的混合方案。

理由：

- `/converter` 与现有 `/pxl-plus`、`/luckmail-code` 属于同类公开客户页面，可复用当前公开路由机制。
- 浏览器本地转换符合 token 文件处理的隐私预期，部署风险最低。
- React 组件和纯函数拆分后，转换规则可以被单元测试覆盖。
- 未来如果多文件下载被浏览器拦截，或需要生成审计报告，可以平滑增加后端 ZIP / 校验接口，而不改变用户主流程。

## 页面设计

路径：`/converter`

页面结构：

- 顶部标题：`CPA / sub2api 转换工具`
- 安全状态横幅：
  - 默认显示 `本地转换模式`
  - 明确提示文件只在当前浏览器解析，不上传服务器。
- 转换模式选择：
  - `sub2api 转 CPA`
  - `CPA 转 sub2api`
  - 使用分段控件或单选卡片，切换后清空当前文件和预览。
- 文件输入区：
  - 支持点击选择 `.json` 文件。
  - 支持拖拽文件。
  - `sub2api 转 CPA` 模式只接受一个文件。
  - `CPA 转 sub2api` 模式接受多个文件。
- 文件列表：
  - 显示文件名和大小。
  - 多文件模式按选择顺序展示。
  - 提供清空按钮。
- 结构预览区：
  - 显示将生成的账号数量或将合并的 CPA 文件数量。
  - 显示脱敏后的示例 JSON。
  - 长 token 使用头尾截断展示，不显示完整敏感字段。
- 操作区：
  - 主按钮：`转换并下载`
  - 次按钮：`清空`
  - 未来后端能力入口预留为独立区域，不默认展示上传按钮。
- 结果反馈：
  - 成功时显示已触发下载数量。
  - 错误时显示可理解的格式问题。
  - 对浏览器可能拦截多文件下载的场景给出提示。

视觉要求：

- 参考现有公开页的卡片式工具体验，使用项目现有 CSS 变量、Tailwind 和 lucide-react 图标。
- 首屏直接展示工具本体，不做营销落地页。
- 桌面端建议使用左右两栏：左侧操作，右侧预览。
- 移动端上下堆叠，文件名、按钮文案和预览内容不能横向溢出。
- 控件必须有 hover、focus、disabled 状态。
- 不使用大段说明文案，不暴露内部接口细节。

## 转换规则

### sub2api 转 CPA

输入：

```json
{
  "accounts": [
    {
      "name": "user@example.com",
      "credentials": {
        "access_token": "...",
        "refresh_token": "...",
        "id_token": "...",
        "expires_at": "...",
        "organization_id": "..."
      }
    }
  ]
}
```

输出 CPA 单账号文件：

```json
{
  "type": "codex",
  "email": "user@example.com",
  "expired": "...",
  "id_token": "...",
  "account_id": "...",
  "access_token": "...",
  "last_refresh": "2026-06-07T00:00:00.000Z",
  "refresh_token": "..."
}
```

规则：

- `accounts` 必须是数组。
- 每个账号从 `credentials.email`、`account.name` 或索引占位生成邮箱名。
- `expired` 来自 `credentials.expires_at`。
- `account_id` 来自 `credentials.organization_id`。
- 缺失字段用空字符串填充。
- 下载文件名使用邮箱名，并替换 Windows / Linux 不安全文件名字符。
- 如果账号数为 0，按钮禁用并显示 `没有在 accounts 中找到账号`。

### CPA 转 sub2api

输入 CPA 单账号文件：

```json
{
  "type": "codex",
  "email": "user@example.com",
  "expired": "...",
  "id_token": "...",
  "account_id": "...",
  "access_token": "...",
  "refresh_token": "..."
}
```

输出：

```json
{
  "exported_at": "2026-06-07T00:00:00.000Z",
  "proxies": [],
  "accounts": [
    {
      "name": "user@example.com",
      "notes": "",
      "platform": "openai",
      "type": "oauth",
      "credentials": {
        "access_token": "...",
        "email": "user@example.com",
        "expires_at": "...",
        "id_token": "...",
        "organization_id": "...",
        "refresh_token": "..."
      },
      "extra": {},
      "concurrency": 0,
      "priority": 0,
      "rate_multiplier": 1,
      "auto_pause_on_expired": true
    }
  ]
}
```

规则：

- 每个 CPA 文件对应一个 `accounts` 条目。
- `credentials.email` 和 `name` 使用 CPA `email`，缺失时使用 `account-{index}`。
- `credentials.expires_at` 来自 CPA `expired`。
- `credentials.organization_id` 来自 CPA `account_id`。
- `proxies` 默认为空数组。
- 输出文件名使用 `sub2api-account-YYYYMMDDhhmmss.json`。

## 前端架构

新增文件：

- `frontend/src/pages/ConverterClient.tsx`
- `frontend/src/lib/account-converter.ts`
- `frontend/src/lib/account-converter.test.mjs` 或项目现有测试位置中的等价测试文件。

路由处理：

- 在 `frontend/src/lib/public-routes.ts` 将 `/converter` 加入公开路由集合。
- 在 `frontend/src/App.tsx` 中让 `/converter` 在后台登录判断前直接渲染。
- 后台路由和后台侧边栏保持不变。

组件职责：

- `ConverterClient.tsx` 负责页面状态、文件选择、拖拽、预览、下载和状态提示。
- `account-converter.ts` 负责纯转换逻辑、格式校验、脱敏预览、文件名清洗和下载数据生成。
- 页面使用普通浏览器 `FileReader` 读取 JSON。
- 页面不调用后端 API，不携带后台 Authorization。

状态模型：

- `mode`: `sub2api-to-cpa` 或 `cpa-to-sub2api`
- `files`: 当前选择的文件列表。
- `preview`: 脱敏后的预览数据。
- `status`: `idle`、`ready`、`converting`、`success`、`warning`、`error`
- `message`: 当前用户可见提示。

## 后端扩展边界

本次不新增后端接口，但预留以下后续方向：

- `POST /api/converter/validate`
  - 上传 JSON 后返回格式校验报告。
  - 只在用户明确选择远端校验时使用。
- `POST /api/converter/package`
  - 上传 sub2api JSON 后返回 ZIP，解决多 CPA 文件批量下载容易被浏览器拦截的问题。
  - 接口必须在 UI 中明确提示会上传敏感文件。
- `POST /api/converter/audit`
  - 返回脱敏审计摘要，例如账号数量、缺失字段数量、过期时间分布。
  - 不保存原始 token。

后续公开接口如启用，必须：

- 加入 `AuthMiddleware` 公开前缀或设计独立授权。
- 默认不持久化用户上传内容。
- 对日志和错误响应做 token 脱敏。
- 在页面中明确区分 `本地模式` 和 `远端模式`。

## 安全策略

- 默认转换只在浏览器内完成。
- 不写 localStorage、sessionStorage 或 IndexedDB。
- 不向后端提交 JSON 文件内容。
- 预览中长字符串脱敏，避免旁观泄露完整 token。
- 错误信息不包含完整 token。
- 下载文件由浏览器 `Blob` 生成，下载 URL 使用后及时 revoke。
- 文件名清洗避免路径分隔符和非法字符。
- 未来远端模式必须要求用户主动切换并确认上传行为。

## 错误处理

需要覆盖的状态：

- `missing_file`: 未选择文件。
- `invalid_json`: 文件不是有效 JSON。
- `missing_accounts`: sub2api 文件没有 `accounts` 数组。
- `empty_accounts`: `accounts` 数组为空。
- `invalid_cpa_file`: CPA 文件缺少可识别的账号字段。
- `conversion_failed`: 转换过程中发生未知错误。
- `download_started`: 已触发浏览器下载。

前端展示原则：

- 文件级错误要指出具体文件名。
- 多文件模式中任意文件解析失败时停止转换。
- 对字段缺失但可安全填空的情况显示 warning，不阻断转换。
- 对无法识别的结构显示 error，禁用转换按钮。

## 测试计划

前端单元测试：

- `sub2api` 单账号可转换为 CPA。
- `sub2api` 多账号可生成多个 CPA 下载项。
- 缺少 `accounts` 返回 `missing_accounts`。
- 空 `accounts` 返回 `empty_accounts`。
- CPA 单文件可转换为 sub2api。
- 多个 CPA 文件可合并为 sub2api。
- 缺失可选字段时用空字符串或默认值填充。
- 长 token 预览会脱敏。
- 文件名清洗会替换 `\\/:*?"<>|`。

构建验证：

- `npm run build` 成功。
- `/converter` 未登录可访问。
- `/converter` 不触发 `/api/auth/check` 等后台登录流程的前置渲染阻塞。
- 后台路由仍按原逻辑显示登录页或后台壳。

浏览器验证：

- 桌面端 1440px：左右布局稳定，预览不溢出。
- 平板 768px：布局可读，文件列表和按钮不重叠。
- 手机 375px：上下堆叠，无横向滚动。
- 拖拽文件、点击选择文件、清空、切换模式均正常。
- 无效 JSON 显示清晰错误。
- 成功转换后能下载预期 JSON 文件。

## 部署检查

- 构建前端后，`static/` 包含 `/converter` 所需资产。
- 生产服务访问 `/converter` 返回公开页面。
- 无后台登录 cookie 时仍可打开 `/converter`。
- 页面默认文案显示本地转换，不暗示文件上传服务器。
- `converter.html` 如仍保留在仓库根目录，应在文档中标记为历史或开发辅助入口，生产入口以 `/converter` 为准。

## 影响范围

预计改动文件：

- `frontend/src/App.tsx`
- `frontend/src/lib/public-routes.ts`
- `frontend/src/pages/ConverterClient.tsx`
- `frontend/src/lib/account-converter.ts`
- `frontend/src/lib/account-converter.test.mjs` 或等价测试文件
- `docs/features/public-client-pages.md`
- `docs/architecture/frontend.md`
- `converter.html`，视实施决策改为归档、重定向说明或删除

不改动文件：

- `src/core/auth.py`
- `main.py`
- 现有后台 API 路由
- 现有账号数据库结构
- 现有任务系统

