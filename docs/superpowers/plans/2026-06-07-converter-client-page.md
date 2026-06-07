# Converter Client Page Implementation Plan
测试页面地址：

http://129.204.48.16:8000/converter
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/converter` as a public React page for CPA / sub2api conversion, using local browser-only conversion by default.

**Architecture:** Put format mapping and validation in a pure front-end library, then build a public React page around it. Add `/converter` to the existing public-route bypass used by `/pxl-plus` and `/luckmail-code`, and document that `converter.html` is no longer the production entry.

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, Tailwind CSS 4, lucide-react, Node built-in test runner.

---

## File Structure

- Create `frontend/src/lib/account-converter.ts`
  - Owns CPA / sub2api mapping, validation, preview masking, file-name sanitizing, byte formatting, and download payload construction.
  - Does not touch DOM APIs, localStorage, backend APIs, or React state.
- Create `frontend/tests/account-converter.test.mjs`
  - Tests the pure converter module by transpiling TypeScript with the repo's existing lightweight Node test pattern.
- Create `frontend/tests/public-routes.test.mjs`
  - Tests that `/converter` is recognized as a public route and that existing public routes keep working.
- Modify `frontend/src/lib/public-routes.ts`
  - Adds `/converter` to the public client route set.
- Create `frontend/src/pages/ConverterClient.tsx`
  - Owns browser file input, drag/drop, FileReader JSON parsing, preview state, and Blob downloads.
  - Calls only `frontend/src/lib/account-converter.ts` for conversion.
- Modify `frontend/src/App.tsx`
  - Imports and renders `ConverterClient` before the backend auth gate when the public route is `/converter`.
- Modify `docs/features/public-client-pages.md`
  - Adds `/converter` as a public page with no backend API.
- Modify `docs/architecture/frontend.md`
  - Adds `/converter` to the public route list and notes browser-local conversion.

Implementation decision for `converter.html`: keep it untouched as a legacy/offline helper. Production docs should point users to `/converter`.

Because this repository currently has unrelated staged and modified files, every commit command below uses explicit paths and `git commit --only`.

---

### Task 1: Pure Converter Logic

**Files:**
- Create: `frontend/tests/account-converter.test.mjs`
- Create: `frontend/src/lib/account-converter.ts`

- [ ] **Step 1: Write the failing converter tests**

Create `frontend/tests/account-converter.test.mjs`:

```js
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
  assert.equal(result.downloads.length, 1);
  assert.equal(result.downloads[0].filename, "user@example.com.json");
  assert.deepEqual(result.downloads[0].data, {
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
  assert.deepEqual(result.downloads[0].data, {
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

  assert.equal(safeFileName('bad\\\\/:*?"<>|name'), "bad_________name");
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
  assert.equal(result.sample.将合并CPA文件数, 1);
  assert.equal(
    result.sample.sub2api结构示例.accounts[0].credentials.access_token,
    `${"a".repeat(38)}...${"a".repeat(18)}`,
  );
});
```

- [ ] **Step 2: Run the converter tests to verify they fail**

Run:

```powershell
cd frontend
node --test tests/account-converter.test.mjs
```

Expected: FAIL with an `ENOENT` error for `src/lib/account-converter.ts`.

- [ ] **Step 3: Implement the converter module**

Create `frontend/src/lib/account-converter.ts`:

```ts
export type ConverterMode = "sub2api-to-cpa" | "cpa-to-sub2api";

export type NamedJsonInput = {
  filename: string;
  data: unknown;
};

export type JsonObject = Record<string, unknown>;

export type DownloadItem = {
  filename: string;
  data: JsonObject;
};

export type ConverterErrorCode =
  | "missing_file"
  | "invalid_json"
  | "missing_accounts"
  | "empty_accounts"
  | "invalid_cpa_file"
  | "conversion_failed";

export type ConverterErrorResult = {
  ok: false;
  code: ConverterErrorCode;
  message: string;
  filename?: string;
};

export type DownloadResult =
  | {
      ok: true;
      downloads: DownloadItem[];
      warnings: string[];
      message: string;
    }
  | ConverterErrorResult;

export type PreviewResult =
  | {
      ok: true;
      count: number;
      title: string;
      sample: unknown;
      warnings: string[];
      message: string;
    }
  | ConverterErrorResult;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(source: JsonObject, key: string) {
  const value = source[key];
  return typeof value === "string" ? value.trim() : "";
}

function firstString(...values: string[]) {
  return values.find((value) => value.length > 0) || "";
}

function credentialsFromAccount(account: JsonObject) {
  const credentials = account.credentials;
  return isObject(credentials) ? credentials : {};
}

function errorResult(
  code: ConverterErrorCode,
  message: string,
  filename?: string,
): ConverterErrorResult {
  return filename ? { ok: false, code, message, filename } : { ok: false, code, message };
}

export function safeFileName(name: string) {
  const safe = String(name || "account")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "_");
  return safe || "account";
}

export function toTimestampFilePart(isoValue: string) {
  const stamp = String(isoValue || "")
    .replace(/[-:T.Z]/g, "")
    .slice(0, 14);
  return stamp || "export";
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function maskLongStrings(value: unknown, head = 38, tail = 18): unknown {
  if (Array.isArray(value)) return value.map((item) => maskLongStrings(item, head, tail));
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, maskLongStrings(item, head, tail)]),
    );
  }
  if (typeof value === "string" && value.length > head + tail + 3) {
    return `${value.slice(0, head)}...${value.slice(-tail)}`;
  }
  return value;
}

