# 2026-06-09 ITA 集成变更说明

## 变更概览

本次变更把 `IDP Team Automation` 以受控后台功能的形式集成到 SuperAutoplus 中，并明确限制在 safe mode。

交付内容包括：

- 新的后台管理页面
- 新的 ITA 相关 API
- 受控预检任务
- 受控同步任务
- Sub2API / Any2API 工件生成
- Sub2API 推送结果细化为 `created / updated / failed`
- 同步历史持久化
- 定时同步 / 受控策略
- 真实线上闭环验收

## 解决的问题

在本次集成前，项目里没有一套可控、可追踪、可审计的 ITA 托管方式。即使要复用 ITA 的能力，也缺少：

- 后台管理页面
- 统一账号资产接入方式
- 任务级日志和历史沉淀
- 工件下载闭环
- 推送结果的明确状态表达
- 受控定时策略

本次改动把这些能力接到了现有账号库、任务系统和前端管理台上。

## 主要能力

### 1. 受控管理页面

新增后台页面：

```text
/idp-team-automation
```

管理员现在可以在页面中：

- 维护 ITA 相关配置
- 导入已授权账号
- 选择同步动作
- 查看最近同步结果
- 查看同步历史
- 下载工件
- 维护定时同步策略

### 2. 安全导入授权凭据

新增授权导入接口，支持 callback URL 或 token JSON。

导入后会复用现有账号资产模型，不引入新的账号主表结构。

### 3. 受控同步任务

新增两个任务入口：

- `idp_team_automation_preflight`
- `idp_team_automation_sync`

同步任务会复用现有任务系统，因此天然具备：

- 后台任务状态管理
- 统一日志流
- 任务历史查询
- 与其他任务一致的执行约束

### 4. push 结果真实细化

Sub2API 推送不再只有笼统的成功/失败。

现在会给出真实语义：

- `created`
- `updated`
- `failed`

这让页面可以清楚表达每条账号是在远端新建、更新，还是推送失败。

### 5. 同步历史持久化

同步历史现在直接从持久化任务结果读取，不再依赖页面临时状态。

页面刷新后仍然可以继续查看：

- 工件列表
- 推送结果
- 警告
- 错误摘要

### 6. 定时同步 / 受控策略

新增后台策略配置和调度器联动能力，支持按固定间隔自动创建受控同步任务。

当前策略只允许：

- `all_managed`

这保证了范围简单、行为可预期。

## 安全策略

本次集成刻意不实现高风险路径。

明确不做的事情：

- 不自动执行上游仓库中的交互式批量脚本
- 不绕过用户授权流程
- 不自动获取未授权 OAuth 凭据
- 不把密钥直接写进任务 payload 或页面响应

当前 safe mode 约束是本次设计的核心前提，不是临时妥协。

## 代码影响面

### 后端

- `src/application/idp_team_automation.py`
- `src/api/idp_team_automation.py`
- `src/application/tasks.py`
- `src/application/task_commands.py`
- `src/api/task_commands.py`
- `src/core/scheduler.py`
- `src/infrastructure/config_repository.py`
- `main.py`

### 前端

- `frontend/src/pages/IdpTeamAutomation.tsx`
- `frontend/src/lib/idp-team-automation.ts`
- `frontend/src/App.tsx`
- `frontend/src/lib/i18n.ts`

### 测试

- `tests/test_idp_team_automation_safe.py`
- `frontend/tests/idp-team-automation.test.mjs`

## API 变化

新增接口：

- `GET /api/idp-team-automation/status`
- `GET /api/idp-team-automation/accounts`
- `GET /api/idp-team-automation/history`
- `GET /api/idp-team-automation/policy`
- `PUT /api/idp-team-automation/policy`
- `POST /api/idp-team-automation/authorized-import`
- `GET /api/idp-team-automation/artifacts/{task_id}`
- `POST /api/tasks/idp-team-automation/preflight`
- `POST /api/tasks/idp-team-automation/sync`

## UI 变化

页面现在新增：

- 最近同步结果卡片
- 工件“文件类型 + 下载按钮”布局
- push 状态徽标
- 同步历史列表
- 定时同步策略面板

push 状态颜色约定：

- `created`：绿色
- `updated`：橙色
- `failed`：红色

## 测试与验收

本次交付前完成了这些验证：

### 本地验证

- `python -m pytest tests/test_idp_team_automation_safe.py -q`
- `node frontend/tests/idp-team-automation.test.mjs`
- `npm --prefix frontend run build`

### 线上验收

已在部署环境做过真实闭环：

- 触发一次真实受控同步
- 真实产出一条 `updated`
- 真实产出一条 `failed`
- 页面上验证最近同步结果徽标
- 页面上验证同步历史徽标
- 刷新后确认历史仍存在
- 真实下载工件按钮验证

线上验收对应任务：

```text
task_1780930698259_64f14f
```

## 已知限制

- 当前策略范围只支持 `all_managed`
- 当前仍依赖管理员手工导入已授权凭据
- 当前不直接托管上游 ITA 的高风险自动流程
- 当前线上验收产物保存在本地 `artifacts/`，未纳入版本库

## 后续建议

后续如果继续演进，优先级建议如下：

1. 增加更细粒度的策略范围
2. 增加历史筛选、分页和按账号检索
3. 增强工件说明和下载审计
4. 补充更多非 happy path 的线上 smoke
