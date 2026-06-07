# LuckMail 客户验证码查询页设计

## 背景

现有 LuckMail 接入作为后台邮箱 provider 使用。后台配置 LuckMail API Key、项目代码和邮箱类型后，注册流程会创建邮箱订单，并通过 LuckMail 的验证码查询接口获取邮件验证码。

本次新增一个客户自助页面：客户拿到一行文本格式的邮箱凭据，例如：

```txt
user@example.com----tok_example
```

客户可以把整行文本粘贴到公开页面，也可以只粘贴已购邮箱 token；单独 token 模式下由 LuckMail 响应反查邮箱。

## 目标

- 新增公开页面 `/luckmail-code`，不要求后台登录。
- 页面采用“带状态流程”的布局：解析文本、查询 LuckMail、提取验证码。
- 客户可粘贴一整行 `邮箱----token`，也可只粘贴单独的 `tok_xxx`。
- 提供 ChatGPT Access Token 辅助填入区：打开 Session 页面后，客户复制 session JSON，再由页面从剪贴板或手动粘贴内容中提取 `accessToken`。
- 后端使用 LuckMail 已购邮箱 token 验证码接口查询；后台 API Key 可配置但不是客户 token 查询的硬性前置条件。
- 返回验证码后提供一键复制。
- 不向客户暴露 LuckMail API Key、远端原始响应或其它邮箱数据。

## 非目标

- 不创建新的 LuckMail 邮箱订单。
- 不提供邮箱库存列表、购买流程或客户账号系统。
- 不让客户输入或管理 LuckMail API Key。
- 不保存客户粘贴的 token 到数据库。
- 不保存、上传或后端处理 ChatGPT Access Token。
- 不尝试从前端跨域读取 `chatgpt.com` 页面内容；浏览器安全模型不允许公开页面自动读取其它域页面。
- 不强制打开系统无痕浏览器；公开网页无法可靠控制用户浏览器的无痕模式。
- 不改变现有后台 LuckMail provider 在注册流程中的行为。

## 页面设计

路径：`/luckmail-code`

页面结构：

- 标题：`LuckMail 验证码查询`
- 状态横幅：显示等待、成功或错误状态。
- 邮箱 Token 输入区：
  - 标签：`邮箱 Token 文本或单独 Token`
  - 作为页面第一步操作，位于 ChatGPT Access Token 辅助区上方。
  - 支持粘贴 `邮箱----token` 或单独 `tok_xxx`。
  - 完整格式会自动解析并显示邮箱名称。
  - 单独 token 会先显示 `提交后识别邮箱`，查询成功后显示 LuckMail 返回的邮箱名称。
- 邮箱名称显示区：
  - 完整格式输入后立即显示解析出的邮箱。
  - 单独 token 查询成功后显示接口返回邮箱。
- ChatGPT Access Token 辅助区：
  - 标签：`ChatGPT Access Token`
  - `打开 Session` 按钮：新标签页打开 `https://chatgpt.com/api/auth/session`。
  - `从剪贴板填入` 按钮：读取剪贴板文本，支持从 session JSON 中提取 `accessToken` / `access_token` / `token` / `primary_token`。
  - 文本框支持手动粘贴 session JSON；若识别到 token，会自动替换为纯 token。
  - token 仅保存在当前页面 React state 中，不写 localStorage，不随 LuckMail API 请求提交。
- 主按钮：`获取验证码`
- 状态流程区：
  - `解析文本`
  - `查询 LuckMail`
  - `提取验证码`
- 结果区：
  - 成功时显示验证码大号数字和复制按钮。
  - 失败时显示安全、可读的错误提示。

视觉要求：

- 参考 `/pxl-plus` 的公开页面风格，但采用左右两栏或移动端上下堆叠的状态流程布局。
- 移动端优先，桌面端居中显示，最大宽度约 720-860px。
- 不放后台侧边栏，不显示登录框。
- 页面文案简短，避免暴露内部接口细节。

## 输入格式

客户输入支持两种格式。

完整格式：

```txt
email@example.com----tok_xxxxxxxxxxxxxxxxx
```

单独 token：

```txt
tok_xxxxxxxxxxxxxxxxx
```

解析规则：

- 若包含 `----`，以第一个 `----` 分隔邮箱和 token。
- 邮箱和 token 去掉首尾空白。
- 完整格式中的邮箱必须符合基本邮箱格式。
- 完整格式中的 token 必须非空。
- 若不包含 `----` 且文本不含 `@`、不含空白，则按单独 token 查询。
- 若不包含 `----` 但文本包含邮箱或空白，返回 `invalid_ticket_format`。
- 若邮箱无效，返回 `invalid_email`。
- 若 token 为空，返回 `missing_token`。

## 后端 API 设计

新增公开接口：

`POST /api/luckmail/client/code`

请求：

```json
{
  "ticket": "user@example.com----tok_example"
}
```

也支持：

```json
{
  "ticket": "tok_example"
}
```

成功响应：

```json
{
  "ok": true,
  "status": "success",
  "message": "验证码已获取",
  "email": "user@example.com",
  "code": "123456"
}
```

错误响应：

```json
{
  "ok": false,
  "status": "invalid_ticket_format",
  "message": "请输入正确的邮箱 Token 文本"
}
```

公开鉴权：

