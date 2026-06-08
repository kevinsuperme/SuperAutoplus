import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FolderGit2,
  History,
  KeyRound,
  Loader2,
  Play,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  TerminalSquare,
  Upload,
  UserRoundCheck,
  X,
} from "lucide-react";

import { TaskLogPanel } from "@/components/tasks/TaskLogPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  buildIdpSyncResultSummary,
  getIdpArtifactKindLabel,
  getIdpPushBadge,
} from "@/lib/idp-team-automation";
import { apiDownload, apiFetch, cn, triggerBrowserDownload } from "@/lib/utils";

type IdpStatus = {
  configured: boolean;
  repo_dir: string;
  repo_exists: boolean;
  python_executable: string;
  artifact_root: string;
  required_files: Record<string, boolean>;
  entrypoints: Record<string, boolean>;
  blocked_actions: string[];
  has_idp_token: boolean;
  has_sub2api_password: boolean;
  managed_account_count: number;
  eligible_sync_account_count: number;
  warnings: string[];
  safe_mode: boolean;
};

type ConfigForm = Record<string, string>;

type ManagedAccount = {
  id: number;
  email: string;
  user_id: string;
  display_status: string;
  managed: boolean;
  managed_source: string;
  imported_at: string;
  last_synced_at: string;
  sub2api_remote_id: string;
  has_access_token: boolean;
  has_refresh_token: boolean;
};

type SyncArtifact = {
  kind: string;
  filename: string;
  path: string;
  media_type: string;
};

type SyncPush = {
  status: string;
  email: string;
  account_id: string;
  remote_id: string | number;
  remote_action: string;
};

type SyncResult = {
  ok: boolean;
  task_id?: string;
  selected_count: number;
  eligible_count: number;
  artifact_root: string;
  artifacts: SyncArtifact[];
  pushes: SyncPush[];
  warnings?: string[];
  error?: string;
};

type SyncHistoryItem = SyncResult & {
  task_id: string;
  status: string;
  trigger_source: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
};

type SyncPolicy = {
  enabled: boolean;
  interval_minutes: number;
  export_sub2api: boolean;
  export_any2api: boolean;
  push_sub2api: boolean;
  scope: string;
  anchor_at?: string;
  last_triggered_at?: string;
  next_run_at?: string;
  has_active_task?: boolean;
};

type NoticeTone = "success" | "danger";

const CONFIG_FIELDS = [
  {
    title: "本地仓库",
    icon: FolderGit2,
    fields: [
      {
        key: "idp_team_automation_repo_dir",
        label: "ITA 仓库目录",
        placeholder: "F:\\SuperAutoplus\\.tmp\\ita",
      },
      {
        key: "idp_team_automation_python_executable",
        label: "Python 可执行文件",
        placeholder: "F:\\SuperAutoplus\\.venv\\Scripts\\python.exe",
      },
      {
        key: "idp_team_automation_artifact_root",
        label: "Artifact 根目录",
        placeholder: "F:\\SuperAutoplus\\artifacts\\idp_team_automation",
      },
      {
        key: "idp_team_automation_request_timeout",
        label: "预检超时秒数",
        placeholder: "60",
      },
    ],
  },
  {
    title: "IDP 配置",
    icon: KeyRound,
    fields: [
      {
        key: "idp_team_automation_idp_base",
        label: "IDP Base URL",
        placeholder: "http://idp.fdvctte.info",
      },
      {
        key: "idp_team_automation_idp_token",
        label: "IDP Token",
        placeholder: "只保存在本地配置",
        secret: true,
      },
      {
        key: "idp_team_automation_idp_client_id",
        label: "IDP Client ID",
        placeholder: "openai-client3",
      },
      {
        key: "idp_team_automation_idp_channel_id",
        label: "IDP Channel ID",
        placeholder: "可选",
      },
      {
        key: "idp_team_automation_idp_domain",
        label: "邮箱后缀",
        placeholder: "可选",
      },
    ],
  },
  {
    title: "Sub2API 配置",
    icon: TerminalSquare,
    fields: [
      {
        key: "idp_team_automation_sub2api_url",
        label: "Sub2API URL",
        placeholder: "https://sub2api.example.com",
      },
      {
        key: "idp_team_automation_sub2api_email",
        label: "管理员邮箱",
        placeholder: "admin@example.com",
      },
      {
        key: "idp_team_automation_sub2api_password",
        label: "管理员密码",
        placeholder: "只保存在本地配置",
        secret: true,
      },
      {
        key: "idp_team_automation_sub2api_group",
        label: "分组 ID",
        placeholder: "1,2",
      },
      {
        key: "idp_team_automation_sub2api_model_whitelist",
        label: "模型白名单",
        placeholder: "gpt-5.4,gpt-5.5",
      },
      {
        key: "idp_team_automation_sub2api_concurrency",
        label: "并发额度",
        placeholder: "10",
      },
      {
        key: "idp_team_automation_sub2api_priority",
        label: "优先级",
        placeholder: "1",
      },
      {
        key: "idp_team_automation_sub2api_rate_multiplier",
        label: "倍率",
        placeholder: "1.0",
      },
    ],
  },
] as const;