export function cpaFromSub2apiAccount(
  accountValue: unknown,
  index: number,
  nowIso: string,
): JsonObject {
  const account = isObject(accountValue) ? accountValue : {};
  const credentials = credentialsFromAccount(account);
  const email = firstString(
    readString(credentials, "email"),
    readString(account, "name"),
    `account-${index + 1}`,
  );

  return {
    type: "codex",
    email,
    expired: readString(credentials, "expires_at"),
    id_token: readString(credentials, "id_token"),
    account_id: readString(credentials, "organization_id"),
    access_token: readString(credentials, "access_token"),
    last_refresh: nowIso,
    refresh_token: readString(credentials, "refresh_token"),
  };
}

function hasRecognizableCpaFields(cpa: JsonObject) {
  return [
    "email",
    "expired",
    "id_token",
    "account_id",
    "access_token",
    "refresh_token",
  ].some((key) => readString(cpa, key).length > 0);
}

export function sub2apiAccountFromCpa(cpaValue: unknown, index: number): JsonObject {
  const cpa = isObject(cpaValue) ? cpaValue : {};
  const email = firstString(readString(cpa, "email"), `account-${index + 1}`);

  return {
    name: email,
    notes: "",
    platform: "openai",
    type: "oauth",
    credentials: {
      access_token: readString(cpa, "access_token"),
      email,
      expires_at: readString(cpa, "expired"),
      id_token: readString(cpa, "id_token"),
      organization_id: readString(cpa, "account_id"),
      refresh_token: readString(cpa, "refresh_token"),
    },
    extra: {},
    concurrency: 0,
    priority: 0,
    rate_multiplier: 1,
    auto_pause_on_expired: true,
  };
}

export function buildSub2apiToCpaDownloads(
  data: unknown,
  nowIso = new Date().toISOString(),
): DownloadResult {
  if (!isObject(data) || !Array.isArray(data.accounts)) {
    return errorResult(
      "missing_accounts",
      "sub2api JSON 根节点必须包含 accounts 数组。",
    );
  }
  if (data.accounts.length === 0) {
    return errorResult("empty_accounts", "没有在 accounts 中找到账号。");
  }

  const downloads = data.accounts.map((account, index) => {
    const cpa = cpaFromSub2apiAccount(account, index, nowIso);
    const email = readString(cpa, "email") || `account-${index + 1}`;
    return {
      filename: `${safeFileName(email)}.json`,
      data: cpa,
    };
  });

  return {
    ok: true,
    downloads,
    warnings: [],
    message: `已准备 ${downloads.length} 个 CPA JSON 文件。`,
  };
}

