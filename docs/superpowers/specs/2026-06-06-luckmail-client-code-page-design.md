# LuckMail 客户验证码查询页设计

## 背景

现有 LuckMail 接入作为后台邮箱 provider 使用。后台配置 LuckMail API Key、项目代码和邮箱类型后，注册流程会创建邮箱订单，并通过 LuckMail 的验证码查询接口获取邮件验证码。

本次新增一个客户自助页面：客户拿到一行文本格式的邮箱凭据，例如：

```txt
jadelee7905@outlook.com----tok_894d7778268489752c2c077e7ac6a603
```

客户只需要把整行文本粘贴到公开页面，即可查询该邮箱对应的验证码。

## 目标

- 新增公开页面 `/luckmail-code`，不要求后台登录。
- 页面采用“带状态流程”的布局：解析文本、查询 LuckMail、提取验证码。
- 客户只粘贴一整行 `邮箱----token`，不需要拆分字段。
- 后端使用系统已配置的 LuckMail API Key 查询验证码。
- 返回验证码后提供一键复制。
- 不向客户暴露 LuckMail API Key、远端原始响应或其它邮箱数据。

## 非目标

- 不创建新的 LuckMail 邮箱订单。
- 不提供邮箱库存列表、购买流程或客户账号系统。
- 不让客户输入或管理 LuckMail API Key。
- 不保存客户粘贴的 token 到数据库。
- 不改变现有后台 LuckMail provider 在注册流程中的行为。

## 页面设计

路径：`/luckmail-code`

页面结构：

- 标题：`LuckMail 验证码查询`
- 状态横幅：显示等待、成功或错误状态。
- 单个输入区：
  - 标签：`邮箱 Token 文本`
  - 支持粘贴 `邮箱----token`
  - 自动解析并预览邮箱。
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

客户输入格式固定为：

```txt
email@example.com----tok_xxxxxxxxxxxxxxxxx
```

解析规则：

- 以第一个 `----` 分隔邮箱和 token。
- 邮箱和 token 去掉首尾空白。
- 邮箱必须符合基本邮箱格式。
- token 必须非空。
- 若文本缺少分隔符，返回 `invalid_ticket_format`。
- 若邮箱无效，返回 `invalid_email`。
- 若 token 为空，返回 `missing_token`。

## 后端 API 设计

新增公开接口：

`POST /api/luckmail/client/code`

请求：

```json
{
  "ticket": "jadelee7905@outlook.com----tok_894d7778268489752c2c077e7ac6a603"
}
```

成功响应：

```json
{
  "ok": true,
  "status": "success",
  "message": "验证码已获取",
  "email": "jadelee7905@outlook.com",
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

现有 `LuckMailMailbox` 已具备验证码查询能力：

- `_get_json("/api/v1/openapi/order/{order_no}/code")`
- `_extract_code(payload, code_pattern)`

新增客户查询服务应复用这些能力，而不是复制验证码提取逻辑。

服务职责：

- 读取系统 LuckMail provider 配置。
- 解析客户粘贴的 `邮箱----token`。
- 将 token 作为 LuckMail 订单查询标识调用验证码查询接口。
- 从返回内容提取验证码。
- 可选校验返回邮箱字段是否与输入邮箱一致；若远端响应没有邮箱字段，不阻塞验证码展示。
- 返回客户安全响应。

配置来源：

- 优先使用默认 LuckMail mailbox provider 设置。
- 如果没有默认 provider，可使用已保存的 `luckmail_api` 设置。
- 必须要求 LuckMail API Key 已配置，否则返回 `luckmail_not_configured`。

## 错误处理

需要覆盖的状态：

- `missing_ticket`: 未输入邮箱 Token 文本。
- `invalid_ticket_format`: 缺少 `----` 分隔符。
- `invalid_email`: 邮箱格式无效。
- `missing_token`: token 为空。
- `luckmail_not_configured`: 后台未配置 LuckMail API Key。
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

路由处理：

- 在 `frontend/src/App.tsx` 中让 `/luckmail-code` 在登录判断前可直接访问。
- 后台页面和公开页面保持分离。

请求方式：

- 使用普通 `fetch` 调用 `/api/luckmail/client/code`。
- 提交时禁用按钮并更新状态流程。
- 前端只在页面内保留输入状态，不写 localStorage。
- 成功后提供复制验证码按钮。

## 测试计划

后端测试：

- 能解析合法 `邮箱----token`。
- 缺少分隔符返回 `invalid_ticket_format`。
- 邮箱格式错误返回 `invalid_email`。
- token 为空返回 `missing_token`。
- 未配置 LuckMail 返回 `luckmail_not_configured`。
- LuckMail 返回验证码时接口返回 `success` 和 `code`。
- LuckMail 暂无验证码时返回 `code_not_ready`。
- 公开 endpoint 在无后台 Authorization 时可访问。

前端验证：

- `npm run build` 成功。
- `/luckmail-code` 未登录可访问。
- 页面渲染单输入框、邮箱预览、状态流程和复制按钮。
- 输入格式错误时不发起无效查询或显示清晰错误。
- 后台登录页仍保护后台路由。

## 部署检查

- 部署后访问 `/luckmail-code` 返回公开页面。
- 用无效格式提交，返回安全错误。
- 用测试 ticket 提交，确认接口不会返回 401。
- 在配置 LuckMail API Key 后，用真实邮箱 ticket 查询验证码。
