import {
  BrowserRouter,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { getPlatforms } from "@/lib/app-data";
import { getAuthToken, setAuthToken, API, cn } from "@/lib/utils";
import { getPublicClientRoute } from "@/lib/public-routes";
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
import IdpTeamAutomation from "@/pages/IdpTeamAutomation";
import ConverterClient from "@/pages/ConverterClient";
import PxlPlusClient from "@/pages/PxlPlusClient";
import LuckMailCodeClient from "@/pages/LuckMailCodeClient";
import SrriInspector from "@/pages/SrriInspector";
import UpdateBanner from "@/components/UpdateBanner";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  History,
  Languages,
  LayoutDashboard,
  Menu,
  Monitor,
  Moon,
  PanelLeft,
  PanelLeftClose,
  QrCode,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  X,
} from "lucide-react";

type NavItem = {
  path: string;
  labelKey: TranslationKey;
  icon: LucideIcon;
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { path: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, exact: true },
  { path: "/ctf-gpt-plus", labelKey: "nav.ctfGptPlus", icon: Sparkles },
  { path: "/gopay-gpt-plus", labelKey: "nav.gopayGptPlus", icon: Sparkles },
  { path: "/pix-gpt-plus", labelKey: "nav.pixGptPlus", icon: QrCode },
  { path: "/plus-manager", labelKey: "nav.plusManager", icon: Sparkles },
  {
    path: "/idp-team-automation",
    labelKey: "nav.idpTeamAutomation",
    icon: ShieldCheck,
  },
  { path: "/srri-inspector", labelKey: "nav.srriInspector", icon: ShieldCheck },
  { path: "/history", labelKey: "nav.tasks", icon: History },
];

