# PXL Plus 客户自助开通页设计

## 背景

现有 `PIX 生成 GPTPlus` 页面是后台内部批量工具，输入来源是本地 ChatGPT 账号资产，后端通过 `PixGptPlusService` 调用 Nerver PIX API 生成 PIX QR / 支付链接。

本次新增一个客户自助使用页面：客户打开公开页面，输入 CKD 授权码以及自己的 ChatGPT Access Token 或 Session JSON。后端先校验 CKD，再从客户输入中提取 access token，触发 Plus 开通所需的 PIX 生成流程，并把状态返回给客户。

## 目标

- 新增公开客户页面 `/pxl-plus`，不要求后台登录。
- 页面采用移动端优先的居中卡片布局，参考“ChatGPT Plus 自助开通”样式。
- 客户输入 CKD 和 ChatGPT Access Token / Session JSON 后即可提交。
- 后端公开接口校验 CKD，通过后调用现有 PIX/Nerver 生成能力。
- 返回清晰状态：处理中、成功、失败、重复提交/正在运行。
- 不保存客户原始 access token 或 Session JSON。

## 非目标

- 不在本次实现完整订单系统、客户账号系统、库存系统或支付回调系统。
- 不新增“一码一次”“订单绑定”“余额扣减”等持久化权益管理。
- 不把客户 token 写入账号表或任务日志。
- 不改动现有后台 `PIX 生成 GPTPlus` 批量管理页的主要行为。

## 推荐方案

采用“公开客户页 + CKD 配置校验 + 临时 token 调用”的轻量方案。

原因：

- 符合客户直接访问的使用场景。
- 复用已有 `PixGptPlusService` 远端调用逻辑，改动小。
- CKD 先用配置或环境变量维护，部署快，后续可以平滑扩展为数据库权益码。
- 客户凭据只在请求生命周期内存在，降低泄露风险。

## 页面设计

路径：`/pxl-plus`

页面结构：

- 顶部标题：`ChatGPT Plus 自助开通`
- 状态横幅：显示当前服务状态、提交状态或错误信息。
- 输入区：
  - `CKD 授权码`
  - `Access Token / Session JSON`
- 主按钮：`生成 PIX 支付`
- 结果区：
  - 成功：显示 PIX QR 图片、PIX EMV 复制按钮、支付链接、过期时间。
  - 失败：显示失败原因和可重试提示。
  - 运行中：按钮禁用并显示加载状态。

视觉要求：

- 移动端宽度约 390-460px，桌面端居中显示。
- 使用现有设计变量和 Tailwind 风格，避免引入新 UI 框架。
- 控件必须有明确 hover、focus、disabled 状态。
- 不使用说明型大段文字，页面保持短表单体验。

## 前端架构

新增组件：

- `frontend/src/pages/PxlPlusClient.tsx`

路由处理：

- 在 `frontend/src/App.tsx` 中让 `/pxl-plus` 在登录判断前可直接访问。
- 后台登录状态和侧边栏不影响该公开页面。
- 现有后台路由 `/pix-gpt-plus` 保持不变。

请求方式：

- 使用普通 `fetch` 调用公开 API，不携带后台 `Authorization`。
- 提交中阻止重复点击。
- 提交中禁用按钮并显示加载状态，避免重复点击。

## 后端 API 设计

新增公开接口：

`POST /api/pix-gpt-plus/client/open`

请求：

```json
{
  "ckd": "CUSTOMER-CODE",
  "credential": "access token 或 session json"
}
```

响应：

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

错误响应保持 JSON：

```json
{
  "ok": false,
  "status": "invalid_ckd",
  "message": "CKD 授权码无效"
}
```

公开鉴权：

- 将 `/api/pix-gpt-plus/client/` 加入 `AuthMiddleware` 公开前缀。
- 该接口不能依赖后台登录密码，必须依赖 CKD 校验。

## CKD 校验

本次使用轻量配置：

- 配置键：`pix_client_ckd_codes`
- 环境变量：`PIX_CLIENT_CKD_CODES`
- 格式：用逗号、换行或空格分隔多个 CKD。

校验规则：

- 去掉首尾空白。
- 区分大小写。
- 未配置任何 CKD 时，接口返回 `ckd_not_configured`，不允许放行。
- CKD 不匹配时返回 `invalid_ckd`。

后续扩展：

- 可新增数据库表记录 CKD、使用次数、绑定订单、过期时间和使用日志。
- 该扩展不影响本次接口和页面形态。

## Token / Session JSON 解析

后端新增一个安全的解析函数：

- 如果输入是普通字符串，直接按 access token 处理。
- 如果输入是 JSON object，则递归查找常见字段：
  - `access_token`
  - `accessToken`
  - `token`
  - `primary_token`
- 提取到 token 后只保留临时变量，不写数据库、不写日志。
- token 为空时返回 `missing_token`。
- JSON 格式错误且不符合 token 字符串时返回 `invalid_credential`。

## 服务层设计

在 `application/pix_gpt_plus.py` 中新增面向客户调用的方法：

- `generate_for_client_token(payload)`

职责：

- 校验 CKD。
- 解析 token。
- 读取 API 模式、promo、超时和 Nerver token 配置。
- 调用已有 `_call_remote_pix()`。
- 把远端结果规整为客户页面需要的字段。

默认参数：

- `api_mode`: `short`
- `promo_id`: `plus-1-month-free`

## 错误处理

需要覆盖的状态：

- `ckd_not_configured`: 服务端未配置 CKD。
- `invalid_ckd`: CKD 无效。
- `missing_credential`: 未填写 token/session。
- `missing_token`: 未能从输入提取 token。
- `invalid_credential`: Session JSON 不合法。
- `remote_error`: Nerver PIX API 调用失败。
- `remote_failed`: Nerver 返回业务失败。
- `success`: PIX 已生成。

前端展示原则：

- 用户可理解，不直接展示堆栈。
- 客户端远端异常和远端业务失败都展示安全泛化提示。
- 不展示完整 token，也不把远端返回中可能包含 token 的 `message` / `reason` 原样返回给客户。

## 测试计划

后端测试：

- 有效 CKD + access token 会调用 Nerver `/api/v1/pix-short`。
- 有效 CKD + Session JSON 可提取 token。
- 未配置 CKD 返回 `ckd_not_configured`。
- CKD 错误返回 `invalid_ckd`。
- 缺少 token 返回 `missing_token`。
- 远端异常返回脱敏的 `remote_error`。
- 公开 endpoint 可在无后台 Authorization 时访问。

前端验证：

- `npm run build` 成功。
- `/pxl-plus` 未登录可访问。
- 后台登录页仍保护后台路由。
- 提交按钮的 loading、disabled、错误和成功结果状态正常。

## 部署检查

部署前确认：

- 服务器 `.env` 增加 `PIX_CLIENT_CKD_CODES`。
- 保留现有 Nerver API 配置。
- Docker 重建后访问 `/pxl-plus`。
- 在线测试使用测试 CKD 和测试 token/session，确认返回 PIX 结果或明确错误。

## 影响范围

预计改动文件：

- `core/auth.py`
- `api/pix_gpt_plus.py`
- `application/pix_gpt_plus.py`
- `frontend/src/App.tsx`
- `frontend/src/pages/PxlPlusClient.tsx`
- `tests/test_api_pix_gpt_plus.py`

不改动文件：

- 现有后台 `frontend/src/pages/PixGptPlus.tsx` 的批量操作体验。
- 现有账号表结构。
- 现有任务系统。
