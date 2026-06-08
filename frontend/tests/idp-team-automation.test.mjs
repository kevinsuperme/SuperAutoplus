import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadIdpTeamAutomationModule() {
  const filePath = path.resolve("frontend/src/lib/idp-team-automation.ts");
  const source = await readFile(filePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2023,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(
    compiled,
    { exports: module.exports, module },
    { filename: filePath },
  );
  return module.exports;
}

function hostJson(value) {
  return JSON.parse(JSON.stringify(value));
}

test("maps known ITA artifact kinds to readable labels", async () => {
  const { getIdpArtifactKindLabel } = await loadIdpTeamAutomationModule();

  assert.equal(getIdpArtifactKindLabel("sub2api_export"), "Sub2API 工件");
  assert.equal(getIdpArtifactKindLabel("any2api_export"), "Any2API 工件");
  assert.equal(getIdpArtifactKindLabel("custom_kind"), "custom_kind");
});

test("builds a compact sync result summary for the admin panel", async () => {
  const { buildIdpSyncResultSummary } = await loadIdpTeamAutomationModule();

  const summary = buildIdpSyncResultSummary({
    selected_count: 3,
    eligible_count: 2,
    artifacts: [{}, {}],
    pushes: [{}],
    warnings: ["Any2API admin.json only supports one token"],
    error: "",
  });

  assert.equal(summary.accountLabel, "2 / 3 账号可同步");
  assert.equal(summary.artifactLabel, "2 个工件");
  assert.equal(summary.pushLabel, "1 条推送结果");
  assert.equal(summary.warningLabel, "1 条提醒");
  assert.equal(summary.hasWarnings, true);
  assert.equal(summary.hasError, false);
});

test("reports empty artifact and push states clearly", async () => {
  const { buildIdpSyncResultSummary } = await loadIdpTeamAutomationModule();

  const summary = buildIdpSyncResultSummary({
    selected_count: 1,
    eligible_count: 0,
    artifacts: [],
    pushes: [],
    warnings: [],
    error: "no_eligible_accounts",
  });

  assert.equal(summary.artifactLabel, "无可下载工件");
  assert.equal(summary.pushLabel, "未推送 Sub2API");
  assert.equal(summary.warningLabel, "");
  assert.equal(summary.hasWarnings, false);
  assert.equal(summary.hasError, true);
});

test("maps push results to colored status badges", async () => {
  const { getIdpPushBadge } = await loadIdpTeamAutomationModule();

  assert.deepEqual(
    hostJson(getIdpPushBadge({ status: "success", remote_action: "created" })),
    { label: "已创建", variant: "success" },
  );
  assert.deepEqual(
    hostJson(getIdpPushBadge({ status: "success", remote_action: "updated" })),
    { label: "已更新", variant: "warning" },
  );
  assert.deepEqual(
    hostJson(getIdpPushBadge({ status: "failed", remote_action: "created" })),
    { label: "失败", variant: "danger" },
  );
});
