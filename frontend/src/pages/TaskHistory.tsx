import { useEffect, useState } from 'react'
import { getPlatforms } from '@/lib/app-data'
import { apiFetch } from '@/lib/utils'
import { formatDateTime } from '@/lib/i18n'
import { useI18n } from '@/lib/i18n-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { getTaskStatusText, isCancellableTaskStatus, isTerminalTaskStatus, TASK_STATUS_VARIANTS } from '@/lib/tasks'
import { RefreshCw, Activity, CheckCircle2, AlertTriangle, Clock3, ChevronDown, CircleStop } from 'lucide-react'

function shortId(id: string) {
  if (!id) return '-'
  return id.length > 12 ? '...' + id.slice(-8) : id
}

function formatError(error: string | null | undefined): string {
  if (!error) return ''
  // Try to extract a readable message from JSON-like strings
  try {
    if (error.startsWith('{') || error.startsWith('[')) {
      const parsed = JSON.parse(error)
      if (parsed.message) return parsed.message
      if (parsed.error) return parsed.error
      if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
        const first = parsed.errors[0]
        return first.message || first.kind || JSON.stringify(first).slice(0, 80)
      }
    }
  } catch {
    // not JSON
  }
  // Truncate long strings
  return error.length > 100 ? error.slice(0, 100) + '...' : error
}

