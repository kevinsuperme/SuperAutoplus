import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  Copy,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  Sparkles,
  WalletCards,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch, cn } from "@/lib/utils";

type AccountRow = {
  id: number;
  email: string;
  lifecycle_status?: string;
  plan_state?: string;
  cashier_url?: string;
  overview?: any;
  display_summary?: any;
  primary_token?: string;
  credentials?: Array<{
    key?: string;
    value?: string;
    source?: string;
    is_primary?: boolean;
    metadata?: Record<string, any>;
  }>;
};

type PixForm = {
  apiMode: "short" | "business" | "long";
  promoId: string;
  concurrency: number;
};

type PixResult = {
  account_id: number;
  email: string;
  ok: boolean;
  reason: string;
  message?: string;
  mode?: string;
  pix_qr_data?: string;
  pix_qr_image_url?: string;
  pix_hosted_url?: string;
  stripe_hosted_url?: string;
  pix_expires_iso?: string;
  session_id?: string;
  setup_intent_id?: string;
  pm_id?: string;
  attempts?: number;
  attempts_log?: Array<Record<string, any>>;
  persona?: Record<string, any>;
  request_id?: string;
  duration_ms?: number;
};

type PixGenerateResponse = {
  ok: boolean;
  mode: string;
  endpoint: string;
  success_count: number;
  error_count: number;
  results: PixResult[];
};

const API_MODE_OPTIONS = [
  { value: "short", label: "短码 QR", endpoint: "/api/v1/pix-short" },
  { value: "business", label: "商务精简", endpoint: "/api/v1/pix-business" },
  { value: "long", label: "长链兜底", endpoint: "/api/v1/pix" },
] as const;

function getPlanState(acc: AccountRow): string {
  return (
    acc.display_summary?.status?.plan_state ||
    acc.plan_state ||
    acc.overview?.plan_state ||
    "unknown"
  );
}

function getLifecycleStatus(acc: AccountRow): string {
  return (
    acc.display_summary?.status?.lifecycle ||
    acc.lifecycle_status ||
    "registered"
  );
}

function getCashierUrl(acc: AccountRow): string {
  return acc.cashier_url || acc.overview?.cashier_url || "";
}

function hasToken(acc: AccountRow): boolean {
  return Boolean(getAccessToken(acc));
}

function getAccessToken(acc: AccountRow): string {
  const credentialToken =
    acc.credentials?.find((item) => item.key === "access_token")?.value ||
    acc.credentials?.find((item) => item.is_primary)?.value ||
    "";
  return acc.primary_token || credentialToken || acc.overview?.access_token || "";
}

function isPxlClientAccount(acc: AccountRow): boolean {
  return (
    acc.overview?.client_source === "pxl-plus-client" ||
    acc.overview?.source === "pxl-plus-client" ||
    Boolean(
      acc.credentials?.some(
        (item) =>
          item.source === "pxl-plus-client" ||
          item.metadata?.source === "pxl-plus-client",
      ),
    )
  );
}

function getModeLabel(mode: string): string {
  return API_MODE_OPTIONS.find((item) => item.value === mode)?.label || mode;
}