export function buildCpaToSub2apiDownload(
  inputs: NamedJsonInput[],
  nowIso = new Date().toISOString(),
): DownloadResult {
  if (inputs.length === 0) {
    return errorResult("missing_file", "请选择 CPA JSON 文件。");
  }

  const accounts: JsonObject[] = [];
  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    if (!isObject(input.data) || !hasRecognizableCpaFields(input.data)) {
      return errorResult(
        "invalid_cpa_file",
        `${input.filename} 缺少可识别的 CPA 账号字段。`,
        input.filename,
      );
    }
    accounts.push(sub2apiAccountFromCpa(input.data, index));
  }

  return {
    ok: true,
    downloads: [
      {
        filename: `sub2api-account-${toTimestampFilePart(nowIso)}.json`,
        data: {
          exported_at: nowIso,
          proxies: [],
          accounts,
        },
      },
    ],
    warnings: [],
    message: `已合并 ${accounts.length} 个 CPA 账号。`,
  };
}

export function buildConverterPreview(
  mode: ConverterMode,
  inputs: NamedJsonInput[],
  nowIso = new Date().toISOString(),
): PreviewResult {
  if (inputs.length === 0) {
    return errorResult("missing_file", "请选择 JSON 文件。");
  }

  if (mode === "sub2api-to-cpa") {
    const result = buildSub2apiToCpaDownloads(inputs[0].data, nowIso);
    if (!result.ok) return result;
    const sample = result.downloads[0]?.data || null;
    return {
      ok: true,
      count: result.downloads.length,
      title: "将生成 CPA 文件",
      sample: maskLongStrings({
        将生成CPA文件数: result.downloads.length,
        示例: sample,
      }),
      warnings: result.warnings,
      message: `已识别 ${result.downloads.length} 个 sub2api 账号。`,
    };
  }

  const result = buildCpaToSub2apiDownload(inputs, nowIso);
  if (!result.ok) return result;
  const data = result.downloads[0].data;
  const accounts = Array.isArray(data.accounts) ? data.accounts.slice(0, 1) : [];

  return {
    ok: true,
    count: inputs.length,
    title: "将合并 CPA 文件",
    sample: maskLongStrings({
      将合并CPA文件数: inputs.length,
      sub2api结构示例: {
        ...data,
        accounts,
      },
    }),
    warnings: result.warnings,
    message: `已选择 ${inputs.length} 个 CPA 文件。`,
  };
}
```

- [ ] **Step 4: Run the converter tests to verify they pass**

Run:

```powershell
cd frontend
node --test tests/account-converter.test.mjs
```

Expected: PASS, with all tests in `tests/account-converter.test.mjs` passing.

- [ ] **Step 5: Commit Task 1**

Run from repo root:

```powershell
git add -- frontend/tests/account-converter.test.mjs frontend/src/lib/account-converter.ts
git commit --only frontend/tests/account-converter.test.mjs frontend/src/lib/account-converter.ts -m "feat: add account converter logic"
```

Expected: one commit containing only the converter test and converter library.

---

### Task 2: Public Route Registration

**Files:**
- Create: `frontend/tests/public-routes.test.mjs`
- Modify: `frontend/src/lib/public-routes.ts`

- [ ] **Step 1: Write the failing public route tests**

Create `frontend/tests/public-routes.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