function Sidebar({
  theme,
  toggleTheme,
  collapsed,
  setCollapsed,
  mobile = false,
  onNavigate,
}: {
  theme: string;
  toggleTheme: () => void;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const { t, language, toggleLanguage } = useI18n();
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
  const themeActionLabel = theme === "dark"
    ? t("sidebar.theme.toLight")
    : theme === "light"
      ? t("sidebar.theme.followSystem")
      : t("sidebar.theme.toDark");

  const navLinkClass = (active: boolean) =>
    cn(
      "group flex min-h-11 items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13px] font-medium transition-colors",
      active
        ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]"
        : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent-ink)]",
      collapsed && "justify-center px-0",
    );

  const iconClass = (active: boolean) =>
    cn(
      "h-[18px] w-[18px] shrink-0",
      active
        ? "text-[var(--accent-ink)]"
        : "text-[var(--text-muted)] group-hover:text-[var(--accent-ink)]",
    );

  const iconButtonClass =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--accent-ink)]";

  return (
    <aside
      className={cn(
        "app-sidebar-shell my-3 ml-3 flex h-[calc(100vh-24px)] flex-col rounded-2xl transition-[width] duration-200",
        collapsed ? "w-16" : "w-[244px]",
        mobile && "mobile-sidebar-open",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center px-4 py-4",
          collapsed && "justify-center px-2",
        )}
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center">
          <img
            src="/superautoplus-logo.png"
            alt=""
            aria-hidden="true"
            className="h-10 w-10 object-contain"
          />
        </div>
        {!collapsed && (
          <div className="ml-3 min-w-0 flex-1">
            <p className="truncate text-lg font-semibold text-[var(--text-primary)]">
              SuperAutoplus
            </p>
            <p className="truncate text-xs font-medium text-[var(--text-muted)]">
              Automation platform
            </p>
          </div>
        )}
        {mobile && (
          <Dialog.Close asChild>
            <button
              type="button"
              className={iconButtonClass}
              aria-label={language === "zh-CN" ? "关闭导航菜单" : "Close navigation menu"}
              title={language === "zh-CN" ? "关闭导航菜单" : "Close navigation menu"}
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </Dialog.Close>
        )}
      </div>

      <nav aria-label={language === "zh-CN" ? "主要导航" : "Main navigation"} className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
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
              aria-label={collapsed ? label : undefined}
              onClick={onNavigate}
            >
              <Icon aria-hidden="true" className={iconClass(active)} />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          );
        })}

        <div>
          <button
            type="button"
            onClick={() => {
              if (collapsed) {
                navigate("/accounts");
                onNavigate?.();
              } else setAccountsOpen(!accountsOpen);
            }}
            className={cn(navLinkClass(isAccounts), "w-full")}
            title={collapsed ? t("nav.accounts") : undefined}
            aria-expanded={collapsed ? undefined : accountsOpen}
            aria-label={collapsed ? t("nav.accounts") : undefined}
            aria-controls={!collapsed && accountsOpen ? "accounts-subnav" : undefined}
          >
            <Users aria-hidden="true" className={iconClass(isAccounts)} />
            {!collapsed && (
              <>
                <span className="flex-1 truncate text-left">
                  {t("nav.accounts")}
                </span>
                <ChevronRight aria-hidden="true"
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-150",
                    isAccounts ? "text-[var(--accent-ink)]" : "text-[var(--text-muted)]",
                    accountsOpen && "rotate-90",
                  )}
                />
              </>
            )}
          </button>
          {!collapsed && accountsOpen && (
            <div id="accounts-subnav" className="ml-[22px] mt-1.5 space-y-1 border-l border-[var(--border)] pl-3">
              {platforms.map((p) => (
                <NavLink
                  key={p.key}
                  to={`/accounts/${p.key}`}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      "flex min-h-11 items-center rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
                      isActive
                        ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)]",
                    )
                  }
                >
                  {p.label}
                </NavLink>
              ))}
              <NavLink
                to="/accounts/sms-pool"
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex min-h-11 items-center rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
                    isActive
                      ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]"
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
          type="button"
          onClick={() => {
            navigate("/settings");
            onNavigate?.();
          }}
          className={cn(navLinkClass(isSettings), "w-full")}
          title={collapsed ? t("nav.settings") : undefined}
          aria-label={collapsed ? t("nav.settings") : undefined}
        >
          <SettingsIcon aria-hidden="true" className={iconClass(isSettings)} />
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
                  onClick={onNavigate}
                  aria-current={active ? "page" : false}
                  className={cn(
                    "flex min-h-11 items-center rounded-xl px-3 py-2 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-[var(--accent-soft)] text-[var(--accent-ink)]"
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
            type="button"
            onClick={toggleTheme}
            className={iconButtonClass}
            title={themeActionLabel}
            aria-label={themeActionLabel}
          >
            {theme === "light" ? (
              <Monitor aria-hidden="true" className="h-4 w-4" />
            ) : theme === "system" ? (
              <Moon aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Sun aria-hidden="true" className="h-4 w-4" />
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
            type="button"
            onClick={toggleLanguage}
            className={iconButtonClass}
            title={t("sidebar.languageToggle")}
            aria-label={t("sidebar.languageToggle")}
          >
            <Languages aria-hidden="true" className="h-4 w-4" />
          </button>
          {!mobile && (
            <button
              type="button"
              onClick={() => setCollapsed(!collapsed)}
              className={iconButtonClass}
              title={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
              aria-label={collapsed ? t("sidebar.expand") : t("sidebar.collapse")}
            >
              {collapsed ? (
                <PanelLeft aria-hidden="true" className="h-4 w-4" />
              ) : (
                <PanelLeftClose aria-hidden="true" className="h-4 w-4" />
              )}
            </button>
          )}
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
  const { t, language } = useI18n();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true",
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 767px)").matches,
  );
  const themeActionLabel = theme === "dark"
    ? t("sidebar.theme.toLight")
    : theme === "light"
      ? t("sidebar.theme.followSystem")
      : t("sidebar.theme.toDark");

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const handleChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
      setMobileOpen(false);
    };
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.search]);

  return (
    <Dialog.Root open={mobileOpen && isMobile} onOpenChange={setMobileOpen}>
      <div className="app-shell app-workspace-shell flex h-screen overflow-hidden">
        <a className="skip-link" href="#main-content">
          {language === "zh-CN" ? "跳转到主要内容" : "Skip to main content"}
        </a>
        {!isMobile && (
          <Sidebar
            theme={theme}
            toggleTheme={toggleTheme}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
          />
        )}
        {isMobile && (
          <Dialog.Portal>
            <Dialog.Overlay className="mobile-nav-scrim" />
            <Dialog.Content className="fixed inset-y-3 left-3 z-[60] w-[min(286px,calc(100vw-24px))] outline-none">
              <Dialog.Title className="sr-only">
                {language === "zh-CN" ? "导航菜单" : "Navigation menu"}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                {language === "zh-CN"
                  ? "选择工作区页面，或调整主题与语言。"
                  : "Choose a workspace page, or change the theme and language."}
              </Dialog.Description>
              <Sidebar
                theme={theme}
                toggleTheme={toggleTheme}
                collapsed={false}
                setCollapsed={setCollapsed}
                mobile
                onNavigate={() => setMobileOpen(false)}
              />
            </Dialog.Content>
          </Dialog.Portal>
        )}
        <main id="main-content" tabIndex={-1} className="h-full min-w-0 flex-1 overflow-y-auto">
          {isMobile && (
            <div className="mobile-topbar">
              <Dialog.Trigger asChild>
                <button
                  type="button"
                  aria-label={language === "zh-CN" ? "打开导航菜单" : "Open navigation menu"}
                  className="mobile-menu-button"
                >
                  <Menu aria-hidden="true" className="h-5 w-5" />
                </button>
              </Dialog.Trigger>
              <div className="mobile-topbar-brand">
                <img src="/superautoplus-logo.png" alt="" aria-hidden="true" />
                <span>SuperAutoplus</span>
              </div>
              <button
                type="button"
                aria-label={themeActionLabel}
                title={themeActionLabel}
                className="mobile-menu-button"
                onClick={toggleTheme}
              >
                {theme === "dark" ? (
                  <Sun aria-hidden="true" className="h-4 w-4" />
                ) : theme === "light" ? (
                  <Monitor aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Moon aria-hidden="true" className="h-4 w-4" />
                )}
              </button>
            </div>
          )}
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
              <Route path="/idp-team-automation" element={<IdpTeamAutomation />} />
              <Route path="/srri-inspector" element={<SrriInspector />} />
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
    </Dialog.Root>
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
          <img src="/superautoplus-logo.png" alt="" aria-hidden="true" width="48" height="48" className="h-12 w-12 shrink-0 object-contain" />
          <div>
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">
              SuperAutoplus
            </h1>
            <p className="text-sm text-[var(--text-muted)]">
              {t("login.prompt")}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="login-password" className="block text-sm font-medium text-[var(--text-secondary)]">
            {t("login.passwordPlaceholder")}
          </label>
          <input
            id="login-password"
            type="password"
            name="password"
            autoComplete="current-password"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "login-error" : undefined}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder={t("login.passwordPlaceholder")}
            autoFocus
            className="control-surface w-full"
          />
        </div>
        {error && <p id="login-error" role="alert" aria-live="polite" className="text-sm font-medium text-[var(--danger)]">{error}</p>}
        <Button
          type="submit"
          disabled={loading || !pw}
          aria-busy={loading}
          className="w-full"
        >
          {loading ? t("login.checking") : t("login.submit")}
        </Button>
      </form>
    </div>
  );
}

function PublicClientRoute({ route }: { route: string }) {
  if (route === "/converter") {
    return (
      <BrowserRouter>
        <ConverterClient />
      </BrowserRouter>
    );
  }

  if (route === "/pxl-plus") {
    return (
      <BrowserRouter>
        <PxlPlusClient />
      </BrowserRouter>
    );
  }

  if (route === "/luckmail-code") {
    return (
      <BrowserRouter>
        <LuckMailCodeClient />
      </BrowserRouter>
    );
  }

  return null;
}

function ProtectedAppContent() {
  const { t } = useI18n();
  const [theme, setTheme] = useState(
    () => localStorage.getItem("theme") || "dark",
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
  const publicRoute = getPublicClientRoute(window.location.pathname);
  if (publicRoute) {
    return <PublicClientRoute route={publicRoute} />;
  }

  return (
    <I18nProvider>
      <ProtectedAppContent />
    </I18nProvider>
  );
}
