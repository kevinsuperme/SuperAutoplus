import {
  BrowserRouter,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEffect, useState } from "react";
import { getPlatforms } from "@/lib/app-data";
import { getAuthToken, setAuthToken, API, cn } from "@/lib/utils";
import { I18nProvider, useI18n } from "@/lib/i18n-context";
import type { TranslationKey } from "@/lib/i18n";
import Dashboard from "@/pages/Dashboard";
import Accounts from "@/pages/Accounts";
import SmsPoolBlacklist from "@/pages/SmsPoolBlacklist";
import Register from "@/pages/Register";
import Proxies from "@/pages/Proxies";
import SettingsPage from "@/pages/SettingsPage";
import TaskHistory from "@/pages/TaskHistory";
import CtfGptPlus from "@/pages/CtfGptPlus";
import GoPayGptPlus from "@/pages/GoPayGptPlus";
import PixGptPlus from "@/pages/PixGptPlus";
import PlusManager from "@/pages/PlusManager";
import PxlPlusClient from "@/pages/PxlPlusClient";
import UpdateBanner from "@/components/UpdateBanner";
import {
  ChevronRight,
  History,
  Languages,
  LayoutDashboard,
  Leaf,
  Monitor,
  Moon,
  PanelLeft,
  PanelLeftClose,
  QrCode,
  Settings as SettingsIcon,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";

type NavItem = {
  path: string;
  labelKey: TranslationKey;
  icon: any;
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { path: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, exact: true },
  { path: "/ctf-gpt-plus", labelKey: "nav.ctfGptPlus", icon: Sparkles },
  { path: "/gopay-gpt-plus", labelKey: "nav.gopayGptPlus", icon: Sparkles },
  { path: "/pix-gpt-plus", labelKey: "nav.pixGptPlus", icon: QrCode },
  { path: "/plus-manager", labelKey: "nav.plusManager", icon: Sparkles },
  { path: "/history", labelKey: "nav.tasks", icon: History },
];

function Sidebar({
  theme,
  toggleTheme,
  collapsed,
  setCollapsed,
}: {
  theme: string;
  toggleTheme: () => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  const { t, toggleLanguage } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [platforms, setPlatforms] = useState<{ key: string; label: string }[]>(
    [],
  );
  const [accountsOpen, setAccountsOpen] = useState(
    location.pathname.startsWith("/accounts"),
  );

  useEffect(() => {
    getPlatforms()
      .then((data) =>
        setPlatforms(
          (data || []).map((p: any) => ({
            key: p.name,
            label: p.display_name,
          })),
        ),
      )
      .catch(() => setPlatforms([]));
  }, []);

  useEffect(() => {
    if (location.pathname.startsWith("/accounts")) setAccountsOpen(true);
  }, [location.pathname]);

  const isAccounts = location.pathname.startsWith("/accounts");
  const isSettings = location.pathname === "/settings";

  const navLinkClass = (active: boolean) =>
    cn(
      "group flex items-center gap-3 rounded-full px-3.5 py-2.5 text-[13px] font-semibold transition-all",
      active
        ? "bg-[var(--accent)] text-white shadow-[0_10px_24px_rgba(var(--accent-rgb),0.22)]"
        : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]",
      collapsed && "justify-center px-0",
    );

  const iconClass = (active: boolean) =>
    cn(
      "h-[18px] w-[18px] shrink-0",
      active
        ? "text-white"
        : "text-[var(--text-muted)] group-hover:text-[var(--accent)]",
    );

  const iconButtonClass =
    "flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]";

  return (
    <aside
      className={cn(
        "app-sidebar-shell my-3 ml-3 flex h-[calc(100vh-24px)] flex-col rounded-[28px] transition-[width] duration-200",
        collapsed ? "w-16" : "w-[244px]",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center px-4 py-4",
          collapsed && "justify-center px-2",
        )}
      >
        <div className="eco-icon h-10 w-10 shrink-0">
          <Leaf className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="ml-3 min-w-0">
            <h1 className="truncate text-lg font-semibold text-[var(--text-primary)]">
              SuperAutoplus
            </h1>
            <p className="truncate text-xs font-medium text-[var(--text-muted)]">
              Automation platform
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {NAV_ITEMS.map(({ path, labelKey, icon: Icon, exact }) => {
          const active = exact
            ? location.pathname === path
            : location.pathname.startsWith(path);
          const label = t(labelKey);
          return (
            <NavLink
              key={path}
              to={path}
              end={exact}
              className={navLinkClass(active)}
              title={collapsed ? label : undefined}
            >
              <Icon className={iconClass(active)} />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          );
        })}

        <div>
          <button
            onClick={() => {
              if (collapsed) navigate("/accounts");
              else setAccountsOpen(!accountsOpen);
            }}
            className={cn(navLinkClass(isAccounts), "w-full")}
            title={collapsed ? t("nav.accounts") : undefined}
          >
            <Users className={iconClass(isAccounts)} />
            {!collapsed && (
              <>
                <span className="flex-1 truncate text-left">
                  {t("nav.accounts")}
                </span>
                <ChevronRight
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-150",
                    isAccounts ? "text-white" : "text-[var(--text-muted)]",
                    accountsOpen && "rotate-90",
                  )}
                />
              </>
            )}
          </button>
          {!collapsed && accountsOpen && (
            <div className="ml-[22px] mt-1.5 space-y-1 border-l border-[var(--border)] pl-3">
              {platforms.map((p) => (
                <NavLink
                  key={p.key}
                  to={`/accounts/${p.key}`}
                  className={({ isActive }) =>
                    cn(
                      "block rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                      isActive
                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]",
                    )
                  }
                >
                  {p.label}
                </NavLink>
              ))}
              <NavLink
                to="/accounts/sms-pool"
                className={({ isActive }) =>
                  cn(
                    "block rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                    isActive
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]",
                  )
                }
              >
                {t("nav.accountsSmsPool")}
              </NavLink>
            </div>
          )}
        </div>

        <div className="!my-3 border-t border-[var(--border)]" />

        <button
          onClick={() => navigate("/settings")}
          className={cn(navLinkClass(isSettings), "w-full")}
          title={collapsed ? t("nav.settings") : undefined}
        >
          <SettingsIcon className={iconClass(isSettings)} />
          {!collapsed && <span>{t("nav.settings")}</span>}
        </button>
        {!collapsed && isSettings && (
          <div className="ml-[22px] mt-1.5 space-y-1 border-l border-[var(--border)] pl-3">
            {[
              { label: t("nav.settings.general"), hash: "general" },
              { label: t("nav.settings.register"), hash: "register" },
              { label: t("nav.settings.mailbox"), hash: "mailbox" },
              { label: t("nav.settings.captcha"), hash: "captcha" },
              { label: t("nav.settings.sms"), hash: "sms" },
              { label: t("nav.settings.proxies"), hash: "proxies" },
              { label: t("nav.settings.chatgpt"), hash: "chatgpt" },
              { label: t("nav.settings.bitbrowser"), hash: "bitbrowser" },
              { label: t("nav.settings.advanced"), hash: "advanced" },
              { label: t("nav.settings.about"), hash: "about" },
            ].map((item) => {
              const params = new URLSearchParams(location.search);
              const currentTab = params.get("tab") || "general";
              const active = currentTab === item.hash;
              return (
                <NavLink
                  key={item.hash}
                  to={`/settings?tab=${item.hash}`}
                  className={cn(
                    "block rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]",
                  )}
                >
                  {item.label}
                </NavLink>
              );
            })}
          </div>
        )}
      </nav>

      <div className="shrink-0 border-t border-[var(--border)] px-3 py-3">
        <div
          className={cn(
            "flex items-center gap-1",
            collapsed && "flex-col justify-center",
          )}
        >
          <button
            onClick={toggleTheme}
            className={iconButtonClass}
            title={
              theme === "light"
                ? t("sidebar.theme.toDark")
                : theme === "dark"
                  ? t("sidebar.theme.toLight")
                  : t("sidebar.theme.followSystem")
            }
          >
            {theme === "light" ? (
              <Moon className="h-4 w-4" />
            ) : theme === "system" ? (
              <Monitor className="h-4 w-4" />
            ) : (
              <Sun className="h-4 w-4" />
            )}
          </button>
          {!collapsed && (
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-muted)]">
              {theme === "light"
                ? t("sidebar.theme.light")
                : theme === "dark"
                  ? t("sidebar.theme.dark")
                  : t("sidebar.theme.system")}
            </span>
          )}
          <button
            onClick={toggleLanguage}
            className={iconButtonClass}
            title={t("sidebar.languageToggle")}
          >
            <Languages className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={iconButtonClass}
            title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}

