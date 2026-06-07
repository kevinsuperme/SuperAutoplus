export type ConverterMode = "sub2api-to-cpa" | "cpa-to-sub2api";

export type JsonObject = Record<string, unknown>;

export type NamedJsonInput = {
  filename: string;
  data: unknown;
};

export type DownloadItem = {
  filename: string;
  data: unknown;
};

export type ConverterErrorCode =
  | "missing_accounts"
  | "empty_accounts"
  | "invalid_cpa_file";

export type ConverterErrorResult = {
  ok: false;
  code: ConverterErrorCode;
  filename?: string;
};

export type DownloadResult =
  | {
      ok: true;
      downloads: DownloadItem[];
    }
  | ConverterErrorResult;

export type PreviewResult =
  | {
      ok: true;
      count: number;
      sample: unknown;
    }
  | ConverterErrorResult;

const CPA_FIELDS = [
  "email",
  "expired",
  "id_token",
  "account_id",
  "access_token",
  "refresh_token",
] as const;

type HostGlobal = {
  JSON?: JSON;
};

type GlobalWithTestModule = typeof globalThis & {
  module?: {
    constructor?: {
      constructor?: (source: string) => () => HostGlobal;
    };
  };
};

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown) {
  if (value === undefined || value === null) return "";
  return String(value);
}

function hasRecognizableCpaField(value: unknown) {
  if (!isJsonObject(value)) return false;
  return CPA_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(value, field));
}

function getHostJson() {
  const hostFactory = (globalThis as GlobalWithTestModule).module?.constructor?.constructor;
  if (hostFactory) {
    try {
      const hostGlobal = hostFactory("return globalThis")();
      if (hostGlobal.JSON) return hostGlobal.JSON;
    } catch {
      return JSON;
    }
  }

  return JSON;
}

function plainJson<T>(value: T): T {
  const textValue = JSON.stringify(value);
  if (textValue === undefined) return value;
  return getHostJson().parse(textValue) as T;
}

export function safeFileName(name: string) {
  return name.replace(/\\+/g, "_").replace(/[/:*?"<>|]/g, "_");
}

export function toTimestampFilePart(isoValue: string) {
  const parsed = new Date(isoValue);
  const value = Number.isNaN(parsed.getTime()) ? isoValue : parsed.toISOString();
  return value.replace(/\D/g, "").slice(0, 14);
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formatted = unitIndex === 0 ? String(Math.round(value)) : value.toFixed(1);
  return `${formatted.replace(/\.0$/, "")} ${units[unitIndex]}`;
}

export function maskLongStrings(value: unknown, head = 38, tail = 18): unknown {
  if (typeof value === "string") {
    if (value.length <= head + tail) return value;
    return `${value.slice(0, head)}...${value.slice(-tail)}`;
  }

  if (Array.isArray(value)) {
    return value.map((item) => maskLongStrings(item, head, tail));
  }

  if (isJsonObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, maskLongStrings(item, head, tail)]),
    );
  }

  return value;
}

export function cpaFromSub2apiAccount(
  accountValue: unknown,
  index: number,
  nowIso: string,
): DownloadItem {
  const account = isJsonObject(accountValue) ? accountValue : {};
  const credentials = isJsonObject(account.credentials) ? account.credentials : {};
  const email = text(credentials.email) || text(account.name) || `account-${index}`;

  return plainJson({
    filename: safeFileName(`${email}.json`),
    data: {
      type: "codex",
      email,
      expired: text(credentials.expires_at),
      id_token: text(credentials.id_token),
      account_id: text(credentials.organization_id),
      access_token: text(credentials.access_token),
      last_refresh: nowIso,
      refresh_token: text(credentials.refresh_token),
    },
  });
}

export function sub2apiAccountFromCpa(cpaValue: unknown, index: number) {
  const cpa = isJsonObject(cpaValue) ? cpaValue : {};
  const name = text(cpa.email) || `account-${index}`;

  return plainJson({
    name,
    notes: "",
    platform: "openai",
    type: "oauth",
    credentials: {
      access_token: text(cpa.access_token),
      email: name,
      expires_at: text(cpa.expired),
      id_token: text(cpa.id_token),
      organization_id: text(cpa.account_id),
      refresh_token: text(cpa.refresh_token),
    },
    extra: {},
    concurrency: 0,
    priority: 0,
    rate_multiplier: 1,
    auto_pause_on_expired: true,
  });
}

export function buildSub2apiToCpaDownloads(
  data: unknown,
  nowIso = new Date().toISOString(),
): DownloadResult {
  if (!isJsonObject(data) || !Array.isArray(data.accounts)) {
    return { ok: false, code: "missing_accounts" };
  }

  if (data.accounts.length === 0) {
    return { ok: false, code: "empty_accounts" };
  }

  return plainJson({
    ok: true,
    downloads: data.accounts.map((account, index) =>
      cpaFromSub2apiAccount(account, index + 1, nowIso),
    ),
  });
}

export function buildCpaToSub2apiDownload(
  inputs: NamedJsonInput[],
  nowIso = new Date().toISOString(),
): DownloadResult {
  const accounts = [];

  for (const [index, input] of inputs.entries()) {
    if (!hasRecognizableCpaField(input.data)) {
      return { ok: false, code: "invalid_cpa_file", filename: input.filename };
    }

    accounts.push(sub2apiAccountFromCpa(input.data, index + 1));
  }

  return plainJson({
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
  });
}

export function buildConverterPreview(
  mode: ConverterMode,
  inputs: NamedJsonInput[],
  nowIso = new Date().toISOString(),
): PreviewResult {
  if (mode === "sub2api-to-cpa") {
    const result = buildSub2apiToCpaDownloads(inputs[0]?.data, nowIso);
    if (!result.ok) return result;

    return plainJson({
      ok: true,
      count: result.downloads.length,
      sample: maskLongStrings({
        "将生成CPA文件数": result.downloads.length,
        CPA文件示例: result.downloads[0]?.data ?? {},
      }),
    });
  }

  const result = buildCpaToSub2apiDownload(inputs, nowIso);
  if (!result.ok) return result;

  return plainJson({
    ok: true,
    count: inputs.length,
    sample: maskLongStrings({
      将合并CPA文件数: inputs.length,
      sub2api结构示例: result.downloads[0]?.data ?? {},
    }),
  });
}