- 将 `/api/luckmail/client/` 加入 `AuthMiddleware` 公开前缀。
- 该公开接口不依赖后台登录密码。
- 该接口只允许查询客户提交 token 对应的验证码，不提供订单创建或列表能力。

## LuckMail 查询设计

现有 `LuckMailMailbox` 已具备两类验证码查询能力：

- 后台自动生成邮箱订单：`_get_json("/api/v1/openapi/order/{order_no}/code")`
- 客户已购邮箱 token：`_get_json("/api/v1/openapi/email/token/{token}/code")`
- `_extract_code(payload, code_pattern)`

客户查询服务应复用 `get_email_token_code_payload_now(token)` 和 `_extract_code()`，而不是复制验证码提取逻辑。

服务职责：

- 读取系统 LuckMail provider 配置。
- 解析客户粘贴的 `邮箱----token` 或单独 `tok_xxx`。
- 将 token 作为 LuckMail 已购邮箱 token 调用 `/api/v1/openapi/email/token/{token}/code`。
- 从返回内容提取验证码。
- 完整格式优先使用客户输入邮箱；单独 token 使用远端返回的 `email_address` / `email` / `address`。
- 返回客户安全响应。

配置来源：

- 通过 Provider 设置解析 LuckMail base URL、项目代码、邮箱类型等默认值。
- 如果已配置 LuckMail API Key，会随请求 header 一起发送。
- 客户已购邮箱 token 查询不会因为后台未配置 API Key 直接失败；后台创建邮箱订单和 Provider 在线测试仍需要 API Key。

## 错误处理

需要覆盖的状态：

- `missing_ticket`: 未输入邮箱 Token 文本。
- `invalid_ticket_format`: 文本既不是完整 `邮箱----token`，也不是干净的单独 token。
- `invalid_email`: 邮箱格式无效。
- `missing_token`: token 为空。
- `code_not_ready`: LuckMail 暂未返回验证码。
- `remote_error`: LuckMail 接口调用失败。
- `success`: 验证码已获取。

客户错误提示原则：

- 不返回完整远端异常。
- 不返回 LuckMail API Key。
- 不返回其它邮箱内容。
- 可展示输入邮箱和验证码。
- token 不完整展示，最多用于内部日志摘要；默认不在响应里返回 token。

## 前端架构

新增组件：

- `frontend/src/pages/LuckMailCodeClient.tsx`
- `frontend/src/lib/luckmail-ticket.ts`
- `frontend/src/lib/session-token.ts`

路由处理：

- 在 `frontend/src/App.tsx` 中让 `/luckmail-code` 在登录判断前可直接访问。
- 后台页面和公开页面保持分离。

请求方式：

- 使用普通 `fetch` 调用 `/api/luckmail/client/code`。
- 提交时禁用按钮并更新状态流程。
- 前端只在页面内保留输入状态，不写 localStorage。
- 成功后提供复制验证码按钮。

Access Token 辅助流程：

- `打开 Session` 仅负责打开 ChatGPT Session URL。
- 客户复制 session 页面内容后，可点击 `从剪贴板填入`。
- 如果浏览器因为 HTTP 环境或权限策略拒绝读取剪贴板，客户仍可直接粘贴 session JSON 到 Access Token 文本框。
- `session-token.ts` 负责从 JSON 或原始 token 文本中提取 token；无效 JSON 不产生 token。
- 提取出的 token 不参与 `/api/luckmail/client/code` 请求，当前仅作为客户页面的辅助输入状态展示。

## 测试计划

后端测试：

- 能解析合法 `邮箱----token`。
- 缺少分隔符但输入是干净 token 时允许查询；包含邮箱或空白且缺少分隔符时返回 `invalid_ticket_format`。
- 邮箱格式错误返回 `invalid_email`。
- token 为空返回 `missing_token`。
- 单独 token 查询成功时使用远端返回邮箱。
- 未配置 API Key 时客户 token 查询仍可走默认 LuckMail base URL。
- LuckMail 返回验证码时接口返回 `success` 和 `code`。
- LuckMail 暂无验证码时返回 `code_not_ready`。
- 公开 endpoint 在无后台 Authorization 时可访问。

前端验证：

- `npm run build` 成功。
- `/luckmail-code` 未登录可访问。
- 页面第一步渲染邮箱 Token 输入框，并在 `邮箱----token` 粘贴后立即显示邮箱名称。
- 单独 token 查询成功后使用接口返回邮箱更新邮箱名称。
- ChatGPT Access Token 辅助区位于邮箱 Token 输入区下方。
- 页面渲染状态流程和复制按钮。
- 输入格式错误时不发起无效查询或显示清晰错误。
- session JSON 中的 `accessToken` 可被提取。
- 嵌套 JSON 中的 `access_token` 可被提取。
- 原始 token 文本可被直接接受。
- 无效 JSON-like 文本不会被误识别为 token。
- 后台登录页仍保护后台路由。

## 部署检查

- 部署后访问 `/luckmail-code` 返回公开页面。
- 用无效格式提交，返回安全错误。
- 用测试 ticket 提交，确认接口不会返回 401。
- 在 HTTPS 或允许剪贴板权限的浏览器中验证 `从剪贴板填入`；在 HTTP 环境中验证手动粘贴 session JSON 的兜底流程。
- 在配置 LuckMail API Key 后，用真实邮箱 ticket 查询验证码。
