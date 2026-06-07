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

const LOCAL_CONVERSION_MESSAGE =
  "本地转换模式：文件只在当前浏览器解析，不上传服务器。";

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
    message: LOCAL_CONVERSION_MESSAGE,
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
      message: LOCAL_CONVERSION_MESSAGE,
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
      window.setTimeout(
        () => downloadJson(download.filename, download.data),
        index * 120,
      );
    });

    setBanner({
      tone: result.downloads.length > 1 ? "warning" : "success",
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
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl min-w-0 items-center justify-center">
        <section className="grid w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-hard)] lg:grid-cols-[0.88fr_1.12fr]">
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
                <div
                  className="mb-2 text-sm font-medium text-[var(--text-secondary)]"
                  id="converter-mode-label"
                >
                  转换方式
                </div>
                <div
                  className="grid gap-2"
                  role="radiogroup"
                  aria-labelledby="converter-mode-label"
                >
                  {MODE_OPTIONS.map((option) => {
                    const Icon = option.Icon;
                    const active = mode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => updateMode(option.value)}
                        className={cn(
                          "flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]",
                          active
                            ? "border-[var(--accent-edge)] bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "border-[var(--border)] bg-[var(--bg-pane)]/40 text-[var(--text-secondary)] hover:border-[var(--accent-edge)]",
                        )}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-current/20">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">
                            {option.label}
                          </span>
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
                aria-label="选择或拖放 JSON 文件"
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
                  "flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-6 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-card)]",
                  dragging
                    ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                    : "border-[var(--border)] bg-[var(--bg-pane)]/35 hover:border-[var(--accent-edge)]",
                )}
              >
                <input
                  ref={inputRef}
                  id="converter-file-input"
                  type="file"
                  accept=".json,application/json"
                  multiple={!isSub2apiToCpa}
                  onChange={handleInputChange}
                  className="sr-only"
                  aria-label="选择 JSON 文件"
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
                  <span className="text-xs text-[var(--text-muted)]">
                    {files.length} 个
                  </span>
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
                <Button
                  type="button"
                  size="lg"
                  onClick={convertAndDownload}
                  disabled={!canConvert}
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  转换并下载
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={resetSelection}
                >
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
                <InfoTile
                  label="当前模式"
                  value={isSub2apiToCpa ? "拆分 CPA" : "合并 sub2api"}
                />
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
