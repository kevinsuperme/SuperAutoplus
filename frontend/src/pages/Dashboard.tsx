import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getPlatforms } from '@/lib/app-data'
import { apiFetch } from '@/lib/utils'
import { translateAccountStatus } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Activity, ArrowUpRight, CheckCircle, CircleAlert, Clock,
  MonitorCheck, RefreshCw, Settings, ShieldCheck, TrendingUp, Users, XCircle,
} from 'lucide-react'

const DESKTOP_PLATFORMS = ['cursor', 'kiro', 'chatgpt']
const PLATFORM_COLORS: Record<string, string> = {
  trae: 'var(--color-sky)', tavily: 'var(--color-earth)', cursor: 'var(--accent)',
  kiro: 'var(--color-sun)', chatgpt: 'var(--color-leaf)', gopay: 'var(--color-sky)',
}
const STATUS_VARIANT: Record<string, any> = {
  registered: 'default', trial: 'success', subscribed: 'success', expired: 'warning',
  invalid: 'danger', free: 'secondary', eligible: 'secondary', unknown: 'secondary', valid: 'success',
}

function numberValue(value: unknown) {
  return Number(value || 0)
}

export default function Dashboard() {
  const { t, language } = useI18n()
  const [stats, setStats] = useState<any>(null)
  const [desktopStates, setDesktopStates] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadFailed(false)
    try {
      const [data, platforms] = await Promise.all([
        apiFetch('/accounts/stats'),
        getPlatforms().catch(() => []),
      ])
      setStats(data)
      const desktopEntries = await Promise.all(
        (platforms || [])
          .filter((item: any) => DESKTOP_PLATFORMS.includes(item.name))
          .map(async (item: any) => {
            const state = await apiFetch(`/platforms/${item.name}/desktop-state`).catch(() => ({ available: false }))
            return [item.name, { ...state, platform: item.name, display_name: item.display_name }] as const
          }),
      )
      setDesktopStates(Object.fromEntries(desktopEntries))
    } catch {
      setLoadFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const totalCount = Math.max(numberValue(stats?.total), 0)
  const trialCount = numberValue(stats?.by_plan_state?.trial)
  const subscribedCount = numberValue(stats?.by_plan_state?.subscribed)
  const invalidCount = numberValue(stats?.by_display_status?.expired) + numberValue(stats?.by_validity_status?.invalid)
  const activeCount = trialCount + subscribedCount
  const activeRate = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0
  const readyDesktopCount = DESKTOP_PLATFORMS.filter((platform) => desktopStates[platform]?.ready).length
  const platformEntries = Object.entries(stats?.by_platform || {})
    .map(([platform, count]) => ({ platform, count: numberValue(count) }))
    .sort((a, b) => b.count - a.count)

  const statCards = [
    { label: t('dashboard.totalAccounts'), value: totalCount, icon: Users, tone: 'var(--accent-ink)' },
    { label: t('dashboard.trial'), value: trialCount, icon: Clock, tone: 'var(--warning)' },
    { label: t('dashboard.subscribed'), value: subscribedCount, icon: CheckCircle, tone: 'var(--success)' },
    { label: t('dashboard.invalid'), value: invalidCount, icon: XCircle, tone: 'var(--danger)' },
  ]

  const emptyStatsCopy = loading
    ? t('dashboard.loadingStats')
    : loadFailed ? (language === 'zh-CN' ? '统计数据暂未加载，请重试。' : 'Statistics did not load. Please retry.') : t('dashboard.noData')

  const renderStatusGroup = (title: string, values: Record<string, number> | undefined, emptyCopy: string) => (
    <div className="min-w-0 space-y-3">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      {values && Object.keys(values).length > 0 ? Object.entries(values).map(([status, count]) => (
        <div key={status} className="flex items-center justify-between gap-3 rounded-lg bg-[var(--bg-pane)] px-3 py-2.5">
          <Badge variant={STATUS_VARIANT[status] || 'secondary'}>{translateAccountStatus(status, language)}</Badge>
          <span className="text-sm font-semibold tabular-nums text-[var(--text-secondary)]">{count}</span>
        </div>
      )) : <div className="empty-state-panel">{stats ? emptyCopy : emptyStatsCopy}</div>}
    </div>
  )

  return (
    <div className="dashboard-page space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm font-medium text-[var(--text-secondary)]">{t('nav.dashboard')}</span>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} aria-busy={loading}>
          <RefreshCw aria-hidden="true" className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </div>

      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <div className="dashboard-wordmark">
          <img src="/superautoplus-logo.png" alt="" aria-hidden="true" width="36" height="36" />
          <span>SuperAutoplus</span>
        </div>
        <h1 id="dashboard-title">
          {language === 'zh-CN' ? '更从容地，掌控每一步。' : 'A clearer view of every workflow.'}
        </h1>
        <p className="dashboard-intro">
          {language === 'zh-CN'
            ? '账号、任务与桌面状态，一目了然。让重复操作有序运行，把注意力留给重要的事。'
            : 'Accounts, tasks, and desktop readiness in one place. Keep routine work organized and focus on what matters.'}
        </p>
        <nav className="dashboard-entry-grid" aria-label={language === 'zh-CN' ? '工作台快捷入口' : 'Workspace shortcuts'}>
          {[
            { path: '/accounts', label: t('nav.accounts'), icon: Users, description: language === 'zh-CN' ? '查看与管理平台账号' : 'Manage platform accounts' },
            { path: '/history', label: t('nav.tasks'), icon: Clock, description: language === 'zh-CN' ? '跟踪任务与执行进度' : 'Track tasks and progress' },
            { path: '/settings', label: t('nav.settings'), icon: Settings, description: language === 'zh-CN' ? '按需配置你的工作台' : 'Configure your workspace' },
          ].map(({ path, label, icon: Icon, description }) => (
            <Link key={path} to={path} className="dashboard-entry-card">
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span className="min-w-0">
                <span className="block font-semibold">{label}</span>
                <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">{description}</span>
              </span>
              <ArrowUpRight aria-hidden="true" className="dashboard-entry-arrow h-4 w-4 shrink-0" />
            </Link>
          ))}
        </nav>
      </section>

      {loadFailed && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger)]">
          <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{language === 'zh-CN' ? '数据刷新失败。请检查服务连接后点击刷新；已加载的数据仍然保留。' : 'Refresh failed. Check the service connection and try again. Previously loaded data is still shown.'}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy={loading}>
        {statCards.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label} className="dashboard-metric p-4 sm:p-5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-[var(--text-secondary)]">{label}</p>
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" style={{ color: tone }} />
            </div>
            <p className="mt-3 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">{stats ? value : '—'}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" aria-busy={loading}>
        <Card className="p-5 sm:p-6">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{t('dashboard.platformDistribution')}</CardTitle>
            <Activity aria-hidden="true" className="h-5 w-5 text-[var(--accent-ink)]" />
          </CardHeader>
          <CardContent className="space-y-5">
            {platformEntries.length > 0 ? platformEntries.map(({ platform, count }) => {
              const ratio = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
              const color = PLATFORM_COLORS[platform] || 'var(--accent)'
              return (
                <div key={platform}>
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-2.5 font-medium text-[var(--text-primary)]">
                      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                      <span className="break-words">{platform}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--text-muted)]">{count} / {ratio}%</span>
                  </div>
                  <div className="progress-track" aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, ratio)}%`, backgroundColor: color }} />
                  </div>
                </div>
              )
            }) : <div className="empty-state-panel">{stats ? t('dashboard.noPlatformData') : emptyStatsCopy}</div>}
          </CardContent>
        </Card>

        <Card className="p-5 sm:p-6">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{t('dashboard.statusDistribution')}</CardTitle>
            <Badge variant="default">{stats ? `${activeRate}%` : '—'}</Badge>
          </CardHeader>
          <CardContent className="dashboard-health">
            <div className="relative mx-auto h-36 w-36 shrink-0">
              <svg className="h-full w-full" viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border)" strokeWidth="7" />
                <circle cx="60" cy="60" r="50" fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={`${(Math.min(100, activeRate) / 100) * 314.16} 314.16`} transform="rotate(-90 60 60)" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-semibold tabular-nums text-[var(--text-primary)]">{stats ? activeCount : '—'}</span>
                <span className="mt-1 text-xs text-[var(--text-muted)]">{t('common.active')}</span>
              </div>
            </div>
            <dl className="min-w-0 flex-1 space-y-4">
              {statCards.slice(1).map(({ label, value, tone }) => (
                <div key={label} className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] pb-2 text-sm">
                  <dt className="flex items-center gap-2 text-[var(--text-secondary)]">
                    <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tone }} />{label}
                  </dt>
                  <dd className="font-medium tabular-nums text-[var(--text-primary)]">{stats ? value : '—'}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="desktop-status-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="desktop-status-title" className="text-lg font-semibold text-[var(--text-primary)]">{t('dashboard.desktopStatus')}</h2>
          <span className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-[var(--accent-ink)]" />
            {loading ? t('common.loading') : `${readyDesktopCount}/${DESKTOP_PLATFORMS.length} ${t('common.ready')}`}
          </span>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {DESKTOP_PLATFORMS.map((platform) => {
            const state = desktopStates[platform]
            const label = state?.app_name || state?.display_name || platform
            const badges = state ? [
              { label: state.installed ? t('dashboard.installed') : t('dashboard.notInstalled'), variant: state.installed ? 'success' : 'secondary' },
              { label: state.configured ? t('dashboard.configured') : t('dashboard.notConfigured'), variant: state.configured ? 'success' : 'warning' },
              { label: state.running ? t('dashboard.opened') : t('dashboard.notOpened'), variant: state.running ? 'success' : 'secondary' },
              { label: state.ready ? t('dashboard.ready') : t('dashboard.notReady'), variant: state.ready ? 'success' : 'warning' },
            ] : []
            return (
              <Card key={platform} className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                    <MonitorCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--accent-ink)]" />
                    <span className="break-words">{label}</span>
                  </h3>
                  <Badge variant={state?.ready ? 'success' : 'secondary'}>{state?.ready ? t('common.ready') : t('common.standby')}</Badge>
                </div>
                <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">
                  {state?.available === false ? (state.message || t('dashboard.desktopUnavailable'))
                    : (state?.ready_label || state?.status_label || t('dashboard.desktopReadyDescription'))}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {badges.length > 0 ? badges.map((badge) => (
                    <Badge key={`${platform}-${badge.label}`} variant={badge.variant as any}>{badge.label}</Badge>
                  )) : <span className="text-xs text-[var(--text-muted)]">{loading ? t('common.loading') : t('dashboard.noData')}</span>}
                </div>
              </Card>
            )
          })}
        </div>
      </section>

      <Card className="p-5 sm:p-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>{t('dashboard.statusDistribution')}</CardTitle>
          <TrendingUp aria-hidden="true" className="h-5 w-5 text-[var(--accent-ink)]" />
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-3">
          {renderStatusGroup(t('dashboard.plan'), stats?.by_plan_state, t('dashboard.noPlanData'))}
          {renderStatusGroup(t('dashboard.lifecycle'), stats?.by_lifecycle_status, t('dashboard.noLifecycleData'))}
          {renderStatusGroup(t('dashboard.validity'), stats?.by_validity_status, t('dashboard.noValidityData'))}
        </CardContent>
      </Card>
    </div>
  )
}