export default function TaskHistory() {
  const { t, language } = useI18n()
  const [tasks, setTasks] = useState<any[]>([])
  const [platform, setPlatform] = useState('')
  const [status, setStatus] = useState('')
  const [platforms, setPlatforms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [terminatingTaskIds, setTerminatingTaskIds] = useState<Set<string>>(() => new Set())

  const load = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: '1', page_size: '50' })
      if (platform) params.set('platform', platform)
      if (status) params.set('status', status)
      const data = await apiFetch(`/tasks?${params}`)
      setTasks(data.items || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    getPlatforms()
      .then((data) => setPlatforms(data || []))
      .catch(() => setPlatforms([]))
  }, [])

  useEffect(() => {
    load()
  }, [platform, status])

  const handleTerminate = async (task: any) => {
    const taskId = String(task.id || task.task_id || '')
    if (!taskId || terminatingTaskIds.has(taskId)) return
    setTerminatingTaskIds((current) => new Set(current).add(taskId))
    try {
      const updated = await apiFetch(`/tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST' })
      setTasks((items) =>
        items.map((item) =>
          String(item.id || item.task_id || '') === taskId
            ? { ...item, ...updated }
            : item
        )
      )
    } finally {
      setTerminatingTaskIds((current) => {
        const next = new Set(current)
        next.delete(taskId)
        return next
      })
    }
  }

  const succeeded = tasks.filter((t) => t.status === 'succeeded').length
  const failed = tasks.filter((t) => t.status === 'failed').length
  const running = tasks.filter((t) =>
    ['running', 'claimed', 'pending', 'cancel_requested'].includes(t.status)
  ).length

  const metricCards = [
    { label: t('taskHistory.metric.total'), value: tasks.length, icon: Activity, tone: 'text-[var(--accent-ink)]' },
    { label: t('common.success'), value: succeeded, icon: CheckCircle2, tone: 'text-[var(--success)]' },
    { label: t('common.failure'), value: failed, icon: AlertTriangle, tone: 'text-[var(--danger)]' },
    { label: t('taskHistory.metric.running'), value: running, icon: Clock3, tone: 'text-[var(--warning)]' },
  ]

  return (
    <div className="min-w-0 space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{t('taskHistory.title')}</h1>
        <Button variant="outline" onClick={load} disabled={loading} aria-busy={loading}>
          <RefreshCw aria-hidden="true" className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          {t('common.refresh')}
        </Button>
      </header>

      {/* Metrics */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {metricCards.map(({ label, value, icon: Icon, tone }) => (
          <Card
            key={label}
            className="flex items-center gap-3"
          >
            <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--chip-bg)] sm:flex ${tone}`}>
              <Icon aria-hidden="true" className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs leading-5 text-[var(--text-secondary)]">{label}</div>
              <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">{value}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters — inline with table header */}
      <Card className="overflow-hidden p-0">
        <div className="flex flex-col gap-4 border-b border-[var(--border-soft)] p-5 lg:flex-row lg:items-end lg:justify-between">
          <h2 id="task-history-table-title" className="text-base font-semibold leading-11 text-[var(--text-primary)]">{t('taskHistory.recent')}</h2>
          <div className="flex min-w-0 flex-wrap items-end gap-3">
            <div className="min-w-0 basis-full space-y-1.5 sm:min-w-40 sm:flex-1 sm:basis-auto">
              <label htmlFor="task-platform-filter" className="block text-xs font-medium text-[var(--text-secondary)]">{t('common.platform')}</label>
              <div className="relative">
                <select
                  id="task-platform-filter"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="control-surface min-h-11 appearance-none pr-9"
                >
                  <option value="">{t('taskHistory.allPlatforms')}</option>
                  {platforms.map((item: any) => (
                    <option key={item.name} value={item.name}>{item.display_name}</option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              </div>
            </div>
            <div className="min-w-0 basis-full space-y-1.5 sm:min-w-40 sm:flex-1 sm:basis-auto">
              <label htmlFor="task-status-filter" className="block text-xs font-medium text-[var(--text-secondary)]">{t('common.status')}</label>
              <div className="relative">
                <select
                  id="task-status-filter"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="control-surface min-h-11 appearance-none pr-9"
                >
                  <option value="">{t('taskHistory.allStatuses')}</option>
                  <option value="running">{t('taskHistory.running')}</option>
                  <option value="succeeded">{t('common.success')}</option>
                  <option value="failed">{t('common.failure')}</option>
                  <option value="cancelled">{getTaskStatusText('cancelled', language)}</option>
                  <option value="interrupted">{getTaskStatusText('interrupted', language)}</option>
                </select>
                <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              </div>
            </div>
            {(platform || status) && (
              <Button
                variant="ghost"
                onClick={() => { setPlatform(''); setStatus('') }}
              >
                {t('common.clear')}
              </Button>
            )}
          </div>
        </div>
        <div role="status" className="sr-only">{loading ? t('common.loading') : `${t('common.total')} ${tasks.length}`}</div>
        <div className="glass-table-wrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent-ink)]" role="region" tabIndex={0} aria-labelledby="task-history-table-title" aria-busy={loading}>
          <table className="w-full min-w-[900px] text-sm">
            <caption className="sr-only">{t('taskHistory.recent')}</caption>
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg-pane)]">
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">{t('common.date')}</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">{t('taskHistory.taskId')}</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">{t('common.platform')}</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">{t('common.status')}</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">{t('common.progress')}</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">{t('taskHistory.successFailure')}</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">{t('common.error')}</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-[var(--text-muted)]">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => {
                const success = task.success || 0
                const errorCount = task.error_count || 0
                const total = success + errorCount
                const errorText = formatError(task.error)
                const taskId = String(task.id || task.task_id || '')
                const terminating = taskId ? terminatingTaskIds.has(taskId) : false
                const statusText = String(task.status || '')
                const canTerminate = Boolean(
                  taskId &&
                  statusText !== 'cancel_requested' &&
                  !isTerminalTaskStatus(statusText) &&
                  (task.cancellable === true || isCancellableTaskStatus(statusText))
                )
                return (
                  <tr
                    key={task.id}
                    className="border-b border-[var(--border)]/50 transition-colors hover:bg-[var(--bg-hover)]"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-[var(--text-muted)]">
                      {task.created_at
                        ? formatDateTime(task.created_at, language, {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false,
                          })
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="cursor-default font-mono text-xs text-[var(--text-muted)]"
                        title={task.id}
                      >
                        {shortId(task.id)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary">{task.platform || '-'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={TASK_STATUS_VARIANTS[task.status] || 'secondary'}>
                        {getTaskStatusText(task.status, language)}
                      </Badge>
                    </td>
                    <td className="max-w-52 px-4 py-3 text-xs text-[var(--text-secondary)] [overflow-wrap:anywhere]">
                      {task.progress || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {total > 0 ? (
                          <>
                            <div aria-hidden="true" className="flex h-1.5 w-16 overflow-hidden rounded-full bg-[var(--chip-bg)]">
                              {success > 0 && (
                                <div
                                  className="h-full bg-[var(--success)] rounded-full"
                                  style={{ width: `${(success / total) * 100}%` }}
                                />
                              )}
                              {errorCount > 0 && (
                                <div
                                  className="h-full bg-[var(--danger)] rounded-full"
                                  style={{ width: `${(errorCount / total) * 100}%` }}
                                />
                              )}
                            </div>
                            <span className="text-xs tabular-nums text-[var(--text-muted)] whitespace-nowrap">
                              <span className="text-[var(--success)]">{success}</span>
                              {' / '}
                              <span className="text-[var(--danger)]">{errorCount}</span>
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">-</span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-[280px] px-4 py-3">
                      {errorText ? (
                        <details className="text-xs leading-5 text-[var(--danger)]">
                          <summary className="min-h-11 cursor-pointer py-2.5 [overflow-wrap:anywhere]">{errorText}</summary>
                          <p className="max-w-[280px] whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[var(--danger-soft)] p-3 [overflow-wrap:anywhere]">{String(task.error)}</p>
                        </details>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canTerminate || terminating || task.status === 'cancel_requested' ? (
                        <Button
                          variant={task.status === 'cancel_requested' ? 'outline' : 'destructive'}
                          size="sm"
                          onClick={() => handleTerminate(task)}
                          disabled={!canTerminate || terminating}
                          title={t('taskHistory.terminateTitle')}
                          className="gap-1.5 whitespace-nowrap"
                        >
                          <CircleStop aria-hidden="true" className={`h-3.5 w-3.5 ${terminating ? 'animate-spin' : ''}`} />
                          {terminating || task.status === 'cancel_requested'
                            ? t('taskHistory.terminating')
                            : t('taskHistory.terminate')}
                        </Button>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">-</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {tasks.length === 0 && (
          <div className="px-5 py-14 text-center text-sm text-[var(--text-muted)]">
            {loading ? t('common.loading') : t('taskHistory.empty')}
          </div>
        )}
      </Card>
    </div>
  )
}
