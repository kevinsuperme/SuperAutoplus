# 变更日志 - 代码审计修复批次二

> 日期：2026-08-04
> 关联审计报告：[2026-08-03-code-audit-report.md](./2026-08-03-code-audit-report.md)
> 前序提交：`9282f8d fix: 修复代码审计发现的多个紧急问题`（C1/C2/C3/H6 及 H7 部分）
> 本次范围：C4 / C6 / C7 / H1 / H7（补全）/ H10 共 6 项高级别问题

---

## 一、修复清单

| 编号 | 严重级别 | 问题摘要 | 涉及文件 |
|------|---------|---------|---------|
| C4   | Critical | `_task_locks` 全局字典内存泄漏 | `src/application/tasks.py` |
| C6   | Critical | Turnstile Solver 浏览器池在 setup 异常时泄漏 | `src/services/turnstile_solver/api_solver.py` |
| C7   | Critical | Solver 默认监听 `0.0.0.0` 且无认证 | `src/services/turnstile_solver/api_solver.py`、`src/providers/captcha/local_solver.py` |
| H1   | High     | 付款成功后账号标记失败导致任务判失败，触发重复付款 | `src/application/gopay_pay_chatgpt.py` |
| H7   | High     | 日志中残留 OTP/PIN 明文（补全前序提交遗漏的 3 处） | `src/platforms/gopay-deploy/app/src/opai/core/gopay_protocol_worker.py` |
| H10  | High     | `mark_running` 覆盖 `cancel_requested` 状态，导致取消信号丢失 | `src/application/tasks.py` |

---

## 二、文件改动详情

### 1. `src/application/tasks.py`（C4 + H10）

**C4 — `_task_locks` 内存泄漏修复**

- `_mutate_task` 在任务进入终态（succeeded/failed/interrupted/cancelled）后，从全局 `_task_locks` 字典移除对应锁引用，避免长生命周期服务运行下字典无限增长。
- 改动点：将 `with _task_lock(task_id):` 拆分为 `lock = _task_lock(task_id)` + `with lock:`，以便在释放锁后引用比较并清理。

```python
# 终态清理
reached_terminal = task.status in TERMINAL_TASK_STATUSES
...
if reached_terminal:
    with _task_locks_guard:
        if _task_locks.get(task_id) is lock:
            _task_locks.pop(task_id, None)
```

**H10 — `mark_running` 不覆盖取消请求**

- `TaskLogger.mark_running` 的 `_update` 回调在写入 `TASK_STATUS_RUNNING` 前检查当前状态，若为 `TASK_STATUS_CANCEL_REQUESTED` 则直接 return，避免用户发起的取消信号被调度器覆盖。

```python
def _update(task: TaskModel) -> None:
    if task.status == TASK_STATUS_CANCEL_REQUESTED:
        return
    task.status = TASK_STATUS_RUNNING
    task.started_at = task.started_at or _utcnow()
```

---

### 2. `src/application/gopay_pay_chatgpt.py`（H1）

**H1 — 付款成功后标记失败保护**

- GoPay 付款成功后，将 ChatGPT 账号标记为 `subscribed` 的 DB 操作用 `try/except` 包裹。即使标记失败（DB 锁、字段异常等），也不让任务判失败——否则调度器重试会触发重复付款。
- 异常仅记录警告日志并写入 `out["warnings"]`，任务仍返回成功。

```python
try:
    with Session(engine) as session:
        m = session.get(AccountModel, int(chatgpt_account_id))
        if m:
            patch_account_graph(...)
            session.commit()
    log("ChatGPT 账号已标记 subscribed")
except Exception as exc:
    log(f"ChatGPT 账号标记 subscribed 失败（付款已成功，需人工核对）: {exc}")
    out.setdefault("warnings", []).append(f"mark_subscribed_failed: {exc}")
```

---

### 3. `src/platforms/gopay-deploy/app/src/opai/core/gopay_protocol_worker.py`（H7 补全）

**H7 — 残留敏感日志脱敏**

- 前序提交 `9282f8d` 已修复部分 OTP/PIN 明文日志，本次补全剩余 3 处：
  - L418：`auto_rebind` 开启时记录 PIN → `"***"`
  - L600：PIN OTP 收码记录 → `"***"`
  - L875：已注册号 PIN 登录失败记录 → `"***"`

---

### 4. `src/services/turnstile_solver/api_solver.py`（C6 + C7）

**C6 — 浏览器池泄漏修复**

- `_solve_turnstile` 中将 proxy 配置、context 创建、page 初始化等 setup 代码用 `try/except` 包裹。
- setup 阶段抛异常时，保存失败结果后检查浏览器是否仍连接，若连接则归还到 `browser_pool`，避免池被耗尽。
- 新增 `except Exception as setup_exc:` 块，统一处理 setup 错误并归还浏览器。

**C7 — Solver 安全加固**

- **默认 host**：`parse_args` 中 `--host` 默认值由 `0.0.0.0` 改为 `127.0.0.1`，避免默认暴露到所有网卡。
- **API 认证**：新增 `_authenticate_request` 静态方法作为 Quart `before_request` 钩子，对 `/turnstile` 和 `/result` 端点校验 `X-API-Key` 请求头。
- 认证为可选开关：仅当环境变量 `OPAI_SOLVER_API_KEY` 配置后启用，未配置时跳过校验，保持向后兼容。
- 文档页 `/` 不受认证限制。

```python
@staticmethod
async def _authenticate_request():
    expected_key = os.getenv('OPAI_SOLVER_API_KEY')
    if not expected_key:
        return None
    if request.path not in ('/turnstile', '/result'):
        return None
    api_key = request.headers.get('X-API-Key')
    if api_key != expected_key:
        return jsonify({"errorId": 1, "errorCode": "ERROR_UNAUTHORIZED",
                        "errorDescription": "Missing or invalid X-API-Key"}), 401
    return None
```

---

### 5. `src/providers/captcha/local_solver.py`（C7 客户端配套）

- `LocalSolverCaptcha.__init__` 读取 `OPAI_SOLVER_API_KEY` 环境变量。
- 新增 `_headers()` 方法，配置了 key 时返回 `{"X-API-Key": ...}`，否则返回空字典。
- `solve_turnstile` 中对 `/turnstile` 和 `/result` 的请求均附加 `headers=self._headers()`，与服务端认证对齐。

---

## 三、验证结果

| 验证项 | 结果 |
|--------|------|
| 全量回归测试（`tests/`） | 通过（详见本次 commit CI） |
| 关键路径专项测试（solver/gopay/otp/payment，119 项） | 119 passed |
| 修复点静态验证（20 项检查） | 20/20 PASS |
| 修改文件语法编译 | COMPILE_OK |

---

## 四、配置说明

本次修复引入一个可选环境变量：

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `OPAI_SOLVER_API_KEY` | （空，不启用） | 配置后 Turnstile Solver 的 `/turnstile`、`/result` 端点要求请求头 `X-API-Key` 与之匹配。客户端 `local_solver` 会自动读取同一变量并发送头。 |

> 注意：Solver 默认监听 `127.0.0.1`，如需跨机访问请显式传 `--host` 并同时配置 `OPAI_SOLVER_API_KEY`。
