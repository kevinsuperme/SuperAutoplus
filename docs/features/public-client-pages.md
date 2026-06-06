# 公开客户页面

公开客户页面不渲染后台登录页和侧边栏，入口在 `frontend/src/App.tsx` 的登录判断之前。

当前公开路由：

- `/pxl-plus`
- `/luckmail-code`

公开 API 前缀由 `core/auth.py` 的 `_PUBLIC_PREFIXES` 放行。公开页面必须通过自身业务参数完成授权和安全控制。

## `/pxl-plus`

页面组件：

```text
frontend/src/pages/PxlPlusClient.tsx
```

后端接口：

```text
POST /api/pix-gpt-plus/client/open
```

服务实现：

```text
application/pix_gpt_plus.py::PixGptPlusService.generate_for_client_token()
```

### 输入

```json
{
  "ckd": "CUSTOMER-CODE",
  "credential": "access token 或 session json"
}
```

### CKD 校验

允许的 CKD 从以下位置读取：

1. 配置键 `pix_client_ckd_codes`
2. 环境变量 `PIX_CLIENT_CKD_CODES`

格式支持逗号、空格或换行分隔。CKD 区分大小写。未配置任何 CKD 时返回：

```json
{
  "ok": false,
  "status": "ckd_not_configured",
  "message": "服务端未配置 CKD 授权码"
}
```

### Credential 解析

如果 `credential` 是普通字符串，直接作为 access token。

如果是 JSON object/list，则递归查找以下字段：

- `access_token`
- `accessToken`
- `primary_token`
- `token`

解析失败返回：

- `invalid_credential`
- `missing_token`

### 远端调用

默认调用 Nerver PIX short 模式：

```text
https://cha.nerver.cc/api/v1/pix-short
```

相关配置：

| 配置键 | 环境变量 | 默认 |
| --- | --- | --- |
| `nerver_api_base_url` | `NERVER_API_BASE_URL` | `https://cha.nerver.cc` |
| `nerver_api_timeout` | `NERVER_API_TIMEOUT` | `120` |
| `nerver_pix_short_token` | `NERVER_PIX_SHORT_TOKEN` | 空 |
| `nerver_pix_business_token` | `NERVER_PIX_BUSINESS_TOKEN` | 回退 short token |

支持的 API mode：

- `short` -> `/api/v1/pix-short`
- `business` -> `/api/v1/pix-business`
- `long` -> `/api/v1/pix`

### 成功响应

```json
{
  "ok": true,
  "status": "success",
  "message": "PIX 已生成",
  "mode": "short",
  "endpoint": "/api/v1/pix-short",
  "pix_qr_data": "000201...",
  "pix_qr_image_url": "https://...",
  "pix_hosted_url": "https://...",
  "stripe_hosted_url": "https://...",
  "pix_expires_iso": "2026-06-06T12:00:00.000Z",
  "request_id": "..."
}
```

## `/luckmail-code`

页面组件：

```text
frontend/src/pages/LuckMailCodeClient.tsx
```

后端接口：

```text
POST /api/luckmail/client/code
```

服务实现：

```text
application/luckmail_client.py::LuckMailClientCodeService.get_code()
```

LuckMail provider：

```text
core/luckmail_mailbox.py::LuckMailMailbox
```

### 输入格式

支持完整邮箱凭据：

```text
user@example.com----tok_example
```

也支持只输入 token：

```text
tok_example
```

当只输入 token 时，邮箱地址从 LuckMail 远端响应字段中解析：

- `email_address`
- `email`
- `address`

### 查询接口

客户验证码查询使用 LuckMail 已购邮箱 token 接口：

```text
/api/v1/openapi/email/token/{token}/code
```

这不同于后台自动生成邮箱订单时使用的订单接口：

```text
/api/v1/openapi/order/create
/api/v1/openapi/order/{order_no}/code
```

后台注册流程创建 LuckMail 订单时需要 API Key。客户页面 token 查询不会把后台 API Key 缺失作为前置错误；当前代码会用默认 LuckMail base URL 构造请求，并通过公开 token 查询接口获取验证码。

### 响应状态

| 状态 | 说明 |
| --- | --- |
| `missing_ticket` | 未输入内容 |
| `invalid_ticket_format` | 输入既不是 `邮箱----token`，也不是干净的 token |
| `invalid_email` | 完整格式中的邮箱无效 |
| `missing_token` | 完整格式中 token 为空 |
| `remote_error` | LuckMail 查询异常，响应会脱敏 |
| `code_not_ready` | 邮件尚未到达或未提取到验证码 |
| `success` | 已获取验证码 |

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

### 安全策略

- 不保存客户粘贴的 token。
- 不返回 LuckMail 原始异常。
- 不返回远端完整邮件正文。
- 不在响应中返回 token。
- 前端只显示邮箱和验证码。
