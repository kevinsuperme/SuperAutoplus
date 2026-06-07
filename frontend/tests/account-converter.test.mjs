import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadConverterModule() {
  const filePath = path.resolve("src/lib/account-converter.ts");
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

const NOW = "2026-06-07T01:02:03.000Z";

test("converts one sub2api account into one CPA download", async () => {
  const { buildSub2apiToCpaDownloads } = await loadConverterModule();

  const result = buildSub2apiToCpaDownloads(
    {
      accounts: [
        {
          name: "fallback@example.com",
          credentials: {
            access_token: "ac_token",
            refresh_token: "rf_token",
            id_token: "id_token",
            expires_at: "2026-07-01T00:00:00Z",
            organization_id: "org_123",
            email: "user@example.com",
          },
        },
      ],
    },
    NOW,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(hostJson(result.warnings), []);
  assert.notEqual(result.message, "");
  assert.equal(result.downloads.length, 1);
  assert.equal(result.downloads[0].filename, "user@example.com.json");
  assert.deepEqual(hostJson(result.downloads[0].data), {
    type: "codex",
    email: "user@example.com",
    expired: "2026-07-01T00:00:00Z",
    id_token: "id_token",
    account_id: "org_123",
    access_token: "ac_token",
    last_refresh: NOW,
    refresh_token: "rf_token",
  });
});

test("converts multiple sub2api accounts into multiple CPA downloads", async () => {
  const { buildSub2apiToCpaDownloads } = await loadConverterModule();

  const result = buildSub2apiToCpaDownloads(
    {
      accounts: [
        { name: "one@example.com", credentials: { access_token: "one" } },
        { name: "two@example.com", credentials: { access_token: "two" } },
      ],
    },
    NOW,
  );

  assert.equal(result.ok, true);
  assert.equal(result.downloads.length, 2);
  assert.equal(result.downloads[0].filename, "one@example.com.json");
  assert.equal(result.downloads[1].filename, "two@example.com.json");
});

test("rejects sub2api JSON without accounts array", async () => {
  const { buildSub2apiToCpaDownloads } = await loadConverterModule();

  const result = buildSub2apiToCpaDownloads({ users: [] }, NOW);

  assert.equal(result.ok, false);
  assert.equal(result.code, "missing_accounts");
});

test("rejects empty sub2api accounts array", async () => {
  const { buildSub2apiToCpaDownloads } = await loadConverterModule();

  const result = buildSub2apiToCpaDownloads({ accounts: [] }, NOW);

  assert.equal(result.ok, false);
  assert.equal(result.code, "empty_accounts");
});

test("converts one CPA file into sub2api structure", async () => {
  const { buildCpaToSub2apiDownload } = await loadConverterModule();

  const result = buildCpaToSub2apiDownload(
    [
      {
        filename: "user.json",
        data: {
          email: "user@example.com",
          expired: "2026-07-01T00:00:00Z",
          id_token: "id_token",
          account_id: "org_123",
          access_token: "ac_token",
          refresh_token: "rf_token",
        },
      },
    ],
    NOW,
  );

  assert.equal(result.ok, true);
  assert.equal(result.downloads.length, 1);
  assert.equal(result.downloads[0].filename, "sub2api-account-20260607010203.json");
  assert.deepEqual(hostJson(result.downloads[0].data), {
    exported_at: NOW,
    proxies: [],
    accounts: [
      {
        name: "user@example.com",
        notes: "",
        platform: "openai",
        type: "oauth",
        credentials: {
          access_token: "ac_token",
          email: "user@example.com",
          expires_at: "2026-07-01T00:00:00Z",
          id_token: "id_token",
          organization_id: "org_123",
          refresh_token: "rf_token",
        },
        extra: {},
        concurrency: 0,
        priority: 0,
        rate_multiplier: 1,
        auto_pause_on_expired: true,
      },
    ],
  });
});

test("merges multiple CPA files into one sub2api download", async () => {
  const { buildCpaToSub2apiDownload } = await loadConverterModule();

  const result = buildCpaToSub2apiDownload(
    [
      { filename: "one.json", data: { email: "one@example.com", access_token: "one" } },
      { filename: "two.json", data: { email: "two@example.com", access_token: "two" } },
    ],
    NOW,
  );

  assert.equal(result.ok, true);
  assert.equal(result.downloads.length, 1);
  assert.equal(result.downloads[0].data.accounts.length, 2);
  assert.equal(result.downloads[0].data.accounts[0].name, "one@example.com");
  assert.equal(result.downloads[0].data.accounts[1].name, "two@example.com");
});

test("fills missing optional CPA fields with defaults", async () => {
  const { buildCpaToSub2apiDownload } = await loadConverterModule();

  const result = buildCpaToSub2apiDownload(
    [{ filename: "minimal.json", data: { access_token: "ac_token" } }],
    NOW,
  );

  assert.equal(result.ok, true);
  assert.equal(result.downloads[0].data.accounts[0].name, "account-1");
  assert.equal(result.downloads[0].data.accounts[0].credentials.email, "account-1");
  assert.equal(result.downloads[0].data.accounts[0].credentials.refresh_token, "");
});

test("rejects unrecognizable CPA file", async () => {
  const { buildCpaToSub2apiDownload } = await loadConverterModule();

  const result = buildCpaToSub2apiDownload(
    [{ filename: "bad.json", data: { hello: "world" } }],
    NOW,
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, "invalid_cpa_file");
  assert.equal(result.filename, "bad.json");
});

test("rejects empty CPA file selection", async () => {
  const { buildCpaToSub2apiDownload } = await loadConverterModule();

  const result = buildCpaToSub2apiDownload([], NOW);

  assert.equal(result.ok, false);
  assert.equal(result.code, "missing_file");
  assert.equal(result.message, "请选择 CPA JSON 文件。");
});

test("rejects empty sub2api preview file selection", async () => {
  const { buildConverterPreview } = await loadConverterModule();

  const result = buildConverterPreview("sub2api-to-cpa", [], NOW);

  assert.equal(result.ok, false);
  assert.equal(result.code, "missing_file");
  assert.equal(result.message, "请选择 JSON 文件。");
});

test("formats byte counts for upload labels", async () => {
  const { formatBytes } = await loadConverterModule();

  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(Number.POSITIVE_INFINITY), "0 B");
  assert.equal(formatBytes(-1), "0 B");
});

test("masks long strings in previews", async () => {
  const { maskLongStrings } = await loadConverterModule();

  const masked = maskLongStrings({
    access_token: "a".repeat(120),
    nested: { refresh_token: "b".repeat(120) },
  });

  assert.equal(masked.access_token, `${"a".repeat(38)}...${"a".repeat(18)}`);
  assert.equal(masked.nested.refresh_token, `${"b".repeat(38)}...${"b".repeat(18)}`);
});

test("sanitizes unsafe file name characters", async () => {
  const { safeFileName } = await loadConverterModule();

  assert.equal(safeFileName('bad\\\\/:*?"<>|name'), "bad__________name");
});

test("builds a masked converter preview", async () => {
  const { buildConverterPreview } = await loadConverterModule();

  const result = buildConverterPreview(
    "cpa-to-sub2api",
    [
      {
        filename: "user.json",
        data: {
          email: "user@example.com",
          access_token: "a".repeat(120),
        },
      },
    ],
    NOW,
  );

  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.notEqual(result.title, "");
  assert.deepEqual(hostJson(result.warnings), []);
  assert.notEqual(result.message, "");
  assert.equal(result.sample.将合并CPA文件数, 1);
  assert.equal(
    result.sample.sub2api结构示例.accounts[0].credentials.access_token,
    `${"a".repeat(38)}...${"a".repeat(18)}`,
  );
});
