# 平台与 Provider 体系

## 平台插件

平台插件由 `core.registry` 管理：

- `@register` 装饰器注册 `BasePlatform` 子类。
- `load_all()` 扫描 `src/platforms/*/plugin.py` 并导入插件。
- `list_platforms()` 返回平台元数据和能力。
- `get_platform_capabilities(name)` 会读取 `platform_capability_overrides`，没有覆盖时使用类默认值。
- 新平台需要实现 `BasePlatform.check_valid()`，并按需实现注册适配器、桌面状态和能力动作。

当前平台清单：

| key | 显示名 | 执行器 | 身份模式 | OAuth | 能力 |
| --- | --- | --- | --- | --- | --- |
| `chatgpt` | ChatGPT | `protocol`, `headless`, `headed` | `mailbox`, `oauth_browser` | `google`, `microsoft` | `query_state`, `refresh_token`, `generate_link`, `switch_desktop`, `upload_cpa`, `upload_tm` |
| `cursor` | Cursor | `protocol`, `headless`, `headed` | `mailbox` | 代码中有 OAuth adapter，但默认能力声明未列 OAuth provider | `switch_desktop`, `query_state`, `generate_link` |
| `kiro` | Kiro | `protocol`, `headless`, `headed` | `mailbox` | 代码中有 OAuth adapter，但默认能力声明未列 OAuth provider | `switch_desktop`, `refresh_token`, `query_state` |
| `windsurf` | Windsurf | `protocol`, `headless`, `headed` | `mailbox` | 无默认声明 | `query_state`, `check_trial`, `generate_link`, `generate_link_browser`, `switch_desktop` |
| `gopay` | GoPay | `protocol` | `phone` | 无 | `query_state` |
| `anything` | Anything | — | — | — | — |
| `blink` | Blink.new | — | — | — | — |
| `cerebras` | Cerebras | — | — | — | — |
| `grok` | Grok | — | — | — | — |
| `openblocklabs` | OpenBlockLabs | — | — | — | — |
| `tavily` | Tavily | — | — | — | — |
| `trae` | Trae.ai | — | — | — | — |

"—" 表示该平台插件未在类级别声明 `supported_executors`、`supported_identity_modes`、`supported_oauth_providers` 或 `capabilities`，继承自 `BasePlatform` 的空列表默认值。实际运行的可用能力由数据库 `platform_capability_overrides` 表决定（可通过后台 API 覆盖）。

## 注册流

`BasePlatform.register()` 根据 executor 和 identity 选择注册流：

- `headless` / `headed`: `BrowserRegistrationFlow`
- `oauth_browser`: `ProtocolOAuthFlow` 或浏览器 OAuth runner
- 其他协议邮箱注册：`ProtocolMailboxFlow`

注册流定义在 `src/core/registration/flows.py`：

- `BrowserRegistrationFlow`: 浏览器注册，支持 OTP、验证链接、验证码求解、手机号 callback、OAuth 复用浏览器。
- `ProtocolMailboxFlow`: 纯协议邮箱注册，支持 OTP、验证链接、Captcha、executor context。
- `ProtocolOAuthFlow`: 协议化 OAuth 流，支持 executor 限制和浏览器复用要求。

## Provider 注册表

`providers.registry` 管理四类 Provider：

- `mailbox`
- `captcha`
- `sms`
- `proxy`

机制：

- 各 Provider 模块通过 `@register_provider(provider_type, driver_type)` 注册类。
- `load_all()` 扫描 `src/providers/captcha`, `src/providers/proxy`, `src/providers/sms`, `src/providers/mailbox`。
- `create_provider(provider_type, driver_type, config)` 调用 Provider 类的 `from_config(config)`。

## 内置 Provider 定义

内置定义由 `src/infrastructure/provider_definitions_repository.py` 的 `_BUILTIN_DEFINITIONS` seed 到数据库。

### Mailbox

| key | 标签 | driver | 分类 |
| --- | --- | --- | --- |
| `cfworker_admin_api` | CF Worker/cloud-mail（自建域名） | `cfworker_admin_api` | `selfhost` |
| `moemail_api` | MoeMail（sall.cc） | `moemail_api` | `selfhost` |
| `tempmail_lol_api` | TempMail.lol | `tempmail_lol_api` | `free` |
| `tempmail_web_api` | Temp-Mail.org | `tempmail_web_api` | `free` |
| `duckmail_api` | DuckMail（自动生成） | `duckmail_api` | `selfhost` |
| `freemail_api` | FreeMail（自动生成） | `freemail_api` | `selfhost` |
| `testmail_api` | Testmail（namespace 邮箱） | `testmail_api` | `thirdparty` |
| `outlook_email_api` | outlookEmail（Outlook 邮箱池） | `outlook_email_api` | `selfhost` |
| `luckmail_api` | LuckMail（自动生成） | `luckmail_api` | `thirdparty` |
| `laoudo_api` | Laoudo（固定邮箱） | `laoudo_api` | `thirdparty` |
| `aitre_api` | Aitre 临时邮箱 | `aitre_api` | `free` |
| `ddg_email` | DuckDuckGo Email | `ddg_email` | `thirdparty` |
| `local_ms_pool` | 本地微软邮箱池 | `local_ms_pool` | `custom` |
| `generic_http_mailbox` | 通用 HTTP 邮箱 | `generic_http_mailbox` | `custom` |

LuckMail 当前字段包括：

- `luckmail_base_url`，默认 `https://mails.luckyous.com`
- `luckmail_api_key`
- `luckmail_project_code`，默认 `openai`
- `luckmail_email_type`，select，可选 `ms_graph`, `ms_imap`, `microsoft`, `self_built`, `google_variant`, `ms_variant`
- `luckmail_domain`
- `luckmail_specified_email`
- `luckmail_variant_mode`
- `luckmail_interval_s`
- `luckmail_request_timeout_s`

### Captcha

| key | 标签 | driver | 分类 |
| --- | --- | --- | --- |
| `yescaptcha_api` | YesCaptcha | `yescaptcha_api` | `thirdparty` |
| `twocaptcha_api` | 2Captcha | `twocaptcha_api` | `thirdparty` |
| `local_solver` | 本地验证码求解器 | `local_solver` | `thirdparty` |
| `manual` | 人工打码 | `manual` | `thirdparty` |

### SMS

| key | 标签 | driver | 分类 |
| --- | --- | --- | --- |
| `herosms_api` | HeroSMS | `herosms_api` | `thirdparty` |
| `sms_activate_api` | SMS-Activate | `sms_activate_api` | `thirdparty` |
| `smsbower_api` | SMSBower | `smsbower_api` | `thirdparty` |
| `pingme_api` | PingMe | `pingme_api` | `thirdparty` |

### Proxy

| key | 标签 | driver | 分类 |
| --- | --- | --- | --- |
| `api_extract` | API 提取代理 | `api_extract` | `thirdparty` |
| `rotating_gateway` | 旋转网关代理 | `rotating_gateway` | `thirdparty` |

## Provider 在线测试

`POST /api/provider-settings/test` 会按 Provider 类型执行测试：

- mailbox: 创建邮箱、peek 邮箱或调用 `test_connection()`。
- captcha: 当前返回“暂不支持在线测试，请在注册任务中验证”。
- sms: 当前返回“暂不支持在线测试，请在注册任务中验证”。

LuckMail 的后台在线测试调用 `/api/v1/openapi/user/info`，不会创建邮箱订单。
