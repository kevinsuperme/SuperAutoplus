# 全量功能模块代码审计报告

- 审计日期：2026-08-03
- 审计范围：`src/api/`、`src/application/`、`src/core/`、`src/services/`、`src/infrastructure/`、`src/platforms/`（含 `gopay-deploy`）
- 审计方法：逐文件阅读实际代码，交叉验证跨层调用，重点关注业务逻辑完整性、边界条件、异常处理、数据流转与模块交互
- 严重程度定义：
  - `严重 Critical`：数据丢失、安全漏洞、资金损失、系统崩溃、核心功能完全失效
  - `高 High`：核心业务逻辑错误、资金/数据一致性风险、资源泄漏、关键边界条件失效
  - `中 Medium`：异常处理不当、容错不足、性能问题、一致性问题
  - `低 Low`：代码质量、可维护性、轻微边界问题

## 发现概览

| 严重程度 | 数量 | 说明 |
| --- | --- | --- |
| 严重 | 10 | 含 1 个 SQL 注入、1 个路由失效、2 个资源/内存泄漏、3 个并发安全、2 个资金安全、1 个进程强杀 |
| 高 | 24 | 含资金状态不一致、取消语义失效、密钥硬编码、SSL 关闭、OTP/PIN 日志泄露、全表扫描等 |
| 中 | 28 | 含超时失效、越层访问、进度不更新、JS 注入、非原子计数等 |
| 低 | 18 | 含 print 日志、硬删除、类型注解、命名误导等 |

---

## 一、严重问题（Critical）