async function loadPublicRoutesModule() {
  const filePath = path.resolve("src/lib/public-routes.ts");
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

test("recognizes converter as a public route", async () => {
  const { getPublicClientRoute } = await loadPublicRoutesModule();

  assert.equal(getPublicClientRoute("/converter"), "/converter");
  assert.equal(getPublicClientRoute("/converter/"), "/converter");
});

test("keeps existing public client routes", async () => {
  const { getPublicClientRoute } = await loadPublicRoutesModule();

  assert.equal(getPublicClientRoute("/pxl-plus"), "/pxl-plus");
  assert.equal(getPublicClientRoute("/luckmail-code"), "/luckmail-code");
});

test("does not match nested converter paths", async () => {
  const { getPublicClientRoute } = await loadPublicRoutesModule();

  assert.equal(getPublicClientRoute("/converter/nested"), "");
});
```

- [ ] **Step 2: Run the public route test to verify it fails**

Run:

```powershell
cd frontend
node --test tests/public-routes.test.mjs
```

Expected: FAIL because `getPublicClientRoute("/converter")` currently returns an empty string.

- [ ] **Step 3: Add `/converter` to public route registration**

Replace the first line of `frontend/src/lib/public-routes.ts` with:

```ts
const PUBLIC_CLIENT_ROUTES = new Set(["/pxl-plus", "/luckmail-code", "/converter"]);
```

Keep the rest of the file unchanged:

```ts
export function normalizePublicPath(pathname: string) {
  const path = String(pathname || "").trim() || "/";
  if (path === "/") return path;
  return path.replace(/\/+$/, "");
}

export function isPublicClientRoute(pathname: string, route: string) {
  return normalizePublicPath(pathname) === route;
}

export function getPublicClientRoute(pathname: string) {
  const normalized = normalizePublicPath(pathname);
  return PUBLIC_CLIENT_ROUTES.has(normalized) ? normalized : "";
}
```

- [ ] **Step 4: Run the public route test to verify it passes**

Run:

```powershell
cd frontend
node --test tests/public-routes.test.mjs
```

Expected: PASS, with all tests in `tests/public-routes.test.mjs` passing.

- [ ] **Step 5: Commit Task 2**

Run from repo root:

```powershell
git add -- frontend/tests/public-routes.test.mjs frontend/src/lib/public-routes.ts
git commit --only frontend/tests/public-routes.test.mjs frontend/src/lib/public-routes.ts -m "feat: register converter public route"
```

Expected: one commit containing only the public route test and route registration.

---

### Task 3: Converter Public Page UI

**Files:**
- Create: `frontend/src/pages/ConverterClient.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create the converter page component**

Create `frontend/src/pages/ConverterClient.tsx`:

```tsx
import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent } from "react";
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  Download,
  FileJson,
  Files,
  Loader2,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  buildConverterPreview,
  buildCpaToSub2apiDownload,
  buildSub2apiToCpaDownloads,
  formatBytes,
} from "@/lib/account-converter";
import type {
  ConverterMode,
  NamedJsonInput,
  PreviewResult,
} from "@/lib/account-converter";
import { cn } from "@/lib/utils";

type BannerTone = "neutral" | "loading" | "success" | "warning" | "error";

type ParsedFile = NamedJsonInput & {
  size: number;
};

type BannerState = {
  tone: BannerTone;
  message: string;
};

const MODE_OPTIONS = [
  {
    value: "sub2api-to-cpa",
    label: "sub2api 转 CPA",
    description: "选择 1 个 sub2api JSON，按账号拆分下载。",
    Icon: FileJson,
  },
  {
    value: "cpa-to-sub2api",
    label: "CPA 转 sub2api",
    description: "选择多个 CPA JSON，合并成 sub2api 文件。",
    Icon: Files,
  },
] satisfies {
  value: ConverterMode;
  label: string;
  description: string;
  Icon: typeof FileJson;
}[];

function readJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result || "")));
      } catch (error) {
        const message = error instanceof Error ? error.message : "JSON 解析失败";
        reject(new Error(`${file.name} 不是有效 JSON：${message}`));
      }
    };
    reader.onerror = () => reject(new Error(`${file.name} 读取失败。`));
    reader.readAsText(file, "utf-8");
  });
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ConverterClient() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<ConverterMode>("sub2api-to-cpa");
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<BannerState>({
    tone: "neutral",
    message: "本地转换模式：文件只在当前浏览器解析，不上传服务器。",
  });

  const isSub2apiToCpa = mode === "sub2api-to-cpa";
  const canConvert = files.length > 0 && previewResult?.ok === true && !busy;

  const previewText = useMemo(() => {
    if (!previewResult) {
      return JSON.stringify({ 提示: "选择文件后会显示脱敏结构预览" }, null, 2);
    }
    if (!previewResult.ok) {
      return JSON.stringify({ 错误: previewResult.message }, null, 2);
    }
    return JSON.stringify(previewResult.sample, null, 2);
  }, [previewResult]);

  const resetSelection = () => {
    setFiles([]);
    setPreviewResult(null);
    setBanner({
      tone: "neutral",
      message: "本地转换模式：文件只在当前浏览器解析，不上传服务器。",
    });
    if (inputRef.current) inputRef.current.value = "";
  };

  const updateMode = (nextMode: ConverterMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    resetSelection();
  };

  const openFilePicker = () => {
    inputRef.current?.click();
  };

  const loadFiles = async (fileList: FileList | null) => {
    const nextFiles = Array.from(fileList || []);
    const limitedFiles = isSub2apiToCpa ? nextFiles.slice(0, 1) : nextFiles;

    if (limitedFiles.length === 0) {
      resetSelection();
      setBanner({ tone: "error", message: "请选择 JSON 文件。" });
      return;
    }

    setBusy(true);
    setBanner({ tone: "loading", message: "正在读取 JSON 文件..." });

    try {
      const parsed = await Promise.all(
        limitedFiles.map(async (file) => ({
          filename: file.name,
          size: file.size,
          data: await readJsonFile(file),
        })),
      );
      const preview = buildConverterPreview(mode, parsed);
      setFiles(parsed);
      setPreviewResult(preview);

      if (!preview.ok) {
        setBanner({ tone: "error", message: preview.message });
        return;
      }

      setBanner({
        tone: preview.warnings.length ? "warning" : "success",
        message: preview.message,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "文件读取失败。";
      setFiles([]);
      setPreviewResult({
        ok: false,
        code: "invalid_json",
        message,
      });
      setBanner({ tone: "error", message });
    } finally {
      setBusy(false);
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    void loadFiles(event.target.files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void loadFiles(event.dataTransfer.files);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFilePicker();
    }
  };

  const convertAndDownload = () => {
    if (!files.length) {
      setBanner({ tone: "error", message: "请选择 JSON 文件。" });
      return;
    }

    setBusy(true);
    const nowIso = new Date().toISOString();
    const result = isSub2apiToCpa
      ? buildSub2apiToCpaDownloads(files[0].data, nowIso)
      : buildCpaToSub2apiDownload(files, nowIso);

    if (!result.ok) {
      setPreviewResult(result);
      setBanner({ tone: "error", message: result.message });
      setBusy(false);
      return;
    }

    result.downloads.forEach((download, index) => {
      window.setTimeout(() => downloadJson(download.filename, download.data), index * 120);
    });

    setBanner({
      tone: "success",
      message:
        result.downloads.length > 1
          ? `已触发下载 ${result.downloads.length} 个文件；如果浏览器拦截多文件下载，请允许此站点下载多个文件。`
          : "已触发下载 1 个文件。",
    });
    setBusy(false);
  };

  const BannerIcon =
    banner.tone === "success"
      ? CheckCircle2
      : banner.tone === "error"
        ? XCircle
        : banner.tone === "loading"
          ? Loader2
          : AlertCircle;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[var(--bg-base)] px-4 py-6 text-[var(--text-primary)] sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-hard)] lg:grid-cols-[0.88fr_1.12fr]">
          <div className="min-w-0 border-b border-[var(--border)] p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="mb-5 flex items-center gap-3">
              <div className="eco-icon h-11 w-11 shrink-0">
                <ArrowRightLeft className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                  CPA / sub2api 转换工具
                </h1>
                <p className="mt-1 break-words text-sm text-[var(--text-muted)]">
                  双向转换账号 JSON，默认在浏览器本地完成。
                </p>
              </div>
            </div>

            <div
              className={cn(
                "mb-5 flex gap-2 rounded-xl border px-3 py-2.5 text-sm leading-relaxed",
                banner.tone === "success" &&
                  "border-emerald-500/25 bg-emerald-500/10 text-emerald-600",
                banner.tone === "warning" &&
                  "border-amber-500/25 bg-amber-500/10 text-amber-600",
                banner.tone === "error" &&
                  "border-red-500/25 bg-red-500/10 text-red-600",
                banner.tone === "loading" &&
                  "border-[var(--accent-edge)] bg-[var(--accent-soft)] text-[var(--accent)]",
                banner.tone === "neutral" &&
                  "border-[var(--border)] bg-[var(--bg-pane)]/60 text-[var(--text-secondary)]",
              )}
              role={banner.tone === "error" ? "alert" : "status"}
            >
              <BannerIcon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  banner.tone === "loading" && "animate-spin",
                )}
              />
              <span className="min-w-0 break-words">{banner.message}</span>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-2 text-sm font-medium text-[var(--text-secondary)]">
                  转换方式
                </div>
                <div className="grid gap-2">
                  {MODE_OPTIONS.map((option) => {
                    const Icon = option.Icon;
                    const active = mode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateMode(option.value)}
                        className={cn(
                          "flex min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                          active
                            ? "border-[var(--accent-edge)] bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "border-[var(--border)] bg-[var(--bg-pane)]/40 text-[var(--text-secondary)] hover:border-[var(--accent-edge)]",
                        )}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-current/20">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{option.label}</span>
                          <span className="mt-0.5 block break-words text-xs opacity-80">
                            {option.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={openFilePicker}
                onKeyDown={handleKeyDown}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragging(false);
                }}
                onDrop={handleDrop}
                className={cn(
                  "flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center transition-colors",
                  dragging
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] bg-[var(--bg-pane)]/35 hover:border-[var(--accent-edge)]",
                )}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept=".json,application/json"
                  multiple={!isSub2apiToCpa}
                  onChange={handleInputChange}
                  className="sr-only"
                />
                <div className="eco-icon mb-3 h-12 w-12">
                  <UploadCloud className="h-5 w-5" />
                </div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {isSub2apiToCpa ? "选择 sub2api JSON" : "选择 CPA JSON 文件"}
                </div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">
                  {isSub2apiToCpa ? "当前模式只读取 1 个文件" : "当前模式支持多个文件"}
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-pane)]/35 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    已选文件
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">{files.length} 个</span>
                </div>
                {files.length ? (
                  <ul className="max-h-40 space-y-2 overflow-auto">
                    {files.map((file) => (
                      <li
                        key={`${file.filename}-${file.size}`}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 text-xs"
                      >
                        <span className="min-w-0 truncate font-mono text-[var(--text-secondary)]">
                          {file.filename}
                        </span>
                        <span className="shrink-0 text-[var(--text-muted)]">
                          {formatBytes(file.size)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="flex min-h-20 items-center justify-center rounded-lg border border-dashed border-[var(--border)] text-sm text-[var(--text-muted)]">
                    等待选择文件
                  </div>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <Button type="button" size="lg" onClick={convertAndDownload} disabled={!canConvert}>
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  转换并下载
                </Button>
                <Button type="button" variant="outline" size="lg" onClick={resetSelection}>
                  清空
                </Button>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-5 bg-[var(--bg-pane)]/35 p-5 sm:p-6">
            <div className="flex min-w-0 items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  转换预览
                </h2>
                <p className="mt-1 break-words text-xs text-[var(--text-muted)]">
                  预览会自动隐藏较长 token。
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                <ShieldCheck className="h-3.5 w-3.5" />
                本地
              </div>
            </div>

            {previewResult?.ok ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoTile label="识别数量" value={`${previewResult.count}`} />
                <InfoTile label="当前模式" value={isSub2apiToCpa ? "拆分 CPA" : "合并 sub2api"} />
              </div>
            ) : null}

            <pre className="max-h-[560px] min-h-[420px] overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg-input)] p-4 text-xs leading-relaxed text-[var(--text-secondary)]">
              <code className="break-all whitespace-pre-wrap">{previewText}</code>
            </pre>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
      <div className="text-xs text-[var(--text-muted)]">{label}</div>
      <div className="mt-1 min-w-0 truncate font-mono text-sm font-semibold text-[var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build before route wiring**

Run:

```powershell
cd frontend
npm run build
```

Expected: PASS. This verifies `ConverterClient.tsx` and `account-converter.ts` compile under strict TypeScript even before the route imports the page.

- [ ] **Step 3: Wire the page into `App.tsx`**

Add this import next to the other public page imports in `frontend/src/App.tsx`:

```ts
import ConverterClient from "@/pages/ConverterClient";
```

Add this public route branch in `AppContent`, after `const publicRoute = getPublicClientRoute(window.location.pathname);` and before the existing `/pxl-plus` branch:

```tsx
  if (publicRoute === "/converter") {
    return (
      <BrowserRouter>
        <ConverterClient />
      </BrowserRouter>
    );
  }
```

The public route block should read:

```tsx
  const publicRoute = getPublicClientRoute(window.location.pathname);

  if (publicRoute === "/converter") {
    return (
      <BrowserRouter>
        <ConverterClient />
      </BrowserRouter>
    );
  }

  if (publicRoute === "/pxl-plus") {
    return (
      <BrowserRouter>
        <PxlPlusClient />
      </BrowserRouter>
    );
  }

  if (publicRoute === "/luckmail-code") {
    return (
      <BrowserRouter>
        <LuckMailCodeClient />
      </BrowserRouter>
    );
  }
```

- [ ] **Step 4: Build after route wiring**

Run:

```powershell
cd frontend
npm run build
```

Expected: PASS. This verifies `/converter` route wiring and all front-end TypeScript.

- [ ] **Step 5: Commit Task 3**

Run from repo root:

```powershell
git add -- frontend/src/pages/ConverterClient.tsx frontend/src/App.tsx
git commit --only frontend/src/pages/ConverterClient.tsx frontend/src/App.tsx -m "feat: add converter public page"
```

Expected: one commit containing only the converter page component and `App.tsx` route branch.

---

### Task 4: Public Page Documentation

**Files:**
- Modify: `docs/features/public-client-pages.md`
- Modify: `docs/architecture/frontend.md`

- [ ] **Step 1: Update public client page docs**

In `docs/features/public-client-pages.md`, add `/converter` to the current public routes list so it reads:

```md
当前公开路由：

- `/pxl-plus`
- `/luckmail-code`
- `/converter`
```

Append this section after the route list or after the existing `/luckmail-code` section:

````md
## `/converter`

页面组件：

```text
frontend/src/pages/ConverterClient.tsx
```

转换逻辑：

```text
frontend/src/lib/account-converter.ts
```

后端接口：

```text
无。默认本地转换，不上传文件。
```

### 支持格式

- `sub2api -> CPA`: 选择一个 sub2api JSON，根据 `accounts` 数组拆分出多个 CPA JSON。
- `CPA -> sub2api`: 选择一个或多个 CPA JSON，合并为一个 sub2api JSON。

### 安全策略

- 页面使用浏览器 `FileReader` 读取 JSON。
- 页面不调用后端 API。
- 页面不写 localStorage、sessionStorage 或 IndexedDB。
- 结构预览会脱敏长 token。
- 下载文件由浏览器 Blob 生成。
- 根目录 `converter.html` 仅作为历史离线辅助入口；生产入口以 `/converter` 为准。
````

- [ ] **Step 2: Update front-end architecture docs**

In `docs/architecture/frontend.md`, update the public route list so it includes `/converter`:

```md
公开路由先于后台登录判断渲染：

- `/pxl-plus` -> `frontend/src/pages/PxlPlusClient.tsx`
- `/luckmail-code` -> `frontend/src/pages/LuckMailCodeClient.tsx`
- `/converter` -> `frontend/src/pages/ConverterClient.tsx`
```

Update the public route set example so it reads:

```ts
const PUBLIC_CLIENT_ROUTES = new Set(["/pxl-plus", "/luckmail-code", "/converter"]);
```

Add this paragraph under the public route section:

```md
`/converter` 是浏览器本地转换页，转换逻辑在 `frontend/src/lib/account-converter.ts`。该页面默认不调用后端 API，不携带后台 Authorization，也不上传用户选择的 JSON 文件。
```

- [ ] **Step 3: Verify docs diff**

Run:

```powershell
git diff -- docs/features/public-client-pages.md docs/architecture/frontend.md
```

Expected: diff only documents `/converter`; no unrelated sections are changed.

- [ ] **Step 4: Commit Task 4**

Run from repo root:

```powershell
git add -- docs/features/public-client-pages.md docs/architecture/frontend.md
git commit --only docs/features/public-client-pages.md docs/architecture/frontend.md -m "docs: document converter public page"
```

Expected: one commit containing only the two documentation files.

---

### Task 5: Full Verification

**Files:**
- Read/verify only; no code changes.

- [ ] **Step 1: Run converter unit tests**

Run:

```powershell
cd frontend
node --test tests/account-converter.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run public route unit tests**

Run:

```powershell
cd frontend
node --test tests/public-routes.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run existing public helper tests**

Run:

```powershell
cd frontend
node --test tests/session-token.test.mjs tests/luckmail-ticket.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```powershell
cd frontend
npm run build
```

Expected: PASS and `../static` is rebuilt.

- [ ] **Step 5: Start local dev server for browser verification**

Run:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

Expected: Vite prints a local URL containing `http://127.0.0.1:5173/`.

- [ ] **Step 6: Verify `/converter` in a browser**

Open:

```text
http://127.0.0.1:5173/converter
```

Check these items:

- Page title shows `CPA / sub2api 转换工具`.
- The page shows `本地` status and does not show a backend login form.
- Default mode is `sub2api 转 CPA`.
- Clicking `CPA 转 sub2api` clears selected files and preview.
- Invalid JSON shows a readable error.
- A valid sub2api JSON previews the number of accounts and masks long tokens.
- A valid CPA JSON previews the sub2api sample and masks long tokens.
- Mobile width around 375px has no horizontal scrolling.

- [ ] **Step 7: Verify production fallback route**

After `npm run build`, run the FastAPI app in the repo root:

```powershell
python main.py
```

Open:

```text
http://127.0.0.1:8000/converter
```

Expected:

- The page loads through FastAPI SPA fallback.
- No backend Authorization token is required to view the page.
- The page still performs conversion locally.

- [ ] **Step 8: Review final git state**

Run:

```powershell
git status --short frontend/src/lib/account-converter.ts frontend/tests/account-converter.test.mjs frontend/tests/public-routes.test.mjs frontend/src/lib/public-routes.ts frontend/src/pages/ConverterClient.tsx frontend/src/App.tsx docs/features/public-client-pages.md docs/architecture/frontend.md
```

Expected: no output for these implementation files after all task commits. Unrelated files already present in the broader worktree may still appear if running plain `git status --short`.

---

## Self-Review Checklist

- Spec coverage:
  - `/converter` public route: Task 2 and Task 3.
  - Browser-local conversion: Task 1 and Task 3.
  - CPA / sub2api bidirectional mapping: Task 1.
  - Drag/drop, file list, preview, download feedback: Task 3.
  - Token masking and no storage/no backend calls: Task 1, Task 3, Task 4.
  - Future backend boundary documented: Task 4 links production entry and local-only behavior; backend API is not implemented by design.
- Type consistency:
  - `ConverterMode` values match route UI mode values.
  - `NamedJsonInput` is used by tests and UI.
  - `PreviewResult` and `DownloadResult` use the same `ok` discriminant.
- Verification:
  - Unit tests cover conversion rules and public route registration.
  - `npm run build` covers TypeScript, React imports, and Vite production bundling.
  - Browser checks cover the user-facing page.
