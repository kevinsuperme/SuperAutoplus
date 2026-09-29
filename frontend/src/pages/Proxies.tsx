import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/utils'
import { useI18n } from '@/lib/i18n-context'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, RefreshCw, ToggleLeft, ToggleRight, Globe2, ShieldCheck, CircleOff, Activity } from 'lucide-react'

export default function Proxies() {
  const { t } = useI18n()
  const [proxies, setProxies] = useState<any[]>([])
  const [newProxy, setNewProxy] = useState('')
  const [region, setRegion] = useState('')
  const [checking, setChecking] = useState(false)

  const load = () => apiFetch('/proxies').then(setProxies)

  useEffect(() => { load() }, [])

  const add = async () => {
    if (!newProxy.trim()) return
    const lines = newProxy.trim().split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length > 1) {
      await apiFetch('/proxies/bulk', {
        method: 'POST',
        body: JSON.stringify({ proxies: lines, region }),
      })
    } else {
      await apiFetch('/proxies', {
        method: 'POST',
        body: JSON.stringify({ url: lines[0], region }),
      })
    }
    setNewProxy('')
    load()
  }

  const del = async (id: number) => {
    await apiFetch(`/proxies/${id}`, { method: 'DELETE' })
    load()
  }

  const toggle = async (id: number) => {
    await apiFetch(`/proxies/${id}/toggle`, { method: 'PATCH' })
    load()
  }

  const check = async () => {
    setChecking(true)
    await apiFetch('/proxies/check', { method: 'POST' })
    setTimeout(() => { load(); setChecking(false) }, 3000)
  }

  const activeCount = proxies.filter((item) => item.is_active).length
  const totalSuccess = proxies.reduce((sum, item) => sum + Number(item.success_count || 0), 0)
  const totalFail = proxies.reduce((sum, item) => sum + Number(item.fail_count || 0), 0)
  const metricCards = [
    { label: t('proxies.metric.count'), value: proxies.length, icon: Globe2, tone: 'text-[var(--accent-ink)]' },
    { label: t('proxies.metric.enabled'), value: activeCount, icon: ShieldCheck, tone: 'text-[var(--success)]' },
    { label: t('proxies.metric.success'), value: totalSuccess, icon: Activity, tone: 'text-[var(--accent-ink)]' },
    { label: t('proxies.metric.fail'), value: totalFail, icon: CircleOff, tone: 'text-[var(--danger)]' },
  ]

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">{t('proxies.title')}</h1>
            <Badge variant="default">{t('common.total')} {proxies.length}</Badge>
            <Badge variant="secondary">{t('proxies.activeBadge', { count: activeCount })}</Badge>
          </div>
          <Button variant="outline" onClick={check} disabled={checking} aria-busy={checking}>
            <RefreshCw aria-hidden="true" className={`h-4 w-4 mr-1.5 ${checking ? 'animate-spin' : ''}`} />
            {t('proxies.checkAll')}
          </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metricCards.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs leading-5 text-[var(--text-secondary)]">{label}</div>
                <div className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight text-[var(--text-primary)]">{value}</div>
              </div>
              <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--chip-bg)] sm:flex">
                <Icon aria-hidden="true" className={`h-5 w-5 ${tone}`} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Card className="p-5">
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">{t('proxies.addTitle')}</h2>
            <div className="space-y-2">
              <label htmlFor="proxy-address" className="block text-sm font-medium text-[var(--text-secondary)]">{t('proxies.address')}</label>
              <textarea
                id="proxy-address"
                value={newProxy}
                onChange={e => setNewProxy(e.target.value)}
                placeholder="http://user:pass@host:port"
                aria-describedby="proxy-import-hint"
                autoCapitalize="none"
                spellCheck={false}
                rows={7}
                className="control-surface control-surface-mono min-h-36 resize-y"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="proxy-region" className="block text-sm font-medium text-[var(--text-secondary)]">{t('proxies.region')}</label>
              <input
                id="proxy-region"
                value={region}
                onChange={e => setRegion(e.target.value)}
                placeholder="US, SG"
                aria-describedby="proxy-region-hint"
                className="control-surface"
              />
              <p id="proxy-region-hint" className="text-xs leading-5 text-[var(--text-muted)]">{t('proxies.regionPlaceholder')}</p>
            </div>
            <div id="proxy-import-hint" className="rounded-[var(--radius-sm)] bg-[var(--bg-pane)] px-3.5 py-3 text-xs leading-6 text-[var(--text-secondary)]">
              {t('proxies.hint')}
            </div>
            <Button onClick={add} disabled={!newProxy.trim()} className="w-full">
              <Plus aria-hidden="true" className="h-4 w-4 mr-1.5" />
              {t('proxies.addToPool')}
            </Button>
          </div>
        </Card>

        <Card className="overflow-hidden p-0">
          <h2 id="proxy-list-title" className="border-b border-[var(--border-soft)] px-5 py-4 text-base font-semibold text-[var(--text-primary)]">
            {t('proxies.list')}
          </h2>
        <div className="glass-table-wrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--accent-ink)]" role="region" tabIndex={0} aria-labelledby="proxy-list-title">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">{t('proxies.list')}</caption>
          <thead>
            <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
              <th scope="col" className="px-4 py-3 text-left">{t('proxies.address')}</th>
              <th scope="col" className="px-4 py-3 text-left">{t('proxies.region')}</th>
              <th scope="col" className="px-4 py-3 text-left">{t('proxies.successFailure')}</th>
              <th scope="col" className="px-4 py-3 text-left">{t('common.status')}</th>
              <th scope="col" className="px-4 py-3 text-left">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {proxies.map(p => (
              <tr key={p.id} className="border-b border-[var(--border)]/40 hover:bg-[var(--bg-hover)]/70">
                <td className="max-w-[320px] px-4 py-3 font-mono text-xs text-[var(--text-secondary)] [overflow-wrap:anywhere]">{p.url}</td>
                <td className="px-4 py-2.5 text-[var(--text-muted)]">{p.region || '-'}</td>
                <td className="px-4 py-2.5">
                  <span className="tabular-nums text-[var(--success)]">{p.success_count}</span>
                  <span className="text-[var(--text-muted)]"> / </span>
                  <span className="tabular-nums text-[var(--danger)]">{p.fail_count}</span>
                </td>
                <td className="px-4 py-2.5">
                  <Badge variant={p.is_active ? 'success' : 'danger'}>
                    {p.is_active ? t('common.active') : t('common.disabled')}
                  </Badge>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggle(p.id)} className="table-action-btn" aria-label={`${p.is_active ? t('proxies.disable') : t('common.enabled')} ${p.url}`}>
                      {p.is_active ? <ToggleRight aria-hidden="true" className="mr-1.5 h-4 w-4" /> : <ToggleLeft aria-hidden="true" className="mr-1.5 h-4 w-4" />}
                      {p.is_active ? t('proxies.disable') : t('common.enabled')}
                    </button>
                    <button onClick={() => del(p.id)} className="table-action-btn table-action-btn-danger" aria-label={`${t('common.delete')} ${p.url}`}>
                      <Trash2 aria-hidden="true" className="mr-1.5 h-4 w-4" />
                      {t('common.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
          {proxies.length === 0 && (
            <div className="px-5 py-10">
              <div className="empty-state-panel">{t('proxies.empty')}</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
