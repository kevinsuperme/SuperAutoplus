/**
 * SRRI - Stripe Radar Risk Inspector
 * 支付前环境诊断 / 风控信号检测 / 最优路径推荐
 * 全部客户端运行，零数据上传。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, ScanLine, RotateCcw, Copy, Check, Loader2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n-context";
import {
  type IPInfo, type TimezoneInfo, type LanguageInfo, type WebRTCInfo,
  type BINInfo, type RiskResult, type Prescription, type Attempt, type AddressInfo,
  detectIP, checkTimezone, checkLanguage, checkWebRTCLeak, lookupBIN,
  calculateRiskScore, generatePrescriptions, generateAddress,
} from "@/lib/srri-data";

const STORAGE_KEY = "srri_attempts";
const STORAGE_BILLING = "srri_billing_cc";

type Severity = "critical" | "warning" | "info" | "success";

const SEVERITY_STYLES: Record<Severity, { border: string; tag: string }> = {
  critical: { border: "border-l-red-500", tag: "bg-red-500/15 text-red-500" },
  warning: { border: "border-l-yellow-500", tag: "bg-yellow-500/15 text-yellow-500" },
  info: { border: "border-l-blue-500", tag: "bg-blue-500/15 text-blue-500" },
  success: { border: "border-l-green-500", tag: "bg-green-500/15 text-green-500" },
};

function getGaugeColor(score: number): { stroke: string; text: string; label: string } {
  if (score >= 40) return { stroke: "#f85149", text: "text-red-500", label: "高风险" };
  if (score >= 15) return { stroke: "#d29922", text: "text-yellow-500", label: "中风险" };
  return { stroke: "#3fb950", text: "text-green-500", label: "低风险" };
}

function RiskGauge({ score }: { score: number | null }) {
  const circumference = 251;
  const dashLen = score !== null ? (score / 100) * circumference : 0;
  const { stroke, text, label } = score !== null ? getGaugeColor(score) : { stroke: "#30363d", text: "text-[var(--text-muted)]", label: "等待扫描" };

  return (
    <div className="relative inline-block h-[120px] w-[200px]">
      <svg className="h-full w-full" viewBox="0 0 200 120">
        <path d="M 20 110 A 80 80 0 0 1 180 110" fill="none" stroke="var(--border)" strokeWidth="14" strokeLinecap="round" />
        <path
          d="M 20 110 A 80 80 0 0 1 180 110"
          fill="none"
          stroke={stroke}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${dashLen} ${circumference}`}
          style={{ transition: "stroke-dasharray .6s ease, stroke .3s" }}
        />
      </svg>
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
        <div className={`text-[42px] font-extrabold leading-none ${text}`}>
          {score !== null ? score : "—"}
        </div>
        <div className="mt-0.5 text-[13px] text-[var(--text-muted)]">{label} / Radar 视角</div>
      </div>
    </div>
  );
}

function CheckItem({ icon, name, detail }: { icon: string; name: string; detail: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-b border-[var(--border-soft)] py-2.5 last:border-b-0">
      <div className="w-6 shrink-0 text-center text-lg">{icon}</div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-[var(--text-primary)]">{name}</div>
        <div className="mt-0.5 text-[13px] text-[var(--text-muted)]">{detail}</div>
      </div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-[var(--bg-input)] px-1.5 py-0.5 text-xs text-[var(--text-accent)]">{children}</code>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [value]);

  return (
    <button
      onClick={handleCopy}
      className="flex-shrink-0 rounded border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-0.5 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export default function SrriInspector() {
  const { t } = useI18n();
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [ip, setIp] = useState<IPInfo | null>(null);
  const [tz, setTz] = useState<TimezoneInfo | null>(null);
  const [lang, setLang] = useState<LanguageInfo | null>(null);
  const [webrtc, setWebrtc] = useState<WebRTCInfo | null>(null);
  const [billingCC, setBillingCC] = useState(() => localStorage.getItem(STORAGE_BILLING) || "");
  const [binInput, setBinInput] = useState("");
  const [binInfo, setBinInfo] = useState<BINInfo | null>(null);
  const [binLoading, setBinLoading] = useState(false);
  const [binError, setBinError] = useState("");
  const [addrCountry, setAddrCountry] = useState("");
  const [currentAddr, setCurrentAddr] = useState<AddressInfo | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
  });

  // 风险评分
  const riskResult: RiskResult = useMemo(() => {
    const checks = { ip, tz, lang, webrtc };
    return calculateRiskScore(checks, billingCC, attempts);
  }, [ip, tz, lang, webrtc, billingCC, attempts]);

  // 行动建议
  const prescriptions: Prescription[] = useMemo(() => generatePrescriptions(riskResult), [riskResult]);

  // 保存 billingCC
  useEffect(() => {
    localStorage.setItem(STORAGE_BILLING, billingCC.toUpperCase().trim());
  }, [billingCC]);

  // 全量诊断
  const runDiagnosis = useCallback(async () => {
    setScanning(true);
    try {
      const [ipResult, webrtcResult] = await Promise.all([detectIP(), checkWebRTCLeak()]);
      setIp(ipResult);
      setWebrtc(webrtcResult);
      if (!ipResult.error) {
        setTz(checkTimezone(ipResult.countryCode));
        setLang(checkLanguage(ipResult.countryCode));
        if (ipResult.countryCode) {
          setAddrCountry(ipResult.countryCode);
        }
      } else {
        setTz({ tz: Intl.DateTimeFormat().resolvedOptions().timeZone, match: true, expected: "N/A" });
        setLang({ lang: navigator.language, match: true, expected: "N/A" });
      }
      setScanned(true);
    } catch (e) {
      console.error("Diagnosis error:", e);
    } finally {
      setScanning(false);
    }
  }, []);

  // 地址生成
  const generateAddr = useCallback((cc: string) => {
    const targetCC = cc || (ip?.countryCode ?? "US");
    const ipRegion = ip?.region ?? null;
    const addr = generateAddress(targetCC, ipRegion);
    setCurrentAddr(addr);
    if (!cc) setAddrCountry(targetCC);
  }, [ip]);

  // 自动生成地址（诊断完成后）
  useEffect(() => {
    if (scanned && ip && !currentAddr && addrCountry) {
      generateAddr(addrCountry);
    }
  }, [scanned, ip, currentAddr, addrCountry, generateAddr]);

  // BIN 查询
  const handleBinLookup = useCallback(async () => {
    const input = binInput.trim();
    if (input.length < 6) { setBinError(t("srri.binTooShort")); return; }
    setBinLoading(true);
    setBinError("");
    try {
      const info = await lookupBIN(input.substring(0, 8));
      if (!info) { setBinError(t("srri.binFailed")); }
      else setBinInfo(info);
    } catch {
      setBinError(t("srri.binFailed"));
    } finally {
      setBinLoading(false);
    }
  }, [binInput, t]);

  // 重试记录
  const logAttempt = useCallback((success: boolean) => {
    const cardLast4 = window.prompt(t("srri.enterCardLast4"), "");
    if (cardLast4 === null) return;
    const card = cardLast4.replace(/[^0-9]/g, "").substring(0, 4);
    const newAttempts = [...attempts, { ts: Date.now(), success, card }];
    setAttempts(newAttempts);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newAttempts));
  }, [attempts, t]);

  const clearRetries = useCallback(() => {
    setAttempts([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // BIN 地区匹配
  const binMatchNote = useMemo(() => {
    if (!binInfo || !ip?.countryCode || !binInfo.countryCode) return null;
    return ip.countryCode.toUpperCase() === binInfo.countryCode.toUpperCase();
  }, [binInfo, ip]);

  // 地址匹配
  const addrMatchNote = useMemo(() => {
    if (!currentAddr || !ip?.countryCode) return null;
    return currentAddr.country === ip.countryCode;
  }, [currentAddr, ip]);

  // 冷却时间
  const cooldown = useMemo(() => {
    const recent24h = attempts.filter((a) => Date.now() - a.ts < 86400000);
    if (recent24h.length < 3) return null;
    const oldestRecent = Math.min(...recent24h.map((a) => a.ts));
    const remaining = Math.max(0, oldestRecent + 86400000 - Date.now());
    return {
      remaining,
      hrs: Math.floor(remaining / 3600000),
      mins: Math.floor((remaining % 3600000) / 60000),
      count: recent24h.length,
    };
  }, [attempts]);

  // ENV 检查项
  const envChecks = useMemo(() => {
    const items: { icon: string; name: string; detail: React.ReactNode }[] = [];
    if (!ip) return items;

    const ipStatus = ip.error ? "⚠️" : "✅";
    const ipDetail = ip.error ? t("srri.detectFailed") : (
      <><Code>{ip.ip}</Code> / {ip.city}, {ip.country} / ISP: {ip.isp}</>
    );
    items.push({ icon: ipStatus, name: t("srri.exitIP"), detail: ipDetail });

    if (!ip.error) {
      const vpnStatus = ip.isHosting ? "❌" : "✅";
      const vpnDetail = ip.isHosting
        ? <>{t("srri.datacenterDetected")}：<Code>{ip.isp}</Code> — {t("srri.radarPrimarySignal")}</>
        : t("srri.residentialIP");
      items.push({ icon: vpnStatus, name: t("srri.ipTypeVPN"), detail: vpnDetail });
    }

    if (tz) {
      const tzStatus = tz.match ? "✅" : "⚠️";
      items.push({ icon: tzStatus, name: t("srri.tzConsistency"), detail: <>{t("srri.systemTz")}: <Code>{tz.tz}</Code> / {t("srri.ipExpected")}: <Code>{tz.expected}</Code> {tz.match ? "✓" : "✗"}</> });
    }

    if (lang) {
      const langStatus = lang.match ? "✅" : "⚠️";
      items.push({ icon: langStatus, name: t("srri.langConsistency"), detail: <>{t("srri.browserLang")}: <Code>{lang.lang}</Code> / {t("srri.ipExpected")}: <Code>{lang.expected}</Code> {lang.match ? "✓" : "✗"}</> });
    }

    if (webrtc) {
      const rtcStatus = webrtc.error ? "➖" : (webrtc.leaked ? "❌" : "✅");
      const rtcDetail = webrtc.error ? t("srri.detectUnavailable") : (webrtc.leaked ? <>{t("srri.iceCandidateDetected")}: <Code>{webrtc.ips.join(", ")}</Code></> : t("srri.noLeakDetected"));
      items.push({ icon: rtcStatus, name: t("srri.webrtcLeak"), detail: rtcDetail });
    }

    return items;
  }, [ip, tz, lang, webrtc, t]);

  return (
    <div className="space-y-4">
      {/* 标题 */}
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-[var(--accent)]" />
        <h1 className="text-lg font-semibold text-[var(--text-primary)]">
          Stripe Radar <span className="text-[var(--accent)]">Risk Inspector</span>
        </h1>
      </div>
      <p className="text-sm text-[var(--text-muted)]">{t("srri.subtitle")}</p>

      {/* 仪表盘 + 扫描按钮 */}
      <Card className="flex flex-col items-center py-6">
        <RiskGauge score={scanned ? riskResult.score : null} />
        <Button
          onClick={runDiagnosis}
          disabled={scanning}
          className="mt-5 px-12"
          size="lg"
        >
          {scanning ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t("srri.diagnosing")}</>
          ) : scanned ? (
            <><ScanLine className="mr-2 h-4 w-4" />{t("srri.rescan")}</>
          ) : (
            <><ScanLine className="mr-2 h-4 w-4" />{t("srri.startDiagnosis")}</>
          )}
        </Button>

        {/* 账单国家输入 */}
        <div className="mt-5 flex items-center gap-2">
          <label className="text-[13px] text-[var(--text-muted)]">{t("srri.billingCountryCode")}</label>
          <input
            type="text"
            value={billingCC}
            onChange={(e) => setBillingCC(e.target.value.toUpperCase())}
            placeholder="US / CN / HK / JP..."
            maxLength={3}
            className="w-20 rounded border border-[var(--border)] bg-[var(--bg-input)] px-3 py-1.5 text-center text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
          />
          <span className="text-xs text-[var(--text-muted)]">{t("srri.billingCountryHint")}</span>
        </div>
      </Card>

      {/* 冷却横幅 */}
      {cooldown && (
        <Card className="border-red-500/30 bg-red-500/5 text-center">
          <div className="mb-1.5 text-[13px]">{t("srri.cooldownLock")}</div>
          <div className="text-2xl font-bold text-red-500">{cooldown.hrs}h {cooldown.mins}m</div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">{t("srri.cooldownDesc", { count: String(cooldown.count) })}</div>
        </Card>
      )}

      {/* 结果区域 */}
      {scanned && (
        <div className="space-y-4">
          {/* 环境信号检测 */}
          <Card>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              📡 {t("srri.envSignalDetection")}
            </div>
            <div>
              {envChecks.map((item, i) => (
                <CheckItem key={i} icon={item.icon} name={item.name} detail={item.detail} />
              ))}
            </div>
          </Card>

          {/* 卡 BIN 分析 */}
          <Card>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              💳 {t("srri.binAnalysis")}
            </div>
            <div className="flex gap-2.5">
              <input
                type="text"
                value={binInput}
                onChange={(e) => setBinInput(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && handleBinLookup()}
                placeholder={t("srri.binPlaceholder")}
                maxLength={8}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-input)] px-3.5 py-2.5 font-mono text-base tracking-wider text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
              />
              <Button variant="outline" onClick={handleBinLookup} disabled={binLoading}>
                {binLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("srri.query")}
              </Button>
            </div>

            {binError && <p className="mt-3 text-sm text-yellow-500">{binError}</p>}

            {binInfo && (
              <div className="mt-3">
                <CheckItem
                  icon="💳"
                  name={`${binInfo.scheme.toUpperCase()} ${binInfo.type} ${binInfo.brand}`.trim()}
                  detail={
                    <div>
                      {t("srri.issuingCountry")}: <Code>{binInfo.country}</Code> / {t("srri.bank")}: <Code>{binInfo.bank || "N/A"}</Code>
                      <br />
                      {binMatchNote !== null && (
                        <span className={binMatchNote ? "text-green-500" : "text-red-500"}>
                          {binMatchNote ? `✓ ${t("srri.binMatchIP")}` : `✗ ${t("srri.binMismatchIP", { country: binInfo.country, ipCountry: ip?.country ?? "" })}`}
                        </span>
                      )}
                      <br />
                      {binInfo.prepaid && <span className="text-red-500">{t("srri.prepaidCard")}</span>}
                      {binInfo.type?.toLowerCase().includes("debit") && <span className="text-yellow-500">{t("srri.debitCard")}</span>}
                      {binInfo.type?.toLowerCase().includes("credit") && <span className="text-green-500">{t("srri.creditCard")}</span>}
                      {!binInfo.prepaid && !binInfo.type?.toLowerCase().includes("debit") && !binInfo.type?.toLowerCase().includes("credit") && t("srri.noRiskFlag")}
                    </div>
                  }
                />
              </div>
            )}
          </Card>

          {/* 账单地址生成器 */}
          <Card>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              🏠 {t("srri.addressGenerator")}
            </div>
            <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
              <label className="text-[13px] text-[var(--text-muted)]">{t("srri.targetCountry")}</label>
              <select
                value={addrCountry}
                onChange={(e) => { setAddrCountry(e.target.value); generateAddr(e.target.value); }}
                className="rounded-md border border-[var(--border)] bg-[var(--bg-input)] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)]"
              >
                <option value="">{t("srri.autoSelectAfterDiagnosis")}</option>
                <option value="US">🇺🇸 United States</option>
                <option value="GB">🇬🇧 United Kingdom</option>
                <option value="CA">🇨🇦 Canada</option>
                <option value="JP">🇯🇵 Japan</option>
                <option value="HK">🇭🇰 Hong Kong</option>
                <option value="SG">🇸🇬 Singapore</option>
                <option value="AU">🇦🇺 Australia</option>
                <option value="DE">🇩🇪 Germany</option>
                <option value="FR">🇫🇷 France</option>
                <option value="NL">🇳🇱 Netherlands</option>
              </select>
              <Button size="sm" onClick={() => generateAddr(addrCountry)}>{t("srri.generateAddr")}</Button>
              <Button size="sm" variant="outline" onClick={() => {
                if (!currentAddr) return;
                const text = `${currentAddr.name}\n${currentAddr.line1}\n${currentAddr.city}${currentAddr.state ? ", " + currentAddr.state : ""} ${currentAddr.postal || ""}\n${currentAddr.countryName}`;
                navigator.clipboard.writeText(text).catch(() => {});
              }}>{t("srri.copyAll")}</Button>
              {addrMatchNote !== null && (
                <span className={addrMatchNote ? "rounded bg-green-500/15 px-2 py-0.5 text-xs text-green-500" : "rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-500"}>
                  {addrMatchNote ? `✓ ${t("srri.addrMatchIP", { country: ip?.country ?? "" })}` : `✗ ${t("srri.addrMismatchIP")}`}
                </span>
              )}
            </div>

            {currentAddr && (
              <div>
                {[
                  { label: "Name", value: currentAddr.name },
                  { label: "Address", value: currentAddr.line1 },
                  { label: "City", value: currentAddr.city },
                  { label: "State/Prov", value: currentAddr.state || "-" },
                  { label: "ZIP/Postal", value: currentAddr.postal || "-" },
                  { label: "Country", value: `${currentAddr.countryName} (${currentAddr.country})` },
                ].map((field) => (
                  <div key={field.label} className="flex items-center gap-2 border-b border-[var(--border-soft)] py-2 last:border-b-0">
                    <div className="w-20 shrink-0 text-xs uppercase tracking-wide text-[var(--text-muted)]">{field.label}</div>
                    <div className="flex-1 font-mono text-sm text-[var(--text-primary)]">{field.value}</div>
                    <CopyButton value={field.value} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 行动建议 */}
          <Card>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              🎯 {t("srri.actionSuggestions")}
            </div>
            {prescriptions.length === 0 ? (
              <div className="text-sm text-[var(--text-muted)]">{t("srri.noSuggestions")}</div>
            ) : (
              <div className="space-y-2.5">
                {prescriptions.map((rx) => (
                  <div
                    key={rx.num}
                    className={`flex gap-3.5 rounded-lg bg-[var(--bg-input)] border-l-[3px] p-3.5 ${SEVERITY_STYLES[rx.severity].border}`}
                  >
                    <div className="text-lg font-bold text-[var(--text-muted)]">{rx.num}</div>
                    <div className="flex-1 text-sm">
                      <span dangerouslySetInnerHTML={{ __html: rx.action }} />
                      <span className={`ml-1.5 inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_STYLES[rx.severity].tag}`}>{rx.tag}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* 重试追踪器 */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                🔄 {t("srri.retryTracker")}
              </div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => logAttempt(true)}>✓ {t("srri.logSuccess")}</Button>
                <Button size="sm" variant="ghost" onClick={() => logAttempt(false)}>✗ {t("srri.logFail")}</Button>
                <Button size="sm" variant="ghost" onClick={clearRetries}><RotateCcw className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            {attempts.length === 0 ? (
              <div className="py-2 text-[13px] text-[var(--text-muted)]">{t("srri.noRecords")}</div>
            ) : (
              <div className="max-h-[200px] overflow-y-auto">
                {attempts.slice().reverse().slice(0, 15).map((a, i) => {
                  const dt = new Date(a.ts);
                  const ago = Math.floor((Date.now() - a.ts) / 3600000);
                  return (
                    <div key={i} className="flex items-center justify-between border-b border-[var(--border-soft)] py-2 text-[13px] last:border-b-0">
                      <span className="text-[var(--text-muted)]">
                        {dt.getMonth() + 1}/{dt.getDate()} {dt.getHours()}:{String(dt.getMinutes()).padStart(2, "0")} ({ago}h前) ...{a.card || "????"}
                      </span>
                      <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${a.success ? "bg-green-500/15 text-green-500" : "bg-red-500/15 text-red-500"}`}>
                        {a.success ? "✓ 成功" : "✗ 失败"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* 免责声明 */}
          <Card className="bg-[var(--bg-input)]">
            <div className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
              <div className="leading-relaxed">
                <strong>{t("srri.disclaimerTitle")}</strong>{t("srri.disclaimer")}
              </div>
            </div>
          </Card>
        </div>
      )}

      <div className="pt-2 text-center text-xs text-[var(--text-muted)]">
        SRRI v1.0 · {t("srri.localRun")} · {t("srri.zeroUpload")}
      </div>
    </div>
  );
}
