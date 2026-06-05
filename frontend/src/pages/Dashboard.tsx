import { useEffect, useState } from 'react'
import { getPlatforms } from '@/lib/app-data'
import { apiFetch } from '@/lib/utils'
import { translateAccountStatus } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Activity,
  CheckCircle,
  Clock,
  Leaf,
  MonitorCheck,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react'

const PLATFORM_COLORS: Record<string, string> = {
  trae: 'var(--color-sky)',
  tavily: 'var(--color-earth)',
  cursor: 'var(--accent)',
  kiro: 'var(--color-sun)',
  chatgpt: 'var(--color-leaf)',
  gopay: 'var(--color-sky)',
}

const STATUS_VARIANT: Record<string, any> = {
  registered: 'default',
  trial: 'success',
  subscribed: 'success',
  expired: 'warning',
  invalid: 'danger',
  free: 'secondary',
  eligible: 'secondary',
  unknown: 'secondary',
  valid: 'success',
}

function numberValue(value: unknown) {
  return Number(value || 0)
}

export default function Dashboard() {
  const { t, language } = useI18n()
  const [stats, setStats] = useState<any>(null)
  const [desktopStates, setDesktopStates] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(false)
  const desktopPlatforms = ['cursor', 'kiro', 'chatgpt']

  const load = async () => {
    setLoading(true)
    try {
      const [data, platforms] = await Promise.all([
        apiFetch('/accounts/stats'),
        getPlatforms().catch(() => []),
      ])
      setStats(data)
      const desktopEntries = await Promise.all(
        (platforms || [])
          .filter((item: any) => desktopPlatforms.includes(item.name))
          .map(async (item: any) => {
            const state = await apiFetch(`/platforms/${item.name}/desktop-state`).catch(() => ({ available: false }))
            return [item.name, { ...state, platform: item.name, display_name: item.display_name }] as const
          }),
      )
      setDesktopStates(Object.fromEntries(desktopEntries))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const totalCount = Math.max(numberValue(stats?.total), 0)
  const trialCount = numberValue(stats?.by_plan_state?.trial)
  const subscribedCount = numberValue(stats?.by_plan_state?.subscribed)
  const invalidCount = numberValue(stats?.by_display_status?.expired) + numberValue(stats?.by_validity_status?.invalid)
  const activeCount = trialCount + subscribedCount
  const activeRate = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0
  const readyDesktopCount = desktopPlatforms.filter((platform) => desktopStates[platform]?.ready).length
  const platformEntries = Object.entries(stats?.by_platform || {})
    .map(([platform, count]) => ({ platform, count: numberValue(count) }))
    .sort((a, b) => b.count - a.count)

  const statCards = [
    { label: t('dashboard.totalAccounts'), value: totalCount || '-', icon: Users, tone: 'var(--accent)' },
    { label: t('dashboard.trial'), value: trialCount, icon: Clock, tone: 'var(--color-sun)' },
    { label: t('dashboard.subscribed'), value: subscribedCount, icon: CheckCircle, tone: 'var(--color-leaf)' },
    { label: t('dashboard.invalid'), value: invalidCount, icon: XCircle, tone: '#ef4444' },
  ]

  const renderStatusGroup = (title: string, values: Record<string, number> | undefined, emptyCopy = t('dashboard.noData')) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
        <div className="text-sm font-semibold text-[var(--text-primary)]">{title}</div>
      </div>
      {values && Object.keys(values).length > 0 ? Object.entries(values).map(([status, count]) => (
        <div key={status} className="flex items-center justify-between rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-pane)]/45 px-3 py-2.5">
          <Badge variant={STATUS_VARIANT[status] || 'secondary'}>{translateAccountStatus(status, language)}</Badge>
          <span className="text-sm font-semibold text-[var(--text-secondary)]">{count}</span>
        </div>
      )) : (
        <div className="empty-state-panel">{emptyCopy}</div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <section className="leaf-card overflow-hidden p-6 lg:p-8">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_390px] lg:items-center">
          <div className="space-y-6">
            <div className="eco-badge">
              <Leaf className="h-4 w-4" />
              <span>SuperAutoplus</span>
            </div>
            <div>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-[var(--text-primary)] md:text-5xl">
                {t('nav.dashboard')} <span className="eco-gradient-text">{t('dashboard.platformDistribution')}</span>
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-secondary)]">
                {t('dashboard.desktopReadyDescription')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={load} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                {t('common.refresh')}
              </Button>
              <div className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--chip-bg)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)]">
                <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
                <span>{readyDesktopCount}/{desktopPlatforms.length} {t('common.ready')}</span>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {statCards.map(({ label, value, icon: Icon, tone }) => (
                <div key={label} className="organic-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-muted)]">{label}</p>
                      <p className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{value}</p>
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)]" style={{ color: tone }}>
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="calculator-preview relative rounded-[28px] border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-[var(--shadow-hard)]">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t('dashboard.statusDistribution')}</h2>
              <Badge variant="success">{activeRate}%</Badge>
            </div>
            <div className="flex justify-center">
              <div className="relative h-48 w-48">
                <svg className="h-full w-full" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="8" />
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    stroke="url(#activeRateGradient)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${(activeRate / 100) * 326.7} 326.7`}
                    transform="rotate(-90 60 60)"
                  />
                  <defs>
                    <linearGradient id="activeRateGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="var(--accent)" />
                      <stop offset="100%" stopColor="var(--accent-strong)" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-4xl font-semibold text-[var(--text-primary)]">{activeCount}</span>
                  <span className="text-sm font-medium text-[var(--text-muted)]">{t('common.active')}</span>
                </div>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {[
                { label: t('dashboard.subscribed'), value: subscribedCount, percent: totalCount ? Math.round((subscribedCount / totalCount) * 100) : 0, color: 'var(--color-leaf)' },
                { label: t('dashboard.trial'), value: trialCount, percent: totalCount ? Math.round((trialCount / totalCount) * 100) : 0, color: 'var(--color-sun)' },
                { label: t('dashboard.invalid'), value: invalidCount, percent: totalCount ? Math.round((invalidCount / totalCount) * 100) : 0, color: '#ef4444' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-[var(--text-secondary)]">{item.label}</span>
                    <span className="font-semibold text-[var(--text-primary)]">{item.value}</span>
                  </div>
                  <div className="progress-track">
                    <div className="h-full rounded-full" style={{ width: `${item.percent}%`, backgroundColor: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card className="p-5">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{t('dashboard.platformDistribution')}</CardTitle>
            <Activity className="h-5 w-5 text-[var(--accent)]" />
          </CardHeader>
          <CardContent className="space-y-4">
            {platformEntries.length > 0 ? platformEntries.map(({ platform, count }) => {
              const ratio = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
              const color = PLATFORM_COLORS[platform] || 'var(--accent)'
              return (
                <div key={platform} className="rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-pane)]/45 px-4 py-3">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{platform}</span>
                    </div>
                    <span className="text-xs font-semibold text-[var(--text-muted)]">{count} / {ratio}%</span>
                  </div>
                  <div className="progress-track">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${ratio}%`, backgroundColor: color }} />
                  </div>
                </div>
              )
            }) : (
              <div className="empty-state-panel">{stats ? t('dashboard.noPlatformData') : t('dashboard.loadingStats')}</div>
            )}
          </CardContent>
        </Card>

        <Card className="p-5">
          <CardHeader>
            <CardTitle>{t('dashboard.desktopStatus')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {desktopPlatforms.map((platform) => {
              const state = desktopStates[platform]
              const label = state?.app_name || state?.display_name || platform
              const badges = state
                ? [
                    { label: state.installed ? t('dashboard.installed') : t('dashboard.notInstalled'), variant: state.installed ? 'success' : 'secondary' },
                    { label: state.configured ? t('dashboard.configured') : t('dashboard.notConfigured'), variant: state.configured ? 'success' : 'warning' },
                    { label: state.running ? t('dashboard.opened') : t('dashboard.notOpened'), variant: state.running ? 'success' : 'secondary' },
                    { label: state.ready ? t('dashboard.ready') : t('dashboard.notReady'), variant: state.ready ? 'success' : 'warning' },
                  ]
                : []
              return (
                <div key={platform} className="rounded-3xl border border-[var(--border-soft)] bg-[var(--bg-pane)]/45 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <MonitorCheck className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                        <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{label}</div>
                      </div>
                      <div className="mt-2 text-xs leading-5 text-[var(--text-muted)]">
                        {state?.available === false
                          ? (state?.message || t('dashboard.desktopUnavailable'))
                          : (state?.ready_label || state?.status_label || t('dashboard.desktopReadyDescription'))}
                      </div>
                    </div>
                    <Badge variant={state?.ready ? 'success' : 'secondary'}>
                      {state?.ready ? t('common.ready') : t('common.standby')}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {badges.length > 0 ? badges.map((badge) => (
                      <Badge key={`${platform}-${badge.label}`} variant={badge.variant as any}>{badge.label}</Badge>
                    )) : (
                      <span className="text-xs text-[var(--text-muted)]">{t('common.loading')}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <Card className="p-5">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>{t('dashboard.statusDistribution')}</CardTitle>
          <TrendingUp className="h-5 w-5 text-[var(--accent)]" />
        </CardHeader>
        <CardContent className="grid gap-5 xl:grid-cols-3">
          {renderStatusGroup(t('dashboard.plan'), stats?.by_plan_state, t('dashboard.noPlanData'))}
          {renderStatusGroup(t('dashboard.lifecycle'), stats?.by_lifecycle_status, t('dashboard.noLifecycleData'))}
          {renderStatusGroup(t('dashboard.validity'), stats?.by_validity_status, t('dashboard.noValidityData'))}
        </CardContent>
      </Card>
    </div>
  )
}
