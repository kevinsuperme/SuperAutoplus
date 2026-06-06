# 验证与测试

## 测试框架

后端使用 pytest。配置在 `pytest.ini`：

```ini
[pytest]
testpaths = tests
pythonpath = .
```

运行全部测试：

```bash
python -m pytest -q
```

## 推荐分组

健康、平台和统计：

```bash
python -m pytest tests/test_api_health.py tests/test_api_platforms.py tests/test_api_stats.py -q
```

公开客户页面后端：

```bash
python -m pytest tests/test_api_pix_gpt_plus.py tests/test_luckmail_mailbox.py tests/test_api_luckmail_client.py -q
```

Provider：

```bash
python -m pytest tests/test_captcha_providers.py tests/test_sms_provider.py tests/test_proxy_providers.py -q
python -m pytest tests/test_luckmail_mailbox.py tests/test_outlook_email_mailbox.py tests/test_cfworker_cloud_mail.py -q
```

GoPay：

```bash
python -m pytest tests/test_gopay_pay_chatgpt.py tests/test_gopay_pay_chatgpt_task.py tests/test_gopay_autoregister.py -q
```

前端：

```bash
cd frontend
npm run build
```

## 文档对齐检查

检查 LuckMail 文档是否仍有旧订单 token 描述：

```bash
rg -n "订单查询标识|必须要求 LuckMail API Key" docs -g "!docs/testing/verification.md"
```

允许 `order/{order_no}/code` 出现在描述后台订单流程的上下文中；客户页面必须描述为：

```text
/api/v1/openapi/email/token/{token}/code
```

检查公开路由文档和代码是否一致：

```bash
rg -n "pxl-plus|luckmail-code|pix-gpt-plus/client|luckmail/client" frontend/src core/auth.py api docs
```

## 构建验证

前端构建会更新根目录 `static/`，该目录在 `.gitignore` 中被忽略。提交文档或源码时，除非明确要发布静态构建产物，否则不用提交 `static/`。

```bash
cd frontend
npm run build
```

后端依赖完整性：

```bash
python - <<'PY'
import main
print(main.app.title, main.app.version)
PY
```

如果出现 `ModuleNotFoundError`，先确认已执行：

```bash
pip install -r requirements.txt
```

## 在线 Smoke

启动服务：

```bash
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

健康检查：

```bash
curl -sS http://127.0.0.1:8000/api/health
curl -sS http://127.0.0.1:8000/api/ready
```

公开页面：

```bash
curl -i http://127.0.0.1:8000/pxl-plus
curl -i http://127.0.0.1:8000/luckmail-code
```

LuckMail 无效格式：

```bash
curl -sS -H "Content-Type: application/json" \
  -d '{"ticket":"user@example.com tok_abc"}' \
  http://127.0.0.1:8000/api/luckmail/client/code
```

预期：

```json
{
  "ok": false,
  "status": "invalid_ticket_format",
  "message": "请输入正确的邮箱 Token 文本"
}
```
