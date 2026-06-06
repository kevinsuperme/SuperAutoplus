import { useMemo, useState } from "react";
import type { ClipboardEvent, FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  QrCode,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  extractAccessTokenFromSessionText,
  maskAccessToken,
} from "@/lib/session-token";
import { API, cn } from "@/lib/utils";

type ClientOpenResponse = {
  ok: boolean;
  status?: string;
  message?: string;
  pix_qr_data?: string;
  pix_qr_image_url?: string;
  pix_hosted_url?: string;
  stripe_hosted_url?: string;
  pix_expires_iso?: string;
  request_id?: string;
  account_id?: number;
  email?: string;
};

type BannerState = {
  tone: "neutral" | "loading" | "success" | "error";
  message: string;
};

function formatExpiry(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function clip(value: string, head = 18, tail = 12) {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

const CHATGPT_SESSION_URL = "https://chatgpt.com/api/auth/session";

function safeHttpUrl(value?: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? value : "";
  } catch {
    return "";
  }
}

async function readOpenResponse(res: Response): Promise<ClientOpenResponse> {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as ClientOpenResponse;
  }
  return {
    ok: false,
    status: String(res.status),
    message: "服务返回格式异常，请稍后重试。",
  };
}

export default function PxlPlusClient() {
  const [ckd, setCkd] = useState("");
  const [credential, setCredential] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<ClientOpenResponse | null>(null);
  const [banner, setBanner] = useState<BannerState>({
    tone: "neutral",
    message: "填写 CKD 和 Access Token 后即可生成 PIX 支付信息。",
  });

  const hasSuccessPayload = useMemo(
    () =>
      Boolean(
        result?.ok &&
          (result.pix_qr_data ||
            result.pix_qr_image_url ||
            safeHttpUrl(result.pix_hosted_url) ||
            safeHttpUrl(result.stripe_hosted_url)),
      ),
    [result],
  );
  const tokenPreview = useMemo(() => maskAccessToken(credential), [credential]);

  const openSessionPage = () => {
    window.open(CHATGPT_SESSION_URL, "_blank", "noopener,noreferrer");
    setBanner({
      tone: "neutral",
      message: "已打开 ChatGPT Session 页面，复制页面内容后可从剪贴板填入。",
    });
  };

  const pasteSessionToken = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      const token = extractAccessTokenFromSessionText(clipboardText);
      if (!token) {
        setBanner({
          tone: "error",
          message: "未能从剪贴板内容中识别 Access Token。",
        });
        return;
      }
      setCredential(token);
      setBanner({
        tone: "success",
        message: "Access Token 已填入页面。",
      });
    } catch {
      setBanner({
        tone: "error",
        message: "无法读取剪贴板，请确认浏览器权限后重试。",
      });
    }
  };

  const pasteAccessTokenText = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardText = event.clipboardData.getData("text");
    const token = extractAccessTokenFromSessionText(clipboardText);
    if (!token || token === clipboardText.trim()) return;

    event.preventDefault();
    setCredential(token);
    setBanner({
      tone: "success",
      message: "Access Token 已从粘贴内容中提取。",
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const trimmedCkd = ckd.trim();
    const trimmedCredential = credential.trim();

    if (!trimmedCkd) {
      setResult(null);
      setBanner({ tone: "error", message: "请输入 CKD。" });
      return;
    }
    if (!trimmedCredential) {
      setResult(null);
      setBanner({
        tone: "error",
        message: "请输入 Access Token。",
      });
      return;
    }

    setSubmitting(true);
    setCopied(false);
    setResult(null);
    setBanner({ tone: "loading", message: "正在保存 token 并创建 ChatGPT Plus PIX 订单..." });

    try {
      const response = await fetch(`${API}/pix-gpt-plus/client/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ckd: trimmedCkd,
          credential: trimmedCredential,
        }),
      });
      const data = await readOpenResponse(response);
      setResult(data);

      if (!response.ok || !data.ok) {
        setBanner({
          tone: "error",
          message:
            data.message ||
            data.status ||
            `请求失败，HTTP 状态码 ${response.status}`,
        });
        return;
      }

      setBanner({
        tone: "success",
        message: data.message || "订单已创建，请在过期前完成支付。",
      });
    } catch (error) {
      setBanner({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "请求失败，请确认后端服务在线后重试。",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copyEmv = async () => {
    if (!result?.pix_qr_data) return;
    await navigator.clipboard?.writeText(result.pix_qr_data);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <main className="min-h-screen bg-[var(--bg-base)] px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-xl items-center justify-center">
        <section className="w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-hard)]">
          <div className="border-b border-[var(--border)] px-5 py-5 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="eco-icon h-11 w-11 shrink-0">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                  ChatGPT Plus 自助开通
                </h1>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  提交 token 后生成 PIX QR / EMV 和托管支付链接。
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-5 px-5 py-5 sm:px-6">
            <div
              className={cn(
                "flex gap-2 rounded-xl border px-3 py-2.5 text-sm leading-relaxed",
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
                  htmlFor="pxl-client-ckd"
                  className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]"
                >
                  CKD
                </label>
                <input
                  id="pxl-client-ckd"
                  value={ckd}
                  onChange={(event) => setCkd(event.target.value)}
                  placeholder="输入客户 CKD"
                  autoComplete="off"
                  className="control-surface w-full"
                  disabled={submitting}
                />
              </div>

              <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-sky-500/25 bg-sky-500/10 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <label
                    htmlFor="pxl-client-credential"
                    className="flex min-w-0 items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-200"
                  >
                    <KeyRound className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-300" />
                    <span className="truncate">ChatGPT Access Token</span>
                  </label>
                  {tokenPreview ? (
                    <span className="max-w-[148px] truncate font-mono text-xs text-[var(--text-muted)]">
                      {tokenPreview}
                    </span>
                  ) : null}
                </div>
                <textarea
                  id="pxl-client-credential"
                  value={credential}
                  onChange={(event) => setCredential(event.target.value)}
                  onPaste={pasteAccessTokenText}
                  placeholder="从 ChatGPT Session JSON 自动填入或粘贴完整 token"
                  className="control-surface control-surface-mono min-h-28 w-full resize-y break-all"
                  disabled={submitting}
                  spellCheck={false}
                  wrap="soft"
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openSessionPage}
                    disabled={submitting}
                    className="border-sky-500/35 text-sky-700 hover:bg-sky-600 dark:text-sky-200"
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    打开 Session
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={pasteSessionToken}
                    disabled={submitting}
                    className="border-sky-500/35 text-sky-700 hover:bg-sky-600 dark:text-sky-200"
                  >
                    <ClipboardPaste className="mr-1.5 h-3.5 w-3.5" />
                    从剪贴板填入
                  </Button>
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
                  <QrCode className="mr-2 h-4 w-4" />
                )}
                {submitting ? "正在提交" : "生成 PIX 支付"}
              </Button>
            </form>

            {result && (
              <div
                className={cn(
                  "rounded-xl border p-4",
                  result.ok
                    ? "border-[var(--border)] bg-[var(--bg-pane)]/50"
                    : "border-red-500/25 bg-red-500/10",
                )}
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      {result.ok ? "支付信息" : "开通失败"}
                    </h2>
                    {result.request_id ? (
                      <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                        request_id: {clip(result.request_id, 16, 10)}
                      </p>
                    ) : null}
                    {result.account_id ? (
                      <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                        账号已保存: #{result.account_id}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold",
                      result.ok
                        ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600"
                        : "border-red-500/25 bg-red-500/10 text-red-600",
                    )}
                  >
                    {result.ok ? "OK" : result.status || "ERROR"}
                  </span>
                </div>

                {hasSuccessPayload ? (
                  <div className="space-y-4">
                    {result.pix_qr_image_url ? (
                      <div className="flex justify-center">
                        <div className="flex h-48 w-48 items-center justify-center rounded-xl border border-[var(--border)] bg-white p-3">
                          <img
                            src={result.pix_qr_image_url}
                            alt="PIX QR"
                            className="h-full w-full object-contain"
                          />
                        </div>
                      </div>
                    ) : null}

                    {result.pix_qr_data ? (
                      <div>
                        <div className="mb-1.5 flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-[var(--text-secondary)]">
                            PIX EMV
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={copyEmv}
                            className="h-8"
                          >
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            {copied ? "已复制" : "复制"}
                          </Button>
                        </div>
                        <pre className="max-h-32 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--bg-input)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                          <code className="break-all whitespace-pre-wrap">
                            {result.pix_qr_data}
                          </code>
                        </pre>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <PaymentLink
                        label="PIX 支付链接"
                        href={result.pix_hosted_url}
                      />
                      <PaymentLink
                        label="Stripe 托管链接"
                        href={result.stripe_hosted_url}
                      />
                      {result.pix_expires_iso ? (
                        <InfoLine
                          label="过期时间"
                          value={formatExpiry(result.pix_expires_iso)}
                        />
                      ) : null}
                      {result.email ? (
                        <InfoLine label="后台账号" value={result.email} />
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-600">
                    {result.message || result.status || "远端接口未返回支付信息。"}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function PaymentLink({ label, href }: { label: string; href?: string }) {
  const safeHref = safeHttpUrl(href);
  if (!safeHref) return null;
  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm transition-colors hover:border-[var(--accent-edge)]"
    >
      <span className="min-w-0">
        <span className="block text-xs text-[var(--text-muted)]">{label}</span>
        <span className="block truncate font-mono text-[var(--text-secondary)]">
          {safeHref}
        </span>
      </span>
      <ExternalLink className="h-4 w-4 shrink-0 text-[var(--accent)]" />
    </a>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 break-words font-mono text-[var(--text-secondary)]">
        {value || "-"}
      </span>
    </div>
  );
}