function Shell({
  theme,
  setTheme,
  toggleTheme,
}: {
  theme: string;
  setTheme: (t: string) => void;
  toggleTheme: () => void;
}) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar
        theme={theme}
        toggleTheme={toggleTheme}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="app-content-panel mx-auto max-w-7xl px-5 py-5 lg:px-8">
          <UpdateBanner />
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/accounts/sms-pool" element={<SmsPoolBlacklist />} />
            <Route path="/accounts/:platform" element={<Accounts />} />
            <Route path="/register" element={<Register />} />
            <Route path="/ctf-gpt-plus" element={<CtfGptPlus />} />
            <Route path="/gopay-gpt-plus" element={<GoPayGptPlus />} />
            <Route path="/pix-gpt-plus" element={<PixGptPlus />} />
            <Route path="/plus-manager" element={<PlusManager />} />
            <Route path="/history" element={<TaskHistory />} />
            <Route path="/proxies" element={<Proxies />} />
            <Route
              path="/settings"
              element={<SettingsPage theme={theme} setTheme={setTheme} />}
            />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const { t } = useI18n();
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(API + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (data.ok) {
        setAuthToken(data.token || "");
        onLogin(data.token || "");
      } else {
        setError(data.error || t("login.passwordError"));
      }
    } catch {
      setError(t("login.requestFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell flex min-h-screen items-center justify-center px-4 py-8">
      <form
        onSubmit={submit}
        className="leaf-card w-full max-w-sm space-y-5 p-7"
      >
        <div className="flex items-center gap-3">
          <div className="eco-icon h-12 w-12">
            <Leaf className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
              SuperAutoplus
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {t("login.prompt")}
            </p>
          </div>
        </div>
        <input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder={t("login.passwordPlaceholder")}
          autoFocus
          className="control-surface w-full"
        />
        {error && <p className="text-xs font-medium text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading || !pw}
          className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--accent)_0%,var(--accent-strong)_100%)] px-5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(var(--accent-rgb),0.26)] transition-all hover:-translate-y-0.5 disabled:opacity-50"
        >
          {loading ? t("login.checking") : t("login.submit")}
        </button>
      </form>
    </div>
  );
}

