import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  Loader2,
  Mail,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { API, cn } from "@/lib/utils";

type CodeResponse = {
  ok: boolean;
  status?: string;
  message?: string;
  email?: string;
  code?: string;
};

type StepKey = "parse" | "query" | "extract";
type BannerTone = "neutral" | "loading" | "success" | "error";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const TICKET_SEPARATOR = "----";

function parseTicketPreview(value: string) {
  const trimmed = value.trim();
  const separatorIndex = trimmed.indexOf(TICKET_SEPARATOR);
  if (separatorIndex < 0) return { email: "", token: "", valid: false };

  const email = trimmed.slice(0, separatorIndex).trim();
  const token = trimmed.slice(separatorIndex + TICKET_SEPARATOR.length).trim();
  return {
    email,
    token,
    valid: EMAIL_RE.test(email) && token.length > 0,
  };
}

async function readCodeResponse(res: Response): Promise<CodeResponse> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as CodeResponse;
  }
  return {
    ok: false,
    status: String(res.status),
    message: "服务返回格式异常，请稍后重试。",
  };
}

export default function LuckMailCodeClient() {
  const [ticket, setTicket] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<CodeResponse | null>(null);
  const [banner, setBanner] = useState<{ tone: BannerTone; message: string }>({
    tone: "neutral",
    message: "粘贴邮箱 Token 文本后即可查询验证码。",
  });
  const [activeStep, setActiveStep] = useState<StepKey | null>(null);

  const preview = useMemo(() => parseTicketPreview(ticket), [ticket]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const value = ticket.trim();
    if (!value) {
      setResult(null);
      setActiveStep("parse");
      setBanner({ tone: "error", message: "请输入邮箱 Token 文本。" });
      return;
    }
    if (!preview.valid) {
      setResult(null);
      setActiveStep("parse");
      setBanner({ tone: "error", message: "格式应为 邮箱----token。" });
      return;
    }

    setSubmitting(true);
    setCopied(false);
    setResult(null);
    setActiveStep("query");
    setBanner({ tone: "loading", message: "正在查询 LuckMail 验证码..." });

    try {
      const response = await fetch(`${API}/luckmail/client/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: value }),
      });
      const data = await readCodeResponse(response);
      setResult(data);

      if (!response.ok || !data.ok) {
        setActiveStep(data.status === "code_not_ready" ? "extract" : "query");
        setBanner({
          tone: "error",
          message:
            data.message ||
            data.status ||
            `请求失败，HTTP 状态码 ${response.status}`,
        });
        return;
      }

      setActiveStep("extract");
      setBanner({ tone: "success", message: data.message || "验证码已获取。" });
    } catch (error) {
      setActiveStep("query");
      setBanner({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "请求失败，请确认服务在线后重试。",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copyCode = async () => {
    if (!result?.code) return;
    await navigator.clipboard?.writeText(result.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="min-h-screen bg-[var(--bg-base)] px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-4xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-hard)] lg:grid-cols-[1.08fr_0.92fr]">
          <div className="border-b border-[var(--border)] p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="mb-5 flex items-center gap-3">
              <div className="eco-icon h-11 w-11 shrink-0">
                <Mail className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                  LuckMail 验证码查询
                </h1>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  粘贴邮箱 Token 文本后获取验证码。
                </p>
              </div>
            </div>

            <div
              className={cn(
                "mb-5 flex gap-2 rounded-xl border px-3 py-2.5 text-sm leading-relaxed",
                banner.tone === "success" &&
                  "border-emerald-500/25 bg-emerald-500/10 text-emerald-600",
                banner.tone === "error" &&
                  "border-red-500/25 bg-red-500/10 text-red-600",
                banner.tone === "loading" &&
                  "border-[var(--accent-edge)] bg-[var(--accent-soft)] text-[var(--accent)]",
                banner.tone === "neutral" &&
                  "border-[var(--border)] bg-[var(--bg-pane)]/60 text-[var(--text-secondary)]",
              )}
              role={banner.tone === "error" ? "alert" : "status"}
            >
              {banner.tone === "loading" ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
              ) : banner.tone === "success" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{banner.message}</span>
            </div>

            <form className="space-y-4" onSubmit={submit}>
              <div>
                <label
                  htmlFor="luckmail-ticket"
                  className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]"
                >
                  邮箱 Token 文本
                </label>
                <textarea
                  id="luckmail-ticket"
                  value={ticket}
                  onChange={(event) => setTicket(event.target.value)}
                  placeholder="jadelee7905@outlook.com----tok_894d7778268489752c2c077e7ac6a603"
                  className="control-surface control-surface-mono min-h-28 w-full resize-y"
                  disabled={submitting}
                  spellCheck={false}
                />
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-pane)]/50 px-3 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[var(--text-muted)]">已解析邮箱</span>
                  <span className="min-w-0 truncate font-mono text-[var(--text-secondary)]">
                    {preview.email || "-"}
                  </span>
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                {submitting ? "正在查询" : "获取验证码"}
              </Button>
            </form>
          </div>

          <div className="space-y-5 bg-[var(--bg-pane)]/35 p-5 sm:p-6">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                查询状态
              </h2>
              <div className="mt-4 space-y-3">
                <StatusStep
                  label="解析文本"
                  description="识别邮箱与 token"
                  done={preview.valid || Boolean(result)}
                  active={activeStep === "parse"}
                />
                <StatusStep
                  label="查询 LuckMail"
                  description="使用系统配置查询订单"
                  done={Boolean(result)}
                  active={activeStep === "query"}
                />
                <StatusStep
                  label="提取验证码"
                  description="提取邮件验证码"
                  done={Boolean(result?.ok && result.code)}
                  active={activeStep === "extract"}
                />
              </div>
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
              <div className="mb-2 text-xs text-[var(--text-muted)]">
                验证码
              </div>
              {result?.ok && result.code ? (
                <>
                  <div className="break-words font-mono text-4xl font-bold tracking-[0.18em] text-[var(--text-primary)]">
                    {result.code}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={copyCode}
                    className="mt-4"
                  >
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    {copied ? "已复制" : "复制验证码"}
                  </Button>
                </>
              ) : (
                <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--text-muted)]">
                  等待查询结果
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusStep({
  label,
  description,
  done,
  active,
}: {
  label: string;
  description: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
          done
            ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-500"
            : active
              ? "border-[var(--accent-edge)] bg-[var(--accent-soft)] text-[var(--accent)]"
              : "border-[var(--border)] text-[var(--text-muted)]",
        )}
      >
        {done ? (
          <ClipboardCheck className="h-3.5 w-3.5" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
        )}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-[var(--text-primary)]">
          {label}
        </div>
        <div className="text-xs text-[var(--text-muted)]">{description}</div>
      </div>
    </div>
  );
}