function clip(value: string, head = 18, tail = 14): string {
  if (!value) return "";
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

export default function PixGptPlus() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [search, setSearch] = useState("");
  const [response, setResponse] = useState<PixGenerateResponse | null>(null);
  const [status, setStatus] = useState<{
    type: "idle" | "warning" | "success";
    message: string;
  }>({
    type: "idle",
    message: "选择 ChatGPT 账号后可直接生成 PIX QR / EMV。",
  });
  const [form, setForm] = useState<PixForm>({
    apiMode: "short",
    promoId: "plus-1-month-free",
    concurrency: 1,
  });

  const selectedAccounts = useMemo(
    () => accounts.filter((acc) => selectedIds.has(acc.id)),
    [accounts, selectedIds],
  );

  const availableAccounts = useMemo(
    () => accounts.filter((acc) => getPlanState(acc) !== "subscribed"),
    [accounts],
  );

  const updateForm = <K extends keyof PixForm>(key: K, value: PixForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const reload = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        platform: "chatgpt",
        page: "1",
        page_size: "200",
      });
      if (search.trim()) params.set("email", search.trim());
      const data = await apiFetch(`/accounts?${params}`);
      setAccounts(data.items || []);
    } catch (err) {
      console.error("加载 ChatGPT 账号失败", err);
      setStatus({
        type: "warning",
        message: "账号加载失败，请确认后端服务在线后重试。",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setTimeout(reload, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const toggleAccount = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const visibleIds = availableAccounts.map((acc) => acc.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      visibleIds.forEach((id) => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const buildPayload = () => ({
    chatgpt_account_ids: selectedAccounts.map((acc) => acc.id),
    promo_id: form.promoId.trim() || "plus-1-month-free",
    api_mode: form.apiMode,
    concurrency: form.concurrency,
  });

  const copyPreview = async () => {
    await navigator.clipboard?.writeText(JSON.stringify(buildPayload(), null, 2));
    setStatus({ type: "success", message: "PIX 请求参数已复制到剪贴板。" });
  };

  const copyText = async (text: string, label = "内容") => {
    await navigator.clipboard?.writeText(text);
    setStatus({ type: "success", message: `${label}已复制。` });
  };

  const start = async () => {
    if (selectedIds.size === 0) {
      setStatus({ type: "warning", message: "请至少选择一个 ChatGPT 账号。" });
      return;
    }
    setStarting(true);
    setResponse(null);
    setStatus({ type: "idle", message: "正在调用 Nerver PIX API..." });
    try {
      const data = await apiFetch("/pix-gpt-plus/generate", {
        method: "POST",
        body: JSON.stringify(buildPayload()),
      });
      setResponse(data);
      setStatus({
        type: data.error_count ? "warning" : "success",
        message: `生成完成：成功 ${data.success_count}，失败 ${data.error_count}。`,
      });
    } catch (err: any) {
      setStatus({
        type: "warning",
        message: `生成失败: ${err?.message || err}`,
      });
    } finally {
      setStarting(false);
    }
  };

  const selectedMode = API_MODE_OPTIONS.find(
    (item) => item.value === form.apiMode,
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <Card className="shrink-0 border border-[var(--border)] bg-[var(--bg-pane)]/40 p-0 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[var(--border)]/50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="eco-icon h-10 w-10 shrink-0">
              <QrCode className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                  PIX 生成 GPTPlus
                </h1>
                <Badge variant="secondary">Nerver API</Badge>
                <Badge variant="success">已接入</Badge>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                AC token → PIX QR / EMV → ChatGPT Plus 支付。
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={reload}
              disabled={loading || starting}
              className="h-8"
            >
              {loading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              刷新
            </Button>
            <Button size="sm" onClick={start} disabled={starting} className="h-8">
              {starting ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              生成 PIX
            </Button>
          </div>
        </div>

        <div className="grid gap-4 px-5 py-4 lg:grid-cols-[1.25fr_1fr]">
          <div className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="mb-1 block text-[var(--text-muted)]">
                API 模式
              </label>
              <select
                value={form.apiMode}
                onChange={(e) =>
                  updateForm("apiMode", e.target.value as PixForm["apiMode"])
                }
                className="control-surface control-surface-compact w-full"
              >
                {API_MODE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[var(--text-muted)]">
                并发
              </label>
              <input
                type="number"
                min={1}
                max={5}
                value={form.concurrency}
                onChange={(e) =>
                  updateForm(
                    "concurrency",
                    Math.min(Math.max(Number(e.target.value) || 1, 1), 5),
                  )
                }
                className="control-surface control-surface-compact w-full text-center"
              />
            </div>
            <div>
              <label className="mb-1 block text-[var(--text-muted)]">
                地区
              </label>
              <div className="control-surface control-surface-compact flex w-full items-center justify-center font-mono">
                BR
              </div>
            </div>
            <div className="md:col-span-4">
              <label className="mb-1 block text-[var(--text-muted)]">
                Promo ID
              </label>
              <input
                type="text"
                value={form.promoId}
                onChange={(e) => updateForm("promoId", e.target.value)}
                className="control-surface control-surface-compact w-full font-mono"
              />
            </div>
            <div className="md:col-span-4 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[var(--text-muted)]">远端接口</span>
                <span className="font-mono text-[var(--text-primary)]">
                  {selectedMode?.endpoint}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <WalletCards className="h-4 w-4 text-[var(--accent)]" />
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  提交预览
                </h2>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyPreview}
                className="h-8"
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                复制参数
              </Button>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-[var(--text-muted)]">账号数</dt>
                <dd className="mt-1 font-mono text-[var(--text-primary)]">
                  {selectedIds.size}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">模式</dt>
                <dd className="mt-1 text-[var(--text-primary)]">
                  {getModeLabel(form.apiMode)}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">Promo</dt>
                <dd className="mt-1 truncate font-mono text-[var(--text-primary)]">
                  {form.promoId || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--text-muted)]">并发</dt>
                <dd className="mt-1 font-mono text-[var(--text-primary)]">
                  {form.concurrency}
                </dd>
              </div>
            </dl>
            <div
              className={cn(
                "mt-4 flex gap-2 rounded-xl border px-3 py-2 text-xs leading-relaxed",
                status.type === "success"
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700"
                  : status.type === "warning"
                    ? "border-amber-500/25 bg-amber-500/10 text-amber-700"
                    : "border-[var(--border)] bg-[var(--bg-pane)] text-[var(--text-muted)]",
              )}
            >
              {status.type === "success" ? (
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{status.message}</span>
            </div>
          </div>
        </div>
      </Card>

      {response && (
        <Card className="shrink-0 border border-[var(--border)] bg-[var(--bg-pane)]/40 p-0">
          <div className="flex flex-col gap-2 border-b border-[var(--border)]/50 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                生成结果
              </span>
              <Badge variant={response.error_count ? "warning" : "success"}>
                成功 {response.success_count}
              </Badge>
              <Badge variant={response.error_count ? "danger" : "secondary"}>
                失败 {response.error_count}
              </Badge>
              <Badge variant="secondary">{response.endpoint}</Badge>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                copyText(JSON.stringify(response, null, 2), "完整结果")
              }
              className="h-8"
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              复制结果
            </Button>
          </div>
          <div className="grid max-h-[360px] gap-3 overflow-y-auto p-4 lg:grid-cols-2">
            {response.results.map((item) => (
              <ResultCard
                key={`${item.account_id}-${item.session_id || item.reason}`}
                item={item}
                onCopy={copyText}
              />
            ))}
          </div>
        </Card>
      )}

      <Card className="flex min-h-0 flex-1 flex-col border border-[var(--border)] bg-[var(--bg-pane)]/40 p-0">
        <div className="flex flex-col gap-3 border-b border-[var(--border)]/50 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[var(--text-primary)]">
              ChatGPT 账号
            </span>
            <Badge variant="secondary">已选 {selectedIds.size}</Badge>
            <Badge variant="secondary">
              可用 {availableAccounts.length}/{accounts.length}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索邮箱"
              className="control-surface control-surface-compact w-[220px]"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={toggleAllVisible}
              className="h-8"
            >
              全选可用
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[var(--bg-card)]">
              <tr className="text-left text-[var(--text-muted)]">
                <th className="w-10 px-3 py-2"></th>
                <th className="px-3 py-2">邮箱</th>
                <th className="px-3 py-2">套餐</th>
                <th className="px-3 py-2">生命周期</th>
                <th className="px-3 py-2">来源</th>
                <th className="min-w-[360px] px-3 py-2">Access Token</th>
                <th className="px-3 py-2">cashier_url</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((acc) => {
                const planState = getPlanState(acc);
                const lifecycleStatus = getLifecycleStatus(acc);
                const subscribed = planState === "subscribed";
                const checked = selectedIds.has(acc.id);
                const cashier = getCashierUrl(acc);
                const accessToken = getAccessToken(acc);
                return (
                  <tr
                    key={acc.id}
                    className={cn(
                      "hover:bg-[var(--bg-hover)]",
                      subscribed && "opacity-55",
                      checked && "bg-[var(--accent-soft)]",
                    )}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={subscribed}
                        onChange={() => toggleAccount(acc.id)}
                        className="h-4 w-4 accent-[var(--accent)]"
                      />
                    </td>
                    <td className="max-w-[360px] truncate px-3 py-2 font-medium text-[var(--text-primary)]">
                      {acc.email}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={
                          subscribed
                            ? "success"
                            : planState === "unknown"
                              ? "secondary"
                              : "warning"
                        }
                      >
                        {planState}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">
                      {lifecycleStatus}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={isPxlClientAccount(acc) ? "success" : "secondary"}>
                        {isPxlClientAccount(acc) ? "PXL 客户页" : "账号资产"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {accessToken ? (
                        <div className="flex min-w-[340px] items-center gap-2">
                          <code className="block max-w-[300px] overflow-x-auto whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2 py-1 font-mono text-[11px] leading-5 text-[var(--text-secondary)]">
                            {accessToken}
                          </code>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 shrink-0 px-2"
                            onClick={() => copyText(accessToken, "Access Token")}
                          >
                            <Copy className="mr-1 h-3.5 w-3.5" />
                            复制
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="warning">缺失</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">
                      {cashier ? "已有" : "-"}
                    </td>
                  </tr>
                );
              })}
              {accounts.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-10 text-center text-[var(--text-muted)]"
                  >
                    {loading ? "正在加载账号..." : "暂无 ChatGPT 账号"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ResultCard({
  item,
  onCopy,
}: {
  item: PixResult;
  onCopy: (text: string, label?: string) => Promise<void>;
}) {
  const primaryUrl = item.pix_hosted_url || item.stripe_hosted_url || "";
  const hasPix = Boolean(item.pix_qr_data || item.pix_qr_image_url);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {item.email || `账号 ${item.account_id}`}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={item.ok ? "success" : "danger"}>
              {item.ok ? "OK" : item.reason || "failed"}
            </Badge>
            {item.mode && <Badge variant="secondary">{item.mode}</Badge>}
            {item.attempts ? (
              <Badge variant="secondary">尝试 {item.attempts}</Badge>
            ) : null}
          </div>
        </div>
        {item.pix_qr_data && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onCopy(item.pix_qr_data || "", "EMV")}
            className="h-8 shrink-0"
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            EMV
          </Button>
        )}
      </div>

      {item.ok && hasPix ? (
        <div className="grid gap-3 md:grid-cols-[120px_1fr]">
          <div className="flex h-[120px] items-center justify-center rounded-lg border border-[var(--border)] bg-white p-2">
            {item.pix_qr_image_url ? (
              <img
                src={item.pix_qr_image_url}
                alt="PIX QR"
                className="h-full w-full object-contain"
              />
            ) : (
              <QrCode className="h-12 w-12 text-slate-400" />
            )}
          </div>
          <div className="min-w-0 space-y-2 text-xs">
            <InfoLine label="EMV" value={clip(item.pix_qr_data || "")} mono />
            <InfoLine label="过期" value={item.pix_expires_iso || "-"} mono />
            <InfoLine label="Session" value={clip(item.session_id || "")} mono />
            {item.persona?.name && (
              <InfoLine
                label="Persona"
                value={`${item.persona.name} ${item.persona.cpf || ""}`.trim()}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          {item.message || item.reason || "远端接口未返回 PIX 数据"}
        </div>
      )}

      {primaryUrl && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-pane)] px-3 py-2 text-xs">
          <span className="min-w-0 truncate font-mono text-[var(--text-muted)]">
            {primaryUrl}
          </span>
          <a
            href={primaryUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1 text-[var(--accent)]"
          >
            打开
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}
    </div>
  );
}

function InfoLine({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[56px_1fr] gap-2">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-[var(--text-primary)]",
          mono && "font-mono",
        )}
      >
        {value || "-"}
      </span>
    </div>
  );
}