function AppContent() {
  const { t } = useI18n();
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "light",
  );
  const [authState, setAuthState] = useState<
    "loading" | "open" | "locked" | "authed"
  >("loading");

  useEffect(() => {
    const applyTheme = () => {
      let effective = theme;
      if (theme === "system") {
        effective = window.matchMedia("(prefers-color-scheme: light)").matches
          ? "light"
          : "dark";
      }
      document.documentElement.classList.toggle("light", effective === "light");
    };
    applyTheme();
    localStorage.setItem("theme", theme);
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const handler = () => {
      if (theme === "system") applyTheme();
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  useEffect(() => {
    fetch(API + "/auth/check")
      .then((r) => r.json())
      .then((data) => {
        if (!data.required) setAuthState("open");
        else if (getAuthToken()) setAuthState("authed");
        else setAuthState("locked");
      })
      .catch(() => setAuthState("open"));
  }, []);

  const toggleTheme = () =>
    setTheme((c) =>
      c === "dark" ? "light" : c === "light" ? "system" : "dark",
    );

  if (window.location.pathname === "/pxl-plus") {
    return (
      <BrowserRouter>
        <PxlPlusClient />
      </BrowserRouter>
    );
  }

  if (authState === "loading") {
    return (
      <div className="app-shell flex h-screen items-center justify-center text-sm font-medium text-[var(--text-muted)]">
        {t("app.loading")}
      </div>
    );
  }
  if (authState === "locked") {
    return <LoginScreen onLogin={() => setAuthState("authed")} />;
  }

  return (
    <BrowserRouter>
      <Shell theme={theme} setTheme={setTheme} toggleTheme={toggleTheme} />
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <AppContent />
    </I18nProvider>
  );
}