const SAFE_MODE_LINES = [
  "只接受用户自己完成授权后拿到的 callback URL 或 token JSON。",
  "后台不会执行 run_batch_tui.py 或 run_idp_codex.py。",
  "同步任务只读取已保存账号并生成受控工件或推送到配置好的 Sub2API。",
  "日志、状态和任务 payload 都不会回显 IDP Token / Sub2API 密码。",
];

function fieldValue(form: ConfigForm, key: string) {
  return form[key] || "";
}

function formatTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function IdpTeamAutomation() {
  const [form, setForm] = useState<ConfigForm>({});
  const [status, setStatus] = useState<IdpStatus | null>(null);
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [policy, setPolicy] = useState<SyncPolicy | null>(null);
  const [historyItems, setHistoryItems] = useState<SyncHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [preflightStarting, setPreflightStarting] = useState(false);
  const [syncStarting, setSyncStarting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [runTests, setRunTests] = useState(true);
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<NoticeTone>("success");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [taskId, setTaskId] = useState("");
  const [taskStatus, setTaskStatus] = useState("");
  const [taskTitle, setTaskTitle] = useState("任务日志");
  const [taskKind, setTaskKind] = useState<"preflight" | "sync">("preflight");
  const [authorizedEmail, setAuthorizedEmail] = useState("");
  const [authorizedPassword, setAuthorizedPassword] = useState("");
  const [authorizedAccountId, setAuthorizedAccountId] = useState("");
  const [authorizedPayload, setAuthorizedPayload] = useState("");
  const [exportSub2api, setExportSub2api] = useState(true);
  const [exportAny2api, setExportAny2api] = useState(true);
  const [pushSub2api, setPushSub2api] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [downloadingArtifactKey, setDownloadingArtifactKey] = useState("");

  const showNotice = useCallback((message: string, tone: NoticeTone) => {
    setNotice(message);
    setNoticeTone(tone);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [config, nextStatus, nextAccounts, nextPolicy, nextHistory] = await Promise.all([
        apiFetch("/config"),
        apiFetch("/idp-team-automation/status"),
        apiFetch("/idp-team-automation/accounts"),
        apiFetch("/idp-team-automation/policy"),
        apiFetch("/idp-team-automation/history?limit=12"),
      ]);
      setForm(config || {});
      setStatus(nextStatus);
      const accountItems = Array.isArray(nextAccounts?.items) ? nextAccounts.items : [];
      setAccounts(accountItems);
      setPolicy(nextPolicy || null);
      const nextHistoryItems = Array.isArray(nextHistory?.items) ? nextHistory.items : [];
      setHistoryItems(nextHistoryItems);
      setLastSyncResult((current) => {
        if (!nextHistoryItems.length) return current;
        if (current?.task_id === nextHistoryItems[0]?.task_id) return nextHistoryItems[0];
        return current ?? nextHistoryItems[0];
      });
      setSelectedIds((current) =>
        current.filter((id) => accountItems.some((item: ManagedAccount) => Number(item.id) === Number(id))),
      );
    } catch (err: any) {
      showNotice(`加载失败: ${err?.message || err}`, "danger");
    } finally {
      setLoading(false);
    }
  }, [showNotice]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedCount = selectedIds.length;
  const eligibleAccounts = useMemo(
    () => accounts.filter((item) => item.has_access_token || item.has_refresh_token),
    [accounts],
  );
  const selectableIds = eligibleAccounts.map((item) => Number(item.id));
  const allEligibleSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));
  const singleSelectedId = selectedIds.length === 1 ? selectedIds[0] : 0;
  const syncSummary = useMemo(
    () => (lastSyncResult ? buildIdpSyncResultSummary(lastSyncResult) : null),
    [lastSyncResult],
  );

  useEffect(() => {
    if (singleSelectedId > 0) {
      setAuthorizedAccountId(String(singleSelectedId));
    }
  }, [singleSelectedId]);

  const health = useMemo(() => {
    if (!status) return { label: "未加载", variant: "secondary" as const };
    if (!status.repo_exists) return { label: "仓库缺失", variant: "danger" as const };
    if (!status.required_files?.pyproject) {
      return { label: "目录异常", variant: "warning" as const };
    }
    if (!status.eligible_sync_account_count) {
      return { label: "待导入授权", variant: "warning" as const };
    }
    return { label: "可执行", variant: "success" as const };
  }, [status]);

  const requiredCount = status
    ? Object.values(status.required_files || {}).filter(Boolean).length
    : 0;

  const update = (key: string, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiFetch("/config", {
        method: "PUT",
        body: JSON.stringify({ data: form }),
      });
      await load();
      showNotice("配置已保存。", "success");
    } catch (err: any) {
      showNotice(`保存失败: ${err?.message || err}`, "danger");
    } finally {
      setSaving(false);
    }
  };

  const savePolicy = async () => {
    if (!policy) return;
    setPolicySaving(true);
    try {
      const nextPolicy = await apiFetch("/idp-team-automation/policy", {
        method: "PUT",
        body: JSON.stringify({
          enabled: policy.enabled,
          interval_minutes: Number(policy.interval_minutes || 60),
          export_sub2api: policy.export_sub2api,
          export_any2api: policy.export_any2api,
          push_sub2api: policy.push_sub2api,
          scope: policy.scope || "all_managed",
        }),
      });
      setPolicy(nextPolicy);
      showNotice("定时同步策略已保存。", "success");
    } catch (err: any) {
      showNotice(`策略保存失败: ${err?.message || err}`, "danger");
    } finally {
      setPolicySaving(false);
    }
  };

  const startPreflight = async () => {
    setPreflightStarting(true);
    try {
      const task = await apiFetch("/tasks/idp-team-automation/preflight", {
        method: "POST",
        body: JSON.stringify({ run_tests: runTests }),
      });
      setTaskId(task.id || task.task_id || "");
      setTaskStatus(task.status || "pending");
      setTaskTitle("安全预检日志");
      setTaskKind("preflight");
      showNotice("安全预检任务已创建。", "success");
    } catch (err: any) {
      showNotice(`预检启动失败: ${err?.message || err}`, "danger");
    } finally {
      setPreflightStarting(false);
    }
  };

  const submitAuthorizedImport = async () => {
    if (!authorizedEmail.trim() || !authorizedPayload.trim()) {
      showNotice("请填写授权邮箱和 payload。", "danger");
      return;
    }
    setImporting(true);
    try {
      const body = await apiFetch("/idp-team-automation/authorized-import", {
        method: "POST",
        body: JSON.stringify({
          email: authorizedEmail.trim(),
          password: authorizedPassword,
          payload_text: authorizedPayload.trim(),
          account_id: Number(authorizedAccountId || 0),
        }),
      });
      setAuthorizedPayload("");
      setSelectedIds([Number(body.account_id)]);
      await load();
      showNotice(body.created ? "已创建受管账号并保存授权凭据。" : "已更新受管账号的授权凭据。", "success");
    } catch (err: any) {
      showNotice(`授权导入失败: ${err?.message || err}`, "danger");
    } finally {
      setImporting(false);
    }
  };

  const startSync = async () => {
    if (!exportSub2api && !exportAny2api && !pushSub2api) {
      showNotice("至少选择一个同步动作。", "danger");
      return;
    }
    setSyncStarting(true);
    try {
      const task = await apiFetch("/tasks/idp-team-automation/sync", {
        method: "POST",
        body: JSON.stringify({
          account_ids: selectedIds,
          export_sub2api: exportSub2api,
          export_any2api: exportAny2api,
          push_sub2api: pushSub2api,
        }),
      });
      setLastSyncResult(null);
      setTaskId(task.id || task.task_id || "");
      setTaskStatus(task.status || "pending");
      setTaskTitle("受控同步日志");
      setTaskKind("sync");
      showNotice(
        selectedIds.length > 0
          ? `已创建同步任务，将处理 ${selectedIds.length} 个受管账号。`
          : "已创建同步任务，将处理全部受管账号。",
        "success",
      );
    } catch (err: any) {
      showNotice(`同步启动失败: ${err?.message || err}`, "danger");
    } finally {
      setSyncStarting(false);
    }
  };

  const handleTaskDone = async (nextStatus: string) => {
    setTaskStatus(nextStatus);
    try {
      const task = await apiFetch(`/tasks/${taskId}`);
      const resultData = task?.result?.data || task?.data || null;
      if (taskKind === "sync" && resultData) {
        setLastSyncResult(resultData as SyncResult);
      }
    } catch {
      // ignore task detail fetch errors; logs already show outcome
    } finally {
      await load();
    }
  };

  const toggleAccount = (accountId: number) => {
    setSelectedIds((current) =>
      current.includes(accountId)
        ? current.filter((item) => item !== accountId)
        : [...current, accountId],
    );
  };

  const toggleSelectAllEligible = () => {
    setSelectedIds(allEligibleSelected ? [] : selectableIds);
  };

  const downloadArtifact = async (resultTaskId: string, artifact: SyncArtifact) => {
    if (!resultTaskId) {
      showNotice("当前同步结果缺少任务 ID，暂时无法下载工件。", "danger");
      return;
    }
    const artifactKey = `${resultTaskId}:${artifact.filename}`;
    setDownloadingArtifactKey(artifactKey);
    try {
      const { blob, filename } = await apiDownload(
        `/idp-team-automation/artifacts/${encodeURIComponent(resultTaskId)}?filename=${encodeURIComponent(artifact.filename)}`,
      );
      triggerBrowserDownload(blob, filename);
      showNotice(`已开始下载工件：${filename}`, "success");
    } catch (err: any) {
      showNotice(`工件下载失败: ${err?.message || err}`, "danger");
    } finally {
      setDownloadingArtifactKey("");
    }
  };

  const updatePolicy = <K extends keyof SyncPolicy>(key: K, value: SyncPolicy[K]) => {
    setPolicy((current) => (current ? { ...current, [key]: value } : current));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <Card className="shrink-0 border border-[var(--border)] bg-[var(--bg-pane)]/40 p-0 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[var(--border)]/50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="eco-icon h-10 w-10 shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
                  IDP Team Automation
                </h1>
                <Badge variant="secondary">Safe mode</Badge>
                <Badge variant={health.variant}>{health.label}</Badge>
              </div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                以“受控后台任务 + 管理页面”的方式托管 ITA，只接入已授权凭据导入和受控同步。
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void load()}
              disabled={loading || saving || preflightStarting || syncStarting || importing}
              className="h-8"
            >
              {loading ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              )}
              刷新
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={save}
              disabled={saving || loading || preflightStarting || syncStarting || importing}
              className="h-8"
            >
              {saving ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              保存
            </Button>
          </div>
        </div>

        <div className="grid gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="仓库"
            value={status?.repo_exists ? "已找到" : "未找到"}
            ok={Boolean(status?.repo_exists)}
          />
          <Metric
            label="必需文件"
            value={`${requiredCount}/3`}
            ok={requiredCount >= 2}
          />
          <Metric
            label="受管账号"
            value={String(status?.managed_account_count || 0)}
            ok={Boolean((status?.managed_account_count || 0) > 0)}
          />
          <Metric
            label="可同步账号"
            value={String(status?.eligible_sync_account_count || 0)}
            ok={Boolean((status?.eligible_sync_account_count || 0) > 0)}
          />
        </div>

        <div className="border-t border-[var(--border)]/50 px-5 py-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              安全边界
            </h2>
          </div>
          <ul className="grid gap-1.5 text-xs text-[var(--text-muted)] sm:grid-cols-2">
            {SAFE_MODE_LINES.map((line) => (
              <li key={line} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {status?.warnings?.length ? (
          <div className="border-t border-[var(--border)]/50 px-5 py-3">
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
              {status.warnings.join("；")}
            </div>
          </div>
        ) : null}

        {notice ? (
          <div className="border-t border-[var(--border)]/50 px-5 py-3">
            <div
              className={cn(
                "rounded-xl border px-3 py-2 text-xs",
                noticeTone === "danger"
                  ? "border-red-500/25 bg-red-500/10 text-red-700"
                  : "border-emerald-500/25 bg-emerald-500/10 text-emerald-700",
              )}
            >
              {notice}
            </div>
          </div>
        ) : null}
      </Card>

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="min-h-0 overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                本地配置
              </h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                所有密钥只保存在本地配置库；任务 payload 里只保存布尔开关和账号 ID。
              </p>
            </div>
          </div>

          <div className="space-y-5">
            {CONFIG_FIELDS.map(({ title, icon: Icon, fields }) => (
              <section key={title}>
                <div className="mb-3 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-[var(--accent)]" />
                  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    {title}
                  </h3>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {fields.map((field) => (
                    <label key={field.key} className="block">
                      <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                        {field.label}
                      </span>
                      <input
                        type={"secret" in field && field.secret ? "password" : "text"}
                        value={fieldValue(form, field.key)}
                        onChange={(event) => update(field.key, event.target.value)}
                        placeholder={field.placeholder}
                        className="control-surface control-surface-compact control-surface-mono"
                      />
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Card>

        <div className="grid min-h-0 gap-4">
          <Card className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="mb-4 flex items-center gap-2">
              <Upload className="h-4 w-4 text-[var(--accent)]" />
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  已授权凭据导入
                </h2>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  接受用户自己完成 OAuth 后拿到的 callback URL 或 token JSON，并保存到现有账号库。
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                  授权邮箱
                </span>
                <input
                  type="text"
                  value={authorizedEmail}
                  onChange={(event) => setAuthorizedEmail(event.target.value)}
                  placeholder="account@example.com"
                  className="control-surface control-surface-compact"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                  账号密码
                </span>
                <input
                  type="password"
                  value={authorizedPassword}
                  onChange={(event) => setAuthorizedPassword(event.target.value)}
                  placeholder="可选，创建新账号时一并保存"
                  className="control-surface control-surface-compact"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                  目标账号 ID
                </span>
                <input
                  type="text"
                  value={authorizedAccountId}
                  onChange={(event) => setAuthorizedAccountId(event.target.value)}
                  placeholder="可选，已有账号时可定向更新"
                  className="control-surface control-surface-compact control-surface-mono"
                />
              </label>
            </div>

            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                Callback URL / Token JSON
              </span>
              <textarea
                value={authorizedPayload}
                onChange={(event) => setAuthorizedPayload(event.target.value)}
                placeholder="粘贴 callback URL，或包含 access_token / refresh_token 的 JSON"
                className="control-surface control-surface-mono min-h-[120px] w-full resize-y rounded-2xl px-4 py-3 text-sm"
              />
            </label>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-[var(--text-muted)]">
                如已勾选单个受管账号，目标账号 ID 会自动带入。
              </div>
              <Button
                onClick={submitAuthorizedImport}
                disabled={importing || saving || loading}
              >
                {importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                导入授权凭据
              </Button>
            </div>
          </Card>

          <Card className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="mb-4 flex items-center gap-2">
              <Database className="h-4 w-4 text-[var(--accent)]" />
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  受控任务
                </h2>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  预检只跑仓库测试；同步只处理已导入的受管账号，并生成受控工件。
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-pane)]/50 px-3 py-3">
                <input
                  type="checkbox"
                  checked={runTests}
                  onChange={(event) => setRunTests(event.target.checked)}
                  className="checkbox-accent mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">
                    运行 ITA 自带测试
                  </span>
                  <span className="mt-1 block text-xs text-[var(--text-muted)]">
                    执行 `python -m pytest -q`，不会触发账号生成或自动 OAuth。
                  </span>
                </span>
              </label>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-pane)]/50 p-3">
                <dl className="grid gap-2 text-xs">
                  <InfoRow label="Artifact" value={status?.artifact_root || "-"} />
                  <InfoRow
                    label="IDP Token"
                    value={status?.has_idp_token ? "已配置" : "未配置"}
                  />
                  <InfoRow
                    label="Sub2API 密码"
                    value={status?.has_sub2api_password ? "已配置" : "未配置"}
                  />
                  <InfoRow
                    label="禁用入口"
                    value={(status?.blocked_actions || []).join(", ") || "-"}
                  />
                </dl>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={startPreflight}
                disabled={preflightStarting || saving || loading || importing || syncStarting}
              >
                {preflightStarting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                创建安全预检任务
              </Button>
            </div>

            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-pane)]/50 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    受控同步
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {selectedCount > 0
                      ? `将同步已选 ${selectedCount} 个受管账号。`
                      : "未选择账号时，将同步全部受管账号。"}
                  </div>
                </div>
                <Badge variant="secondary">
                  {status?.eligible_sync_account_count || 0} 可同步
                </Badge>
              </div>

              <div className="grid gap-2 text-sm text-[var(--text-primary)]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exportSub2api}
                    onChange={(event) => setExportSub2api(event.target.checked)}
                    className="checkbox-accent"
                  />
                  <span>生成 Sub2API 工件</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={exportAny2api}
                    onChange={(event) => setExportAny2api(event.target.checked)}
                    className="checkbox-accent"
                  />
                  <span>生成 Any2API 工件</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={pushSub2api}
                    onChange={(event) => setPushSub2api(event.target.checked)}
                    className="checkbox-accent"
                  />
                  <span>推送到 Sub2API</span>
                </label>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  onClick={startSync}
                  disabled={syncStarting || saving || loading || importing}
                >
                  {syncStarting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  启动受控同步
                </Button>
                <span className="text-xs text-[var(--text-muted)]">
                  任务只处理已导入授权凭据的 ChatGPT 账号。
                </span>
              </div>
            </div>

            {lastSyncResult ? (
              <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-pane)]/50 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    最近同步结果
                  </div>
                  <Badge variant={lastSyncResult.ok ? "success" : "danger"}>
                    {lastSyncResult.ok ? "完成" : "失败"}
                  </Badge>
                </div>
                {syncSummary ? (
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <ResultStat value={syncSummary.accountLabel} />
                    <ResultStat value={syncSummary.artifactLabel} />
                    <ResultStat value={syncSummary.pushLabel} />
                    {syncSummary.warningLabel ? (
                      <ResultStat value={syncSummary.warningLabel} tone={syncSummary.hasWarnings ? "warning" : "default"} />
                    ) : null}
                  </div>
                ) : null}

                <dl className="mt-3 grid gap-2 text-xs">
                  <InfoRow label="工件目录" value={lastSyncResult.artifact_root || "-"} />
                  <InfoRow label="任务 ID" value={lastSyncResult.task_id || "-"} />
                </dl>

                {lastSyncResult.error ? (
                  <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-700">
                    同步结果异常: {lastSyncResult.error}
                  </div>
                ) : null}

                {lastSyncResult.warnings?.length ? (
                  <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                    {lastSyncResult.warnings.join("；")}
                  </div>
                ) : null}

                {lastSyncResult.artifacts?.length ? (
                  <div className="mt-3 space-y-2">
                    {lastSyncResult.artifacts.map((artifact) => (
                      <div
                        key={`${artifact.kind}:${artifact.filename}`}
                        className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/70 px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[var(--text-primary)]">
                              {getIdpArtifactKindLabel(artifact.kind)}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
                              <span className="font-mono">{artifact.filename}</span>
                              <span>{artifact.media_type}</span>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void downloadArtifact(lastSyncResult.task_id || "", artifact)}
                            disabled={
                              !lastSyncResult.task_id ||
                              downloadingArtifactKey === `${lastSyncResult.task_id}:${artifact.filename}`
                            }
                          >
                            {downloadingArtifactKey === `${lastSyncResult.task_id}:${artifact.filename}` ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            下载
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)]/40 px-3 py-3 text-xs text-[var(--text-muted)]">
                    本次同步没有生成可下载工件。
                  </div>
                )}

                {lastSyncResult.pushes?.length ? (
                  <div className="mt-3 grid gap-2">
                    {lastSyncResult.pushes.map((push) => {
                      const pushBadge = getIdpPushBadge(push);
                      return (
                        <div
                          key={`${push.email}:${push.remote_id}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/70 px-3 py-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-[var(--text-primary)]">
                              {push.email}
                            </div>
                            <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                              remote_id={String(push.remote_id || "-")}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant={pushBadge.variant}>{pushBadge.label}</Badge>
                            <span className="font-mono text-[11px] text-[var(--text-muted)]">
                              {push.remote_action || push.status || "-"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)]/40 px-3 py-3 text-xs text-[var(--text-muted)]">
                    本次同步没有产生 Sub2API 推送结果。
                  </div>
                )}
              </div>
            ) : null}
          </Card>
        </div>
      </div>

      <Card className="rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-4">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-[var(--accent)]" />
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                定时同步 / 受控策略
              </h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                当前仅支持“全部受管账号”策略，按固定间隔自动创建受控同步任务。
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={savePolicy}
            disabled={!policy || policySaving || loading || saving || syncStarting || importing}
          >
            {policySaving ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="mr-1.5 h-3.5 w-3.5" />
            )}
            保存策略
          </Button>
        </div>

        {policy ? (
          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <div className="space-y-3">
              <label className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-pane)]/50 px-3 py-3">
                <input
                  type="checkbox"
                  checked={policy.enabled}
                  onChange={(event) => updatePolicy("enabled", event.target.checked)}
                  className="checkbox-accent mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold text-[var(--text-primary)]">
                    启用定时受控同步
                  </span>
                  <span className="mt-1 block text-xs text-[var(--text-muted)]">
                    后台按策略间隔自动创建 ITA 同步任务，不会绕过 safe mode。
                  </span>
                </span>
              </label>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                    间隔分钟
                  </span>
                  <input
                    type="number"
                    min={5}
                    step={5}
                    value={String(policy.interval_minutes || 60)}
                    onChange={(event) => updatePolicy("interval_minutes", Number(event.target.value || 60))}
                    className="control-surface control-surface-compact control-surface-mono"
                  />
                </label>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-pane)]/50 px-3 py-3">
                  <div className="text-xs font-medium text-[var(--text-muted)]">
                    策略范围
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="secondary">全部受管账号</Badge>
                    <span className="text-xs text-[var(--text-muted)]">all_managed</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-2 text-sm text-[var(--text-primary)]">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={policy.export_sub2api}
                    onChange={(event) => updatePolicy("export_sub2api", event.target.checked)}
                    className="checkbox-accent"
                  />
                  <span>定时生成 Sub2API 工件</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={policy.export_any2api}
                    onChange={(event) => updatePolicy("export_any2api", event.target.checked)}
                    className="checkbox-accent"
                  />
                  <span>定时生成 Any2API 工件</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={policy.push_sub2api}
                    onChange={(event) => updatePolicy("push_sub2api", event.target.checked)}
                    className="checkbox-accent"
                  />
                  <span>定时推送到 Sub2API</span>
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-pane)]/50 p-3">
              <div className="mb-3 flex items-center gap-2">
                <Clock3 className="h-4 w-4 text-[var(--accent)]" />
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  计划状态
                </div>
              </div>
              <dl className="grid gap-2 text-xs">
                <InfoRow label="当前状态" value={policy.enabled ? "已启用" : "已停用"} />
                <InfoRow label="下次运行" value={formatTime(policy.next_run_at || "")} />
                <InfoRow label="最近触发" value={formatTime(policy.last_triggered_at || "")} />
                <InfoRow label="锚点时间" value={formatTime(policy.anchor_at || "")} />
                <InfoRow label="活跃任务" value={policy.has_active_task ? "有" : "无"} />
              </dl>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)]/40 px-3 py-4 text-sm text-[var(--text-muted)]">
            正在加载策略配置。
          </div>
        )}
      </Card>

      <Card className="min-h-0 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-0">
        <div className="flex flex-col gap-3 border-b border-[var(--border)]/50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[var(--accent)]" />
            <div>
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                同步历史
              </h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                已持久化的最近受控同步结果。页面刷新后仍可查看工件和推送状态。
              </p>
            </div>
          </div>
          <Badge variant="secondary">
            最近 {historyItems.length} 条
          </Badge>
        </div>

        <div className="min-h-0 overflow-auto px-5 py-4">
          {historyItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-card)]/40 px-3 py-4 text-sm text-[var(--text-muted)]">
              还没有同步历史。先执行一次受控同步，历史会自动持久化到后台任务记录中。
            </div>
          ) : (
            <div className="space-y-3">
              {historyItems.map((item) => {
                const summary = buildIdpSyncResultSummary(item);
                const taskBadge = getTaskStatusBadge(item.status, item.ok);
                return (
                  <div
                    key={item.task_id}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--bg-pane)]/40 p-3"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={taskBadge.variant}>{taskBadge.label}</Badge>
                          <Badge variant="secondary">{item.trigger_source === "scheduled" ? "定时触发" : "手动触发"}</Badge>
                          <span className="font-mono text-[11px] text-[var(--text-muted)]">
                            {item.task_id}
                          </span>
                        </div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <ResultStat value={summary.accountLabel} />
                          <ResultStat value={summary.artifactLabel} />
                          <ResultStat value={summary.pushLabel} />
                          {summary.warningLabel ? (
                            <ResultStat value={summary.warningLabel} tone="warning" />
                          ) : (
                            <ResultStat value={`创建于 ${formatTime(item.created_at)}`} />
                          )}
                        </div>
                        <dl className="mt-3 grid gap-2 text-xs">
                          <InfoRow label="创建时间" value={formatTime(item.created_at)} />
                          <InfoRow label="完成时间" value={formatTime(item.finished_at || "")} />
                          <InfoRow label="工件目录" value={item.artifact_root || "-"} />
                        </dl>
                      </div>
                    </div>

                    {item.error ? (
                      <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-700">
                        同步异常: {item.error}
                      </div>
                    ) : null}

                    {item.warnings?.length ? (
                      <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                        {item.warnings.join("；")}
                      </div>
                    ) : null}

                    {item.artifacts?.length ? (
                      <div className="mt-3 space-y-2">
                        {item.artifacts.map((artifact) => {
                          const artifactKey = `${item.task_id}:${artifact.filename}`;
                          return (
                            <div
                              key={artifactKey}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/70 px-3 py-2"
                            >
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-[var(--text-primary)]">
                                  {getIdpArtifactKindLabel(artifact.kind)}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-muted)]">
                                  <span>{artifact.media_type}</span>
                                  <span className="font-mono">{artifact.filename}</span>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void downloadArtifact(item.task_id, artifact)}
                                disabled={downloadingArtifactKey === artifactKey}
                              >
                                {downloadingArtifactKey === artifactKey ? (
                                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Download className="mr-1.5 h-3.5 w-3.5" />
                                )}
                                下载
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    {item.pushes?.length ? (
                      <div className="mt-3 grid gap-2">
                        {item.pushes.map((push, index) => {
                          const pushBadge = getIdpPushBadge(push);
                          return (
                            <div
                              key={`${item.task_id}:${push.email}:${push.remote_id || index}`}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/70 px-3 py-2 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-medium text-[var(--text-primary)]">
                                  {push.email}
                                </div>
                                <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                                  remote_id={String(push.remote_id || "-")}
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant={pushBadge.variant}>{pushBadge.label}</Badge>
                                <span className="font-mono text-[11px] text-[var(--text-muted)]">
                                  {push.remote_action || push.status || "-"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Card>

      <Card className="min-h-0 overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-0">
        <div className="flex flex-col gap-3 border-b border-[var(--border)]/50 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              受管账号
            </h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              已通过授权导入纳入管理的 ChatGPT 账号。可勾选后执行受控同步。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={toggleSelectAllEligible}
              disabled={eligibleAccounts.length === 0}
            >
              {allEligibleSelected ? "取消全选可同步" : "全选可同步"}
            </Button>
            <Badge variant="secondary">
              已选 {selectedCount} / 可同步 {eligibleAccounts.length}
            </Badge>
          </div>
        </div>

        <div className="min-h-0 overflow-auto">
          {accounts.length === 0 ? (
            <div className="flex min-h-[220px] items-center justify-center px-6 py-10 text-sm text-[var(--text-muted)]">
              还没有受管账号。先在上方导入用户已授权的 callback URL 或 token JSON。
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--bg-pane)]/60 text-left text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3">选择</th>
                  <th className="px-4 py-3">账号</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">凭据</th>
                  <th className="px-4 py-3">导入时间</th>
                  <th className="px-4 py-3">最近同步</th>
                  <th className="px-4 py-3">Sub2API</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((item) => {
                  const syncable = item.has_access_token || item.has_refresh_token;
                  const checked = selectedIds.includes(Number(item.id));
                  return (
                    <tr
                      key={item.id}
                      className={cn(
                        "border-t border-[var(--border)]/40",
                        checked && "bg-[var(--accent-soft)]/30",
                      )}
                    >
                      <td className="px-4 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!syncable}
                          onChange={() => toggleAccount(Number(item.id))}
                          className="checkbox-accent mt-1"
                        />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-medium text-[var(--text-primary)]">
                          {item.email}
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                          id={item.id} {item.user_id ? `| user=${item.user_id}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{item.display_status || "unknown"}</Badge>
                          <Badge variant="secondary">{item.managed_source || "authorized_import"}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          <TokenBadge ok={item.has_access_token} label="access" />
                          <TokenBadge ok={item.has_refresh_token} label="refresh" />
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-[var(--text-secondary)]">
                        {formatTime(item.imported_at)}
                      </td>
                      <td className="px-4 py-3 align-top text-[var(--text-secondary)]">
                        {formatTime(item.last_synced_at)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="font-mono text-[11px] text-[var(--text-muted)]">
                          {item.sub2api_remote_id || "-"}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {taskId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6">
          <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-3xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  {taskTitle}
                </h2>
                <p className="mt-1 font-mono text-xs text-[var(--text-muted)]">
                  {taskId}
                </p>
              </div>
              <Badge variant="secondary">{taskStatus || "pending"}</Badge>
              <div className="ml-auto" />
              <button
                type="button"
                onClick={() => setTaskId("")}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                title="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <TaskLogPanel taskId={taskId} onDone={(nextStatus) => void handleTaskDone(nextStatus)} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)]/70 px-3 py-3">
      <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
        {label}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {value}
        </span>
        {ok ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-3">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="break-all font-mono text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function ResultStat({
  value,
  tone = "default",
}: {
  value: string;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 text-xs font-medium",
        tone === "warning"
          ? "border-amber-500/25 bg-amber-500/10 text-amber-700"
          : "border-[var(--border)] bg-[var(--bg-card)]/60 text-[var(--text-secondary)]",
      )}
    >
      {value}
    </div>
  );
}

function TokenBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium",
        ok
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600"
          : "border-[var(--border)] bg-[var(--chip-bg)] text-[var(--text-muted)]",
      )}
    >
      {ok ? <UserRoundCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      <span>{label}</span>
    </div>
  );
}

function getTaskStatusBadge(status: string, ok: boolean) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "succeeded" || (ok && !normalized)) {
    return { label: "完成", variant: "success" as const };
  }
  if (normalized === "failed") {
    return { label: "失败", variant: "danger" as const };
  }
  if (normalized === "running" || normalized === "claimed" || normalized === "pending") {
    return { label: "进行中", variant: "warning" as const };
  }
  if (normalized === "cancelled" || normalized === "interrupted") {
    return { label: "已停止", variant: "secondary" as const };
  }
  return { label: ok ? "完成" : normalized || "未知", variant: ok ? "success" as const : "secondary" as const };
}
