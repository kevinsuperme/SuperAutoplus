# IDP Team Automation

## 目标定位

`IDP Team Automation` 现在以“受控后台任务 + 管理页面”的形式集成在主应用中，入口页面为：

```text
/idp-team-automation
```

它不是直接把上游 ITA 仓库原样嵌入，也不会开放任何高风险自动化入口。当前实现只覆盖：

- 已授权凭据导入
- 受管账号列表
- 受控同步任务
- Sub2API / Any2API 工件导出
- 可选 Sub2API 推送
- 同步历史持久化
- 定时同步 / 受控策略

## 安全边界

当前集成固定运行在 safe mode，核心限制如下：

- 只接受用户自己完成 OAuth 后拿到的 callback URL 或 token JSON。
- 后台不会执行 `run_batch_tui.py` 或 `run_idp_codex.py`。
- 任务只处理已导入授权凭据的 ChatGPT 账号。
- 不会在任务 payload、同步结果、日志和历史接口中回显 IDP Token、Sub2API 密码、OAuth token 明文。
- 同步调度只会创建受控任务，不会绕过后台权限模型。

## 页面结构

前端页面组件：

```text
frontend/src/pages/IdpTeamAutomation.tsx
```

页面主要分为四块：

1. 本地配置
2. 已授权凭据导入
3. 受控同步与最近同步结果
4. 定时同步 / 受控策略
5. 同步历史
6. 受管账号列表

页面支持：

- 查看仓库状态、受管账号数、可同步账号数
- 导入 callback URL / token JSON
- 选择部分账号或全部可同步账号
- 勾选导出 Sub2API 工件、导出 Any2API 工件、推送到 Sub2API
- 查看最近一次同步结果
- 从最近结果和历史记录中下载工件
- 查看推送结果徽标
- 查看和保存定时策略

## 后端组成

后端业务实现位于：

```text
src/application/idp_team_automation.py
```

HTTP 路由位于：

```text
src/api/idp_team_automation.py
```

任务入口复用统一任务系统：

```text
POST /api/tasks/idp-team-automation/preflight
POST /api/tasks/idp-team-automation/sync
```

## 已授权凭据导入

导入接口：

```text
POST /api/idp-team-automation/authorized-import
```

支持两类输入：

- callback URL
- token JSON

导入成功后会把账号标记为受管账号，并写入：

- `overview.idp_team_automation.managed`
- `overview.idp_team_automation.managed_source`
- `overview.idp_team_automation.imported_at`
- `overview.idp_team_automation.last_payload_source`

同时把 OAuth 凭据写入现有账号资产模型，而不是新建独立表。

## 受控同步任务

同步任务入口：

```text
POST /api/tasks/idp-team-automation/sync
```

请求支持：

- `account_ids`
- `export_sub2api`
- `export_any2api`
- `push_sub2api`

执行逻辑：

1. 从现有账号库中筛选受管账号
2. 过滤出具备 access token 或 refresh token 的可同步账号
3. 生成导出工件
4. 可选推送到 Sub2API
5. 把结果写入任务结果和账号 overview

## Sub2API 推送语义

当前推送支持三类结果：

- `created`
- `updated`
- `failed`

规则如下：

- 当账号没有 `sub2api_remote_id` 时，使用 `POST /admin/accounts`，结果记为 `created`
- 当账号已有 `sub2api_remote_id` 时，使用 `PUT /admin/accounts/{id}`，结果记为 `updated`
- 某一条账号推送失败时，批次不会整体中断，该条结果单独记为 `failed`

每条推送结果会写入：

- `status`
- `provider`
- `email`
- `account_id`
- `remote_id`
- `remote_action`
- `error`（失败时）

同时会更新账号 overview：

- `last_synced_at`
- `sub2api_remote_id`
- `sub2api_last_status`
- `last_sync_error`

## 工件下载

工件下载接口：

```text
GET /api/idp-team-automation/artifacts/{task_id}?filename=...
```

下载范围被限制在：

```text
<artifact_root>/<task_id>/<filename>
```

后端会校验：

- `task_id` 非空
- `filename` 必须是文件名本身，不能带路径穿越
- 目标文件必须在任务目录内且存在

## 同步历史

历史接口：

```text
GET /api/idp-team-automation/history?limit=N
```

历史数据直接来自已有 `tasks` 表中：

- `type == idp_team_automation_sync`
- `task.result_json.data`

因此同步历史具备以下特点：

- 页面刷新后仍然存在
- 工件下载仍然可用
- 可以显示完整的推送结果和警告
- 不需要额外新建一套历史表

## 定时同步 / 受控策略

策略接口：

```text
GET /api/idp-team-automation/policy
PUT /api/idp-team-automation/policy
```

当前只支持：

- 策略范围 `all_managed`

可配置项包括：

- 是否启用
- 间隔分钟
- 是否导出 Sub2API 工件
- 是否导出 Any2API 工件
- 是否推送到 Sub2API

调度器每分钟检查一次策略是否到期；满足条件时会自动创建一条同步任务，`trigger_source` 记为 `scheduled`。

## 最近结果与历史徽标

前端推送结果徽标映射在：

```text
frontend/src/lib/idp-team-automation.ts
```

当前规则：

- `created` -> `已创建` -> success
- `updated` -> `已更新` -> warning
- `failed/error/remote_failed` -> `失败` -> danger

这些徽标同时用于：

- 最近同步结果
- 同步历史

## 测试与验证

后端测试：

```text
tests/test_idp_team_automation_safe.py
```

覆盖内容包括：

- 配置键白名单
- 预检任务 payload 脱敏
- 授权导入
- 安全同步
- Sub2API updated 语义
- push failed 不阻塞整批
- 历史接口
- 策略接口
- 调度器触发逻辑
- 工件下载路径校验

前端测试：

```text
frontend/tests/idp-team-automation.test.mjs
```

覆盖内容包括：

- 工件类型显示文案
- 最近结果摘要文案
- 空状态文案
- push 徽标映射

线上真实验收产物保存在本地：

```text
artifacts/browser-check/idp-updated-failed-sync-report.json
artifacts/browser-check/idp-updated-failed-page-verify.json
```

这些产物不属于仓库提交内容，但可作为部署后的人工验收证据。
