export type IdpSyncResultSummaryInput = {
  selected_count: number;
  eligible_count: number;
  artifacts?: Array<unknown>;
  pushes?: Array<unknown>;
  warnings?: Array<unknown>;
  error?: string;
};

export type IdpPushBadgeVariant = "success" | "warning" | "danger" | "secondary";

export type IdpPushBadgeInput = {
  status?: string;
  remote_action?: string;
};

const ARTIFACT_KIND_LABELS: Record<string, string> = {
  sub2api_export: "Sub2API 工件",
  any2api_export: "Any2API 工件",
};

export function getIdpArtifactKindLabel(kind: string) {
  return ARTIFACT_KIND_LABELS[kind] || kind;
}

export function buildIdpSyncResultSummary(input: IdpSyncResultSummaryInput) {
  const artifactCount = Array.isArray(input.artifacts) ? input.artifacts.length : 0;
  const pushCount = Array.isArray(input.pushes) ? input.pushes.length : 0;
  const warningCount = Array.isArray(input.warnings) ? input.warnings.length : 0;
  const hasError = Boolean(String(input.error || "").trim());

  return {
    accountLabel: `${input.eligible_count} / ${input.selected_count} 账号可同步`,
    artifactLabel: artifactCount > 0 ? `${artifactCount} 个工件` : "无可下载工件",
    pushLabel: pushCount > 0 ? `${pushCount} 条推送结果` : "未推送 Sub2API",
    warningLabel: warningCount > 0 ? `${warningCount} 条提醒` : "",
    hasWarnings: warningCount > 0,
    hasError,
  };
}

export function getIdpPushBadge(input: IdpPushBadgeInput): {
  label: string;
  variant: IdpPushBadgeVariant;
} {
  const status = String(input.status || "").trim().toLowerCase();
  const remoteAction = String(input.remote_action || "").trim().toLowerCase();

  if (status === "failed" || status === "error" || status === "remote_failed") {
    return { label: "失败", variant: "danger" };
  }
  if (remoteAction === "created") {
    return { label: "已创建", variant: "success" };
  }
  if (remoteAction === "updated") {
    return { label: "已更新", variant: "warning" };
  }
  if (status === "success") {
    return { label: "成功", variant: "success" };
  }
  return { label: remoteAction || status || "未知", variant: "secondary" };
}