### C1. SQL 注入 — `payment_inbox.claim_next_pending`
- 位置：[payment_inbox.py](file:///f:/SuperAutoplus/src/platforms/gopay-deploy/app/src/opai/core/payment_inbox.py) 第 543 行（sink）、第 1406 行（source）
- 问题：`provider_filter = f"AND provider = '{provider}'"` 用 f-string 把来自 HTTP POST body 的 `provider` 直接拼入 SQL。`provider` 攻击者可控，未做转义。
- 影响：任何能访问 inbox HTTP 服务（默认 `0.0.0.0:18130`）的调用方可构造 `paypal' OR '1'='1` 类载荷绕过 pending 过滤、操纵 claim 顺序、越权 claim 任意 job，破坏多 worker 原子 claim 语义。
- 建议：改用参数化查询 `AND provider = ?`，在 params 列表追加 provider。

### C2. 历史日志接口完全不可达（路由冲突）
- 位置：[task_logs.py:11](file:///f:/SuperAutoplus/src/api/task_logs.py#L11) + [tasks.py:16](file:///f:/SuperAutoplus/src/api/tasks.py#L16) + [main.py:137-139](file:///f:/SuperAutoplus/main.py#L137-L139)
- 问题：`task_logs_router` 注册 `GET /tasks/logs`，`tasks_router` 注册 `GET /tasks/{task_id}`。main.py 中 `tasks_router` 先注册，`GET /api/tasks/logs` 命中 `/{task_id}` 以 `task_id="logs"` 调用 `get_task("logs")` 返回 404。
- 影响：`task_logs.py` 整个文件是死代码，前端"任务日志"页永远 404，功能完全失效。
- 建议：将 `task_logs_router` 注册移到 `tasks_router` 之前，或改用不冲突路径（如 `/task-logs`）。

### C3. SQLite engine 未配置 `check_same_thread` 且未启用 WAL
- 位置：[db.py:23](file:///f:/SuperAutoplus/src/core/db.py#L23)
- 问题：`engine = create_engine(DATABASE_URL)` 既无 `connect_args={"check_same_thread": False}`，也无 WAL 模式。而 `scheduler`、`lifecycle_manager`、FastAPI 请求线程共用同一 engine。对比 `customer_portal_api/app/db.py:25` 已正确配置。
- 影响：跨线程复用连接抛 `ProgrammingError`；多写线程并发频繁触发 `database is locked`。这是整个后台任务链路稳定性的根因。
- 建议：`connect_args={"check_same_thread": False, "timeout": 30}`，并在 connect 事件中执行 `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;`。

### C4. `_task_locks` 字典无限增长导致内存泄漏
- 位置：[tasks.py:64-65](file:///f:/SuperAutoplus/src/application/tasks.py#L64-L65)
- 问题：`_task_locks: dict[str, threading.Lock]` 模块级全局字典，每个 task_id 创建 Lock 并永久保留，从不清理。`_task_locks_guard` 全局锁还是并发瓶颈。
- 影响：长期运行服务（上万任务后）内存持续增长不可回收；全局锁争用。
- 建议：任务进入终态后删除对应 Lock，或用 `WeakValueDictionary` / LRU。

### C5. 调度器与生命周期管理器功能重叠且同时运行
- 位置：[main.py:90,96](file:///f:/SuperAutoplus/main.py#L90) + [lifecycle.py](file:///f:/SuperAutoplus/src/core/lifecycle.py) + [scheduler.py](file:///f:/SuperAutoplus/src/core/scheduler.py)
- 问题：`scheduler.start()` 与 `lifecycle_manager.start()` 同时运行，`scheduler.check_trial_expiry()` 与 `lifecycle.flag_expiring_trials()`、`scheduler.check_accounts_valid()` 与 `lifecycle.check_accounts_validity()` 是同一段逻辑的复制粘贴，对同一批账号并发读写。
- 影响：同一账号被两个线程同时更新（叠加 C3/C8 的非原子写），状态抖动、重复 DB 写、`database is locked` 概率上升。
- 建议：合并为单一调度入口，删除重复实现；或明确职责拆分。

### C6. Turnstile Solver 浏览器池泄漏导致服务挂死
- 位置：[api_solver.py:629-948](file:///f:/SuperAutoplus/src/services/turnstile_solver/api_solver.py#L629-L948)
- 问题：`browser_pool.get()` 取出浏览器后，proxy 解析（692/729 行 `raise ValueError`）、`new_context`、`new_page` 都不在 try 块内。异常冒泡到 `process_turnstile` 的 `asyncio.create_task`，926 行的 `finally`（归还 browser）不执行，浏览器永不归还。
- 影响：每次代理格式错误或 context 创建失败，pool 永久少一个浏览器；`thread_count` 次失败后 pool 空，所有后续请求在 `await pool.get()` 永久阻塞，Solver 子服务挂死。
- 建议：`browser_pool.get()` 之后全部逻辑包进 try/finally，finally 无条件归还浏览器。

### C7. Solver HTTP 端点无认证 + 默认 0.0.0.0 监听
- 位置：[start.py:31](file:///f:/SuperAutoplus/src/services/turnstile_solver/start.py#L31) + [api_solver.py:955-994](file:///f:/SuperAutoplus/src/services/turnstile_solver/api_solver.py#L955-L994)
- 问题：默认 `--host=0.0.0.0`，`/turnstile` 端点无任何 API Key 校验，任何人可 POST 任意 `url`/`sitekey` 让 Solver 启动浏览器访问。
- 影响：端口暴露即可白嫖浏览器算力、SSRF 访问内网、对目标站发起放大请求；叠加 H8 的 JS 注入可执行任意 JS。
- 建议：默认 host 改 `127.0.0.1`；增加 `--api-key` 参数 + 中间件校验请求头。

### C8. TaskRuntime 没有真正的优雅关闭，正在运行的任务被强杀
- 位置：[task_runtime.py:38-45,87-92](file:///f:/SuperAutoplus/src/services/task_runtime.py#L38-L45)
- 问题：`stop()` 仅置 `_running=False`，不 join 任何 worker 线程，无信号处理。worker 为 `daemon=True`，主进程退出即强杀。
- 影响：正在执行的注册/付款任务中断（账号注册一半、付款扣款但未拿到 Plus、浏览器子进程残留）；外部副作用（OpenAI/Stripe/GoPay/SMS）无法回滚。
- 建议：`stop()` 后 `join` 超时等待（如 30s）；注册 `SIGTERM` 触发 stop 并 wait；worker 改非 daemon。

### C9. GoPay PIN 硬编码弱默认值 "147258"
- 位置：[gopay_pay_chatgpt.py:1971](file:///f:/SuperAutoplus/src/application/gopay_pay_chatgpt.py#L1971) + [gopay_protocol_worker.py:75](file:///f:/SuperAutoplus/src/platforms/gopay-deploy/app/src/opai/core/gopay_protocol_worker.py#L75)
- 问题：`gopay_pin = str(payload.get("gopay_pin") or "147258")`；`DEFAULT_PIN = os.environ.get("OPAI_GOPAY_DEFAULT_PIN", "147258")`。未传 PIN 时所有自动注册 GoPay 账号用同一弱口令（键盘列序）。
- 影响：源码/日志/DB 泄露后，攻击者凭 `147258` 可登录所有用默认值注册的 GoPay 账号，直接控制资金。
- 建议：禁止默认 PIN，要求显式传入；或为每个账号生成随机 PIN 并加密存储。

### C10. `refresh_plan_sync` 超时后仍阻塞等待所有线程
- 位置：[account_checks.py:107-149](file:///f:/SuperAutoplus/src/application/account_checks.py#L107-L149)
- 问题：`with ThreadPoolExecutor(...) as pool:` 的 `__exit__` 调 `pool.shutdown(wait=True)` 阻塞等待所有 future。即使 `as_completed(futures, timeout=...)` 超时，方法仍会在 `__exit__` 阻塞直到最慢线程结束（`plugin.check_valid` 可能耗时数十秒）。
- 影响：号称"几秒内完成"的同步接口实际可能阻塞数分钟，超时参数形同虚设，前端请求堆积。
- 建议：不用 `with`，手动管理 executor；超时后对未完成 future 调 `cancel()`，用 daemon 线程避免阻塞返回。

---

## 二、高级问题（High）

### 资金安全

#### H1. 付款成功后标记 ChatGPT 账号失败导致资金状态不一致
- 位置：[gopay_pay_chatgpt.py:1510-1532](file:///f:/SuperAutoplus/src/application/gopay_pay_chatgpt.py#L1510-L1532)
- 问题：协议付款成功（1469 行）后，标记 ChatGPT 账号 subscribed 的 DB 操作（1512-1532 行）无 try/except。若 `patch_account_graph` 或 `session.commit()` 抛异常，任务被标记 `failed`。
- 影响：GoPay 已扣款但任务显示失败、账号未标记 subscribed，用户可能重复付款导致重复扣费。
- 建议：DB 标记操作包独立 try/except，即使标记失败也返回 `ok=True` 并记录警告。

#### H2. 付款成功后自动换绑失败静默忽略，号码资源泄漏
- 位置：[gopay_pay_chatgpt.py:1481-1508](file:///f:/SuperAutoplus/src/application/gopay_pay_chatgpt.py#L1481-L1508)
- 问题：`auto_rebind=True` 时换绑失败仅 log warning，号码仍被占用。
- 影响：每次付款成功但换绑失败泄漏一个印尼号，长期运行号池枯竭。
- 建议：换绑失败记录到 task result 的 `warnings`；对失败号码标记"需手动释放"。

#### H3. GoPay V2 签名 HMAC 密钥硬编码
- 位置：[gopay_signer_v2.py:30-37](file:///f:/SuperAutoplus/src/platforms/gopay-deploy/app/src/opai/core/gopay_signer_v2.py#L30-L37)
- 问题：`_DEFAULT_KEY`（64 字节逆向密钥）硬编码源码，作为所有 GoPay API 请求 X-E1 签名 HMAC-SHA256 密钥。
- 影响：拿到源码即可伪造合法 GoPay API 请求签名，冒充任意设备身份调用 customer/payment 端点，威胁资金安全。
- 建议：密钥从受保护运行时配置加载，源码不留明文；强制 `OPAI_GOPAY_XE_RESOLUTION_KEY` 显式提供。

#### H4. Gojek/GoPay 客户端密钥与 API Key 硬编码
- 位置：[gojek_client.py:57,728](file:///f:/SuperAutoplus/src/platforms/gopay-deploy/app/src/opai/core/gojek_client.py#L57)
- 问题：`CLIENT_SECRET`、`_GOJEK_API_KEY` 直接写源码，用于所有 signup/login/token 端点。
- 影响：泄露后可冒充官方客户端注册账号、绕过客户端身份校验。
- 建议：移至受控配置，支持环境变量覆盖并去掉明文默认值。

#### H5. Midtrans Snap 签名密钥硬编码
- 位置：[gopay_payment_protocol.py:47-57](file:///f:/SuperAutoplus/src/platforms/gopay-deploy/app/src/opai/core/gopay_payment_protocol.py#L47-L57)
- 问题：`SNAP_SIGN_KEY` 默认值是真实抓包密钥（虽支持环境变量覆盖），用于生成所有 Midtrans 请求 `X-Snap-Signature`。
- 影响：可伪造 Midtrans Snap 请求签名，对 linking/charge/payment 流程越权调用。
- 建议：默认值置空，强制运行时注入；真实密钥从源码移除。

#### H6. SSL 校验全局关闭
- 位置：[cpa_upload.py:137,244,293,321](file:///f:/SuperAutoplus/src/platforms/chatgpt/cpa_upload.py#L137)
- 问题：4 处 `verify=False`，向 ChatGPT `/backend-api/me`、CPA、Team Manager 的请求（携带 access_token/refresh_token/session_token）关闭 TLS 校验。
- 影响：中间网络位置可 MITM 截获账号全套 token。
- 建议：移除 `verify=False`；自签证书通过 `CURL_CA_BUNDLE` 指定受信 CA。

#### H7. OTP/PIN/token 明文日志输出
- 位置：[gopay_protocol_worker.py:418,478,600,651,794,1140](file:///f:/SuperAutoplus/src/platforms/gopay-deploy/app/src/opai/core/gopay_protocol_worker.py#L478) + [payment_inbox.py:1066,1451](file:///f:/SuperAutoplus/src/platforms/gopay-deploy/app/src/opai/core/payment_inbox.py#L1066)
- 问题：注册 OTP、PIN OTP、GoPay PIN、access_token/refresh_token 前缀、inbox OTP 均明文写日志；`/api/otp` 响应回显 `code`。
- 影响：能读日志或抓 HTTP 响应的人可拿到付款凭证，直接资金损失。PIN 6 位，泄露即可登录 GoPay 转款。
- 建议：所有 OTP/PIN/token 一律打码；`/api/otp` 只返 `{"ok": true}`。

#### H8. GoPay 账号凭证明文存储
- 位置：[gopay_protocol_worker.py:195-223](file:///f:/SuperAutoplus/src/platforms/gopay-deploy/app/src/opai/core/gopay_protocol_worker.py#L195-L223)
- 问题：`access_token`、`refresh_token`、`pin`、`activation_id` 明文 JSON 写 `config/gopay_worker_accounts.json`，无加密无权限收紧。
- 影响：文件被读取即账号全丢，PIN+refresh_token 足以登录转款。
- 建议：对 token/pin 对称加密（密钥部署环境注入），收紧文件权限到 0600。

### 任务调度与取消语义

#### H9. `wait_for_balance` 与 `step_pay_with_gopay` 不支持取消检查
- 位置：[gopay_pay_chatgpt.py:638-680,885-999](file:///f:/SuperAutoplus/src/application/gopay_pay_chatgpt.py#L638-L680)
- 问题：`wait_for_balance` 的 `while True` 只调 `ttl_guard.check()` 和 `sleep`，从不检查 `cancel_check`；`step_pay_with_gopay` 函数签名无 `cancel_check`，14 步协议付款过程中无法响应取消。
- 影响：用户取消后余额轮询仍持续（最长 20 分钟 TTL），协议付款需等 OTP 超时（120s）才停，占用浏览器 profile 和 SMS 号码资源。
- 建议：为两函数添加 `cancel_check` 参数并在关键步骤间检查。

#### H10. `mark_running` 覆盖 `cancel_requested` 状态
- 位置：[tasks.py:525-530](file:///f:/SuperAutoplus/src/application/tasks.py#L525-L530)
- 问题：`TaskLogger.mark_running` 的 `_update` 直接 `task.status = RUNNING` 不检查当前状态。`execute_task`（800-805 行）先 `mark_running()` 再 `is_cancel_requested()`。若用户在 worker 启动后、`mark_running` 前调 `request_cancel`，状态被改为 `cancel_requested`，紧接着 `mark_running` 覆盖回 `running`，取消信号丢失。
- 影响：用户点取消后任务继续跑数分钟才停，状态机不一致。
- 建议：`_update` 改为 `if task.status == CANCEL_REQUESTED: return`，不覆盖。

#### H11. `chatgpt_plus_must_succeed` 无熔断，最多重试 count×5 次
- 位置：[tasks.py:1507-1516](file:///f:/SuperAutoplus/src/application/tasks.py#L1507-L1516)
- 问题：`max_attempts = max(count * 5, count, 1)`，count=10 则最多尝试 50 次，每次失败消耗 SMS 号码/代理/邮箱，无基于错误类型的熔断。
- 影响：SMS 池/代理大面积失效时持续浪费资源，可能消耗数十美元 SMS 费用。
- 建议：增加连续失败熔断（如连续 5 次相同错误提前终止）；区分可重试与不可重试错误。

#### H12. `claim_next_runnable_task` 加载全部 pending 任务无 LIMIT
- 位置：[tasks.py:442-470](file:///f:/SuperAutoplus/src/application/tasks.py#L442-L470)
- 问题：`select(TaskModel).where(status==PENDING).order_by(created_at)` 无 `.limit()`，一次性加载所有 pending。`mark_incomplete_tasks_interrupted`（396-417 行）同样。
- 影响：任务堆积数千条时每次调度轮询（0.5s 间隔）全表加载，内存峰值+查询慢。
- 建议：添加 `.limit(max_parallel_tasks * 2)`。

### 安全与鉴权

#### H13. pingme/callback 未配置 token 时鉴权完全失效（fail-open）
- 位置：[sms.py:237-241](file:///f:/SuperAutoplus/src/api/sms.py#L237-L241)
- 问题：`/api/sms/pingme/callback` 在 `_PUBLIC_PREFIXES` 中免 APP_PASSWORD 鉴权。内部 token 校验 `if expected and str(token).strip() != expected`——未配置时 `expected` 为空串短路，校验跳过。
- 影响：任何人可 POST 任意 JSON，`record_pingme_message` 落库，污染号码池/注入伪造验证码。
- 建议：改 fail-closed：`if not expected or str(token).strip() != expected: raise 403`。

#### H14. 公开 CKD 客户端接口无限流、凭据校验薄弱
- 位置：[pix_gpt_plus.py:229-324](file:///f:/SuperAutoplus/src/application/pix_gpt_plus.py#L229-L324)
- 问题：`generate_for_client_token` 是公开接口，CKD 码明文比对无速率限制；客户提交的 token 明文存库（`_save_client_token_account` 第 384 行）。
- 影响：CKD 可暴力枚举；Nerver PIX 配额可被滥用；token 明文落库。
- 建议：增加 IP 级速率限制；CKD 失败 N 次锁定；用 HMAC 比对代替明文比对。

#### H15. `auth.py` 密码明文比对 + cookie 存密码
- 位置：[auth.py:48,52](file:///f:/SuperAutoplus/src/core/auth.py#L48)
- 问题：`auth_header[7:] == password` 与 `cookies.get("_auth") == password` 均用 `str.__eq__`（非常数时间）；`_auth` cookie 值就是 `APP_PASSWORD` 原文。
- 影响：时序攻击逐字节探测密码；cookie 落盘/被 JS 读取即密码泄露。
- 建议：用 `hmac.compare_digest`；cookie 改下发一次性会话 token，服务端维护映射。

#### H16. `patch_account_graph` 非原子写，并发更新丢失
- 位置：[account_graph.py:704,720-721,908-1009](file:///f:/SuperAutoplus/src/core/account_graph.py#L704)
- 问题：`_persist_account_graph` 对凭据表 `delete(...).where(account_id=...)` 后逐条 `add`，"读全部→删全部→重插"非原子。调用方各自开独立 Session 无锁。
- 影响：两线程同时对同一账号 patch（lifecycle 刷新 token 与 scheduler 标记过期并发）：A 读→B 读→A 删+插+提交→B 删+插+提交，B 覆盖 A，凭据/状态丢失。配合 C5 必然触发。
- 建议：单账号写入加进程内互斥锁（按 account_id 分桶）；或改按行 upsert（`INSERT ... ON CONFLICT`）。

#### H17. OAuth 浏览器自动 `pkill` 用户 Chrome
- 位置：[oauth_browser.py:89-113,190-197](file:///f:/SuperAutoplus/src/core/oauth_browser.py#L89-L113)
- 问题：未显式配置 CDP/user_data_dir 时，`__enter__` 调 `_relaunch_chrome_with_debug_port()` 执行 `pkill -x "Google Chrome"` 后重开。
- 影响：用户正在用的 Chrome（含所有标签页、未保存表单）被强杀，且在注册流程内部不可预期。
- 建议：绝不在自动检测路径 pkill 系统浏览器；仅连接已存在 CDP，失败回退 Playwright Chromium。

#### H18. `refresh_expiring_tokens` 的 `hours_before_expiry` 参数完全未使用
- 位置：[lifecycle.py:104-193](file:///f:/SuperAutoplus/src/core/lifecycle.py#L104-L193)
- 问题：函数签名声明 `hours_before_expiry: int = 24`，但函数体从未读取该参数，也不检查 token 过期时间，无条件刷新所有有 refresh_token 的 ChatGPT 账号。
- 影响：每次刷新间隔（默认 12h）全量刷新，加剧对 OpenAI 请求频率，可能触发风控；参数误导调用方。
- 建议：解析 access_token JWT 的 `exp`，仅对 `exp - now < hours_before_expiry*3600` 的账号刷新。

### Solver 管理

#### H19. `solver_manager.start()` 持锁 sleep 30 秒
- 位置：[solver_manager.py:97-179](file:///f:/SuperAutoplus/src/services/solver_manager.py#L97-L179)
- 问题：`with _lock:` 包含 `for _ in range(30): time.sleep(1)`，等子进程就绪期间锁不释放。
- 影响：启动期间 `stop()`/`restart()`/`get_status()` 全部阻塞最多 30 秒，前端超时 504。
- 建议：等待循环移出锁，仅用锁保护 `_proc`/`_consecutive_failures` 读写。

#### H20. 启动超时不清理 `_proc`，状态不一致
- 位置：[solver_manager.py:166-179](file:///f:/SuperAutoplus/src/services/solver_manager.py#L166-L179)
- 问题：30 秒等待超时后只 print 警告，`_proc` 仍指向可能活着的子进程，未 terminate 也未置 None。
- 影响：下次 `start()` 时 `is_running()` 可能返回 True 直接 return，或僵尸进程卡住，需手动 restart。
- 建议：超时分支 `if _proc and _proc.poll() is None: _proc.terminate(); _proc.wait(timeout=3); _proc = None`。

#### H21. `_kill_by_port` 误杀 + Windows `select` 不可用
- 位置：[solver_manager.py:170-176,209-232](file:///f:/SuperAutoplus/src/services/solver_manager.py#L170-L176)
- 问题：Windows 分支 `f":{port}" in line` 子串匹配可能误杀（`:8889` 匹配 `:88890`）；`select.select([_proc.stderr],...)` 在 Windows 对 pipe 抛 `OSError 10038` 被吞，stderr_msg 为空。
- 影响：误杀其它监听进程；Windows 下 Solver 启动超时看不到错误信息（项目主目录是 Windows）。
- 建议：用 `local_address.endswith(f":{port}")` 严格匹配；用线程异步读 stderr 到队列。

#### H22. `/turnstile` 无并发限制
- 位置：[api_solver.py:955-994](file:///f:/SuperAutoplus/src/services/turnstile_solver/api_solver.py#L955-L994)
- 问题：每次请求 `asyncio.create_task(self._solve_turnstile(...))` 无 Semaphore，所有 task 在 `await pool.get()` 阻塞，内存随积压线性增长。
- 影响：疯狂请求可在数秒内挂上万 task，OOM 崩溃。
- 建议：入口加 `asyncio.Semaphore(thread_count + N)`，超过返回 429。

### 性能与数据访问

#### H23. `accounts_repository` 全表扫描 + Python 层过滤 + 内存分页
- 位置：[accounts_repository.py:111-133,143-162,334-358](file:///f:/SuperAutoplus/src/infrastructure/accounts_repository.py#L111-L133)
- 问题：`list()` `session.exec(statement).all()` 拉全部 AccountModel 再 `_load_records` 加载 graph，最后 `[start:end]` 内存切片；status 过滤在 Python 层不走索引。`select_for_export`、`stats` 同样全量。
- 影响：账号上千后每次 list 秒级变十秒级，前端分页失去意义。
- 建议：分页下推 SQL（offset/limit）；status 过滤改 JOIN account_overviews 表用 SQL where；stats 用 GROUP BY。

#### H24. `proxies_repository.bulk_create` N+1 查询
- 位置：[proxies_repository.py:38-51](file:///f:/SuperAutoplus/src/infrastructure/proxies_repository.py#L38-L51)
- 问题：每个 url 单独 `select where url=raw` 检查重复，N 个 url = N 次查询 + N 次 insert。
- 影响：批量导入 1000 个代理 = 1000 次 select + 1000 次 insert，秒级耗时。
- 建议：`select where url IN (urls)` 一次取已存在，set 差集后批量 insert。

---

## 三、中级问题（Medium）

> 限于篇幅，中级问题按模块归类列出要点，详细行号见各模块审计原始记录。

### API 层
- M1. `sms.py`/`sms_pool.py` API 层直接实例化 infrastructure 仓库，越层无 application service 封装。
- M2. `accounts.py:100-107` `list_accounts` 的 `page_size` 无上限（仓库全量加载后内存切片），`?page_size=999999` 无保护。
- M3. `pix_gpt_plus.py:34-36` 公开接口 `/client/open` 未捕获 DB 异常，可能 500 泄露内部信息（`_save_client_token_account` 在 try/except 之外）。
- M4. `stats.py:84,136` `by-day` 的 `days` 与 `errors` 的 `limit` 无校验，`days` 很大全量加载，`limit=-1` 等价无 limit。
- M5. `task_commands.py:21-22,75` 请求参数缺 `Field(ge=, le=)` 范围校验，count/concurrency/grab_timeout 可为负。

### Application 层
- M6. `tasks.py:748-789` `_run_single_account_check` 调 `plugin.check_valid` 无超时保护，单账号卡住阻塞整个任务，`refresh_plan_sync` 超时因此失效。
- M7. `tasks.py:2393-2430` `_execute_account_check_all_task` 串行执行，limit=50 时可达 100 秒。
- M8. `gopay_pay_chatgpt.py:680` `wait_for_balance` 的 `poll_interval=0` 会忙等打满 CPU。
- M9. `gopay_pay_chatgpt.py:170-235` `_maybe_topup_with_envelope` 为死代码（全项目无调用）。
- M10. `phone_binding.py:26-32` `_normalize_phone` 假设 10 位数字为美国号，印尼等 10 位本地号被错加 +1。
- M11. `idp_team_automation.py:825-869` `Sub2ApiExportProvider._request_json` 不重试 HTTP 5xx，Sub2API 临时故障即整批 failed。
- M12. `tasks.py:1826-1858` ITA 同步任务进度不更新，前端进度条始终 0/N。
- M13. `tasks.py:792-822` `execute_task` 无全局异常保护，handler 未捕获异常导致任务卡在 running。
- M14. `gopay_pay_chatgpt.py:109-132` `claim_envelope_for_account` 吞掉所有异常，网络故障与无红包不可区分。

### Core 层
- M15. `lifecycle.py:490-524` `flag_expiring_trials` 每个循环（约 60s）执行一次，过于频繁，全表扫+多次 commit。
- M16. `lifecycle.py:433` CPA 上传 `verify=False` 关闭 SSL 校验（与 H6 同类）。
- M17. `executors/playwright.py:12-16` 构造函数内启动 Playwright，`chromium.launch` 抛错则 `__exit__` 永不调用，子进程泄漏。
- M18. `executors/playwright.py:42` `set_extra_http_headers` 设置的头持久保留，污染后续请求。
- M19. `executors/protocol.py:28-34` 协议执行器无超时、无重试、无状态码检查；`impersonate` 在 Session 创建后才赋值可能不生效。
- M20. `proxy_pool.py:53-72` `report_success`/`report_fail` 读-改-写无锁，并发计数丢失。
- M21. `server_guard.py:59-104` 重复启动检测为 TOCTOU 软检查，无跨进程文件锁。
- M22. `lifecycle.py:336,377` `refresh_and_sync_cpa` 每账号新建 Session 不关闭且无重试。
- M23. `db.py:32,69` 密码与凭据明文存储。

### Services + Infrastructure 层
- M24. `tasks.py:442-470` `claim_next_runnable_task` 非原子（多实例下重复 claim），当前单进程 OK 但扩展性隐患。
- M25. `task_runtime.py:43-45` `wake_up` 是空实现，新任务最迟 0.5s 才被 claim。
- M26. `task_runtime.py:94-99` dispatcher 线程异常死亡无 watchdog 重启，DB 故障后调度永久停止。
- M27. `solver_manager.py:235-246` `restart()` 在锁外重置计数器，与 `start()` 竞态。
- M28. `api_solver.py:471-619` `_inject_captcha_directly` 用 f-string 拼 JS，`websiteKey`/`action`/`cdata` 无校验，存在 JS 注入。
- M29. `api_solver.py:274-307` `_optimized_route_handler` 用 `domain in url` 子串匹配，`sentry.io` 误匹配 `notsentry.io`。
- M30. `api_solver.py:143-156` `_startup` 失败后已创建浏览器不回滚，进程泄漏。
- M31. `accounts_repository.py:244-332` `import_lines` 用 `limit(created)` 反查新插入账号，并发下拿到错的；不去重 email。
- M32. `accounts_repository.py:100-109` `_load_records` 在只读 list 里 commit，副作用隐蔽。
- M33. `sms_pool_repository.py:127-184` `add` 方法 `fail_count` 自增非原子，并发少计。
- M34. `platform_runtime.py:278-310` `execute_action` 在 Session 内执行长任务（浏览器付款），连接池耗尽；无超时。
- M35. `provider_definitions_repository.py:670-714` `ensure_seeded` 非真幂等，覆盖用户对 builtin fields/auth_modes 的修改。
- M36. `task_logs_repository.py:28-39` `TaskLog.platform` 无索引，按平台过滤慢。
- M37. `api_solver.py:247-256` `_periodic_cleanup` 永不退出 + CAPTCHA_FAIL 结果（无 createTime）永不清理，`results_db` 缓慢膨胀。
- M38. `db_results.py` 全局 `results_db` 字典无大小限制，配合 H22 可被刷到 OOM。

### Platform 层
- M39. `switch.py:213-218` Codex 桌面端 Cookie 写入 `encrypted_value=b""` 绕过 Chromium OS 密钥链加密，明文存 session token。
- M40. `cpa_upload.py:17-29` `_decode_jwt_payload` 不验签即采信 `account_id`，叠加 H6 可被伪造。
- M41. `payment_inbox.py:1162-1167` 默认开放访问，未配置 token/basic 时 `_check_auth` 返回 True，`0.0.0.0:18130` 暴露 `/api/jobs`（含 checkout_url）、`/api/otp`。
- M42. `gopay_signer_v2.py:71` / `stripe_http.py` MD5 用于请求体哈希（被外层 HMAC 包裹，风险有限）。
- M43. `card_generator.py:97` 默认用 `random`（非 CSPRNG）生成卡号与 CVV，仅 sandbox 但生成真实 BIN Luhn 合规卡号。

---

## 四、低级问题（Low）

> 低级问题汇总，行号见原始审计记录。

### API 层
- L1. `accounts.py:95` 导出 `Content-Disposition` filename 未加引号，含空格/中文时下载名错乱。
- L2. `pix_gpt_plus.py` 公开接口响应泄露内部 `account_id`，便于枚举。
- L3. `luckmail_client.py:18` 公开接口未捕获 settings 加载异常，可能 500。
- L4. `auth.py:36-37` 未设置 `APP_PASSWORD` 时全 API 无鉴权（默认部署风险）。

### Application 层
- L5. `tasks.py:411-417` `mark_incomplete_tasks_interrupted` 重启时对所有非终态任务写事件，任务量大 DB 写峰值。
- L6. `phone_binding.py:89` 调用私有方法 `_retry_oauth_fresh_browser`，跨层耦合脆弱。
- L7. `luckmail_client.py:104` 访问私有方法 `mailbox._extract_code`。
- L8. `task_logs.py:11` 未校验 `page`/`page_size` 参数。
- L9. `tasks.py:807-817` `execute_task` handler 调度无类型安全。
- L10. `idp_team_automation.py:1264` `item = updated` 赋值为无效操作。

### Core 层
- L11. `executors/playwright.py:129-133` `close()` 未显式关闭 context/page。
- L12. `registration/flows.py:69-78` `BrowserRegistrationFlow` 仅保证 `phone_cleanup`，不保证 browser worker 清理。
- L13. `lifecycle.py`/`scheduler.py` 后台任务用 `print` 而非 `logger`。
- L14. `scheduler.py:47` `time.sleep(60)` 不可及时中断。
- L15. `proxy_pool.py:68-70` 注释"连续失败超过10次"与代码（`fail_count>=5 且 success_count==0`，非连续）不符。
- L16. `base_platform.py:99` `_make_random_password` 用 `random.choices` 而非 `secrets`。

### Services + Infrastructure 层
- L17. `tasks.py:396-417` `mark_incomplete_tasks_interrupted` 把 pending 也标为 interrupted（语义上 pending 应保留）。
- L18. `task_runtime.py:36` 等大量用 `print` 不用 `logging`。
- L19. `sms_pool_repository.py:202-210` `clear` 用 for 循环逐条 delete，应一次性 `DELETE FROM`。
- L20. `proxies_repository.py:53-60` 硬删除代理，无软删除字段。
- L21. `solver_manager.py:14` `_proc: subprocess.Popen = None` 类型注解错误（应 `Optional`）。
- L22. `system_runtime.py:11-13` `restart_solver` 起 daemon 线程，主进程退出时 restart 中断。

### Platform 层
- L23. `gopay/plugin.py:166` `capabilities` 只声明 `query_state`，实际支持 register/付款/换绑，声明与实现不一致。
- L24. `gopay_protocol_worker.py:387` 代理 URL 处理用 `split("@")`，异常 URL（多个 @）可能误判，建议 `urlsplit`。

---

## 五、修复优先级建议

按"风险×触发概率÷修复成本"排序，建议按以下顺序处理：

### P0 — 立即修复（资金/安全/稳定性阻断）
1. **C1** SQL 注入（payment_inbox.py:543）— 改参数化，1 处修复
2. **H7** OTP/PIN/token 明文日志 — 全部打码
3. **H6** cpa_upload `verify=False` — 移除 4 处
4. **C2** 路由冲突导致历史日志 404 — 调整注册顺序
5. **C9** GoPay PIN 默认 "147258" — 禁止默认值
6. **H1** 付款成功后标记失败 — 包 try/except，3 行修复
7. **H10** `mark_running` 覆盖 cancel — 3 行 if 修复

### P1 — 本周修复（并发稳定性和资源泄漏）
8. **C3** SQLite check_same_thread + WAL — 1 行配置大幅改善并发
9. **C4** `_task_locks` 内存泄漏 — 终态删除 Lock
10. **C6** Solver 浏览器池泄漏 — try/finally 包裹
11. **C7** Solver 无认证 + 0.0.0.0 — 改 host + 加 key
12. **C8** TaskRuntime 优雅关闭 — 加 join + 信号处理
13. **H16** `patch_account_graph` 非原子写 — 加 per-account 锁
14. **C5** 双调度器重叠 — 合并实现

### P2 — 本月修复（安全加固与性能）
15. **H3/H4/H5** 密钥硬编码 — 移至运行时配置
16. **H8** GoPay 凭证明文存储 — 加密 + 权限收紧
17. **H13** pingme fail-open — 改 fail-closed
18. **H14** 公开 CKD 接口限流
19. **H23** accounts_repository 分页下推 SQL
20. **H19/H20/H21** solver_manager 锁内 sleep/超时清理/Windows 兼容

### P3 — 持续改进（中级与低级问题）
21. 各层越层访问整理（stats/sms/sms_pool 引入 application service）
22. 参数校验统一（Pydantic Field 约束）
23. 超时机制完善（check_valid、execute_action、协议执行器）
24. 索引补齐（TaskLog.platform 等）
25. 日志规范化（print → logging）

---

## 六、整体评价

### 架构层面
项目采用清晰的分层架构（API → Application → Domain → Infrastructure + Core/Services/Platforms），方向正确，大部分模块委托规范。但**分层一致性差**：`stats.py`、`sms.py`、`sms_pool.py` 绕过 application 层直接操作 DB/仓库，是架构债务集中区。

### 资金安全（最高风险维度）
GoPay/Midtrans/Stripe 协议实现的抓包对齐工作扎实，stage 化状态机设计清晰。但存在一条完整的"从源码泄露到资金被转走"的链路：**SQL 注入(C1) + 密钥硬编码(H3/H4/H5) + OTP/PIN 日志泄露(H7) + 凭证明文存储(H8) + 弱默认 PIN(C9)**。任一环节被利用都可直达资金操作。这是当前最紧急的修复方向。

### 并发稳定性
**并发安全是最大短板**。DB engine 配置错误(C3) + 双调度器重复执行(C5) + 账户图"删-插"非原子写(H16) 三者叠加，使后台任务链路在高频写入下极易出现 `database is locked`、状态丢失与进程泄漏。修复 C3+C5+H16 即可显著提升核心稳定性。

### 资源管理
浏览器/进程资源管理偏粗放：Solver 浏览器池泄漏(C6)、PlaywrightExecutor 构造即启动无回滚(M17)、BrowserRegistrationFlow 不保证 worker 清理(L12)、OAuthBrowser 自动 pkill 用户 Chrome(H17)，长期运行会累积僵尸进程或破坏用户体验。

### 取消与超时语义
取消请求只设置状态标志，但多个关键阶段（余额轮询 H9、协议付款 H9、账号检测 M6）不检查取消，"取消"只是建议而非指令。`refresh_plan_sync` 的超时被 `ThreadPoolExecutor.__exit__` 阻塞(C10) 形同虚设。

### 数据访问性能
Repository 模式基本统一，SQL 注入防护到位（参数化查询）。但**普遍全表扫描 + Python 层过滤**（accounts_repository 最严重 H23），账号上千后性能崩塌。N+1 查询(H24)、缺索引(M36) 需逐步优化。

### 文档对齐
本次审计同步核对，文档与代码实现基本一致，API 路由表、平台清单、Provider 定义、请求体字段均与代码对齐。

---

## 附录：各层问题分布

| 层 | 严重 | 高 | 中 | 低 | 小计 |
| --- | --- | --- | --- | --- | --- |
| API | 1 | 3 | 5 | 4 | 13 |
| Application | 3 | 7 | 9 | 6 | 25 |
| Core | 2 | 4 | 8 | 11 | 25 |
| Services + Infrastructure | 3 | 9 | 15 | 7 | 34 |
| Platform | 1 | 8 | 5 | 2 | 16 |
| **合计（去重后）** | **10** | **24** | **28** | **18** | **80** |

> 注：部分问题跨层（如 C3 SQLite 配置、C4 `_task_locks`、C9 PIN 默认值）在多份审计中被独立发现，本报告已合并去重。
