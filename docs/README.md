# SuperAutoplus 文档索引

本目录是项目文档的事实源。文档按“架构 -> API -> 功能 -> 开发/部署/测试 -> 源码索引”的层级维护，内容以当前代码实现为准。

## 文档层级

- 架构设计
  - [系统架构总览](architecture/overview.md)
  - [后端架构](architecture/backend.md)
  - [前端架构](architecture/frontend.md)
  - [数据模型](architecture/data-model.md)
  - [平台与 Provider 体系](architecture/providers-and-platforms.md)
- API 参考
  - [HTTP API 参考](api/http-api.md)
- 功能说明
  - [任务与注册流程](features/tasks-and-registration.md)
  - [公开客户页面](features/public-client-pages.md)
  - [IDP Team Automation](features/idp-team-automation.md)
- 开发、部署与测试
  - [开发指南](development/setup.md)
  - [服务器与 Docker 部署](deployment/server.md)
  - [验证与测试](testing/verification.md)
- 参考
  - [源码结构索引](reference/source-map.md)
- 变更说明
  - [2026-06-09 ITA 集成变更说明](changes/2026-06-09-idp-team-automation-integration.md)
  - [2026-06-09 ITA PR 描述稿](changes/2026-06-09-idp-team-automation-pr.md)
- 需求/执行记录
  - [Superpowers specs](superpowers/specs/)
  - [Superpowers plans](superpowers/plans/)

## 当前实现摘要

SuperAutoplus 是一个多平台 AI 账号自动注册、账号资产管理和 ChatGPT Plus 付款辅助系统。主应用由 FastAPI 后端、React/Vite 前端、SQLite/SQLModel 数据层和插件化平台/Provider 体系组成。

运行入口是 `main.py`。启动时会初始化数据库、加载平台插件、加载 Provider、启动任务运行时、验证码 Solver 管理器、调度器和生命周期管理器。后端 API 统一挂载在 `/api/*`；生产构建后，React SPA 由同一 FastAPI 服务托管。

公开客户页面目前有两个：

- `/pxl-plus`: 客户输入 CKD 和 ChatGPT Access Token / Session JSON，后端校验 CKD 后调用 Nerver PIX API 生成 ChatGPT Plus PIX 支付信息。
- `/luckmail-code`: 客户粘贴 `邮箱----token` 或单独 `tok_xxx`，后端调用 LuckMail 已购邮箱 token 查询接口获取验证码。

## 事实来源

- 主服务运行配置以 `.env.example`、`docker-compose.yml` 和 `compose.server.yml` 为准。
- Portal 配置以 `src/customer_portal_api/.env.example`、`src/customer_portal_api/docker-compose.yml`
  和 `src/customer_portal_api/compose.server.yml` 为准。
- HTTP 路由以 `main.py` 挂载的 `src/api/*.py` router 为准；接口说明集中在
  [HTTP API 参考](api/http-api.md)。
- 架构、Provider、平台能力和部署说明随代码变更同步维护；历史实验记录只保留在
  `docs/archives/`，不作为当前运行配置依据。

## 文档维护规则

- 新增或修改代码能力时，应同步更新对应架构、API、功能或开发文档。
- API 文档中的路径必须来自 `src/api/*.py` 的真实路由声明。
- Provider 和平台能力必须来自 `src/infrastructure/provider_definitions_repository.py`、`src/core/registry.py` 和 `src/platforms/*/plugin.py`。
- 不在文档中写入真实 API Key、账号 token、Cookie、Session JSON、服务器口令或本地运行时数据。
