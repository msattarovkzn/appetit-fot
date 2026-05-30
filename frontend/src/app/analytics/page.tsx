'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'

const BRANCHES = [
  { id: 0, name: 'Все филиалы' },
  { id: 1, name: 'Челябинск' }, { id: 2, name: 'Казань Ямашева' },
  { id: 3, name: 'Казань Глушко' }, { id: 4, name: 'Казань Хади Такташ' },
  { id: 5, name: 'Казань Шакирова' },
]

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('ru-RU')
}
function fmtM(n: number | null | undefined) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} млн`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} тыс`
  return String(Math.round(n))
}
function fmtPct(n: number | null | undefined) {
  if (n == null) return '—'
  return `${Number(n).toFixed(1)}%`
}
function diffColor(v: number | null | undefined, invert = false) {
  if (v == null) return 'text-gray-400'
  if (v === 0) return 'text-gray-400'
  const positive = v > 0
  return (positive !== invert) ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'
}
function diffFmt(v: number | null | undefined, suffix = '%') {
  if (v == null) return '—'
  return `${v > 0 ? '+' : ''}${Number(v).toFixed(1)}${suffix}`
}

const FOT_NORM_TOTAL = 27.5
const FOT_NORM_KITCHEN = 14.5

function fotStatusClass(pct: number | null | undefined, threshold: number) {
  if (pct == null) return 'text-gray-400'
  if (pct < threshold) return 'text-green-600'
  if (pct < threshold + 1.5) return 'text-yellow-600 font-semibold'
  return 'text-red-600 font-semibold'
}

type OverviewData = Awaited<ReturnType<typeof api.analyticsOverview>>
type CompareData = Awaited<ReturnType<typeof api.analyticsCompare>>

export default function AnalyticsPage() {
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => { setToken(localStorage.getItem('token')) }, [])

  const [username, setUsername] = useState(''); const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const monthAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)

  const [fromDate, setFromDate] = useState(monthAgo)
  const [toDate, setToDate] = useState(today)
  const [branchId, setBranchId] = useState(0)
  const [data, setData] = useState<OverviewData | null>(null)
  const [cmpPeriod, setCmpPeriod] = useState<'yesterday' | 'week' | 'month'>('week')
  const [cmp, setCmp] = useState<CompareData | null>(null)
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoginError('')
    try {
      const res = await api.login(username, password)
      localStorage.setItem('token', res.access_token)
      setToken(res.access_token)
    } catch (e: any) { setLoginError(e.message) }
  }

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const [overview, compare] = await Promise.all([
        api.analyticsOverview({ from_date: fromDate, to_date: toDate, branch_id: branchId || undefined }),
        api.analyticsCompare({ period: cmpPeriod, branch_id: branchId || undefined }),
      ])
      setData(overview)
      setCmp(compare)
    } catch {} finally { setLoading(false) }
  }, [token, fromDate, toDate, branchId, cmpPeriod])

  useEffect(() => { load() }, [load])

  if (!token) return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-6">
      <h1 className="text-2xl font-bold text-brand">Аналитика</h1>
      <div className="w-full max-w-xs flex flex-col gap-3">
        <input className="border rounded-xl px-4 py-3" placeholder="Логин" value={username} onChange={e => setUsername(e.target.value)} />
        <input type="password" className="border rounded-xl px-4 py-3" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
        {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
        <button onClick={handleLogin} className="bg-brand text-white py-3 rounded-xl font-semibold hover:bg-red-700">Войти</button>
      </div>
    </main>
  )

  return (
    <main className="p-4 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-5 mt-4">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-gray-400 hover:text-gray-600 text-sm">← Назад</a>
          <h1 className="text-2xl font-bold text-brand">Аналитика</h1>
        </div>
        <button onClick={() => { localStorage.removeItem('token'); setToken(null) }}
          className="text-sm text-gray-400 hover:text-gray-600">Выйти</button>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap gap-3 mb-6 items-end p-4 bg-gray-50 rounded-xl border border-gray-200">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-500">Филиал</span>
          <select value={branchId} onChange={e => setBranchId(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 bg-white">
            {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-500">От</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="border rounded-lg px-3 py-2 bg-white" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-500">До</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="border rounded-lg px-3 py-2 bg-white" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-500">Сравнение</span>
          <select value={cmpPeriod} onChange={e => setCmpPeriod(e.target.value as any)}
            className="border rounded-lg px-3 py-2 bg-white">
            <option value="yesterday">Вчера vs позавчера</option>
            <option value="week">Эта неделя vs прошлая</option>
            <option value="month">Этот месяц vs прошлый</option>
          </select>
        </label>
        <button onClick={load} disabled={loading}
          className="px-5 py-2 bg-brand text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50">
          {loading ? 'Загрузка...' : 'Показать'}
        </button>
      </div>

      {!data && !loading && (
        <p className="text-center text-gray-400 py-12">Нажмите «Показать» для загрузки данных</p>
      )}
      {loading && <p className="text-gray-400 py-8 text-center">Загрузка...</p>}

      {data && !loading && (
        <div className="space-y-6">

          {/* ── 1. Сравнение периодов ── */}
          <Section title="📊 Сравнение периодов">
            {cmp && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-gray-500">Показатель</th>
                      <th className="px-4 py-2.5 text-right font-medium text-gray-500">
                        Текущий ({cmp.current.from === cmp.current.to ? cmp.current.from : `${cmp.current.from} – ${cmp.current.to}`})
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium text-gray-500">
                        Пред. ({cmp.previous.from === cmp.previous.to ? cmp.previous.from : `${cmp.previous.from} – ${cmp.previous.to}`})
                      </th>
                      <th className="px-4 py-2.5 text-right font-medium text-gray-500">Изменение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Выручка', cur: `${fmt(Math.round(cmp.current.revenue))} ₽`, prev: `${fmt(Math.round(cmp.previous.revenue))} ₽`, diff: cmp.diff.revenue_pct, suf: '%' },
                      { label: 'Заказы', cur: String(cmp.current.orders), prev: String(cmp.previous.orders), diff: cmp.diff.orders_pct, suf: '%' },
                      { label: 'Средний чек', cur: cmp.current.avg_check ? `${fmt(Math.round(cmp.current.avg_check))} ₽` : '—', prev: cmp.previous.avg_check ? `${fmt(Math.round(cmp.previous.avg_check))} ₽` : '—', diff: cmp.diff.avg_check_pct, suf: '%' },
                      { label: 'Выручка/день', cur: cmp.current.avg_revenue ? `${fmt(Math.round(cmp.current.avg_revenue))} ₽` : '—', prev: cmp.previous.avg_revenue ? `${fmt(Math.round(cmp.previous.avg_revenue))} ₽` : '—', diff: null, suf: '%' },
                    ].map(r => (
                      <tr key={r.label} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-medium">{r.label}</td>
                        <td className="px-4 py-2.5 text-right">{r.cur}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{r.prev}</td>
                        <td className={`px-4 py-2.5 text-right ${diffColor(r.diff)}`}>
                          {diffFmt(r.diff, r.suf)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ── 2. Итоги периода ── */}
          <Section title={`📈 Итоги периода (${data.period.from_date} – ${data.period.to_date}, ${data.period.days} дн.)`}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: 'Выручка', value: `${fmtM(data.totals.revenue)} ₽`, sub: `${fmt(Math.round(data.totals.avg_revenue_per_day))} ₽/день` },
                { label: 'Заказы', value: fmt(data.totals.orders), sub: `${data.totals.avg_orders_per_day} в день` },
                { label: 'Средний чек', value: data.totals.avg_check != null ? `${fmt(Math.round(data.totals.avg_check))} ₽` : '—', sub: '' },
                { label: 'Выносы', value: fmt(data.totals.takeaways), sub: '' },
              ].map(c => (
                <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-3">
                  <p className="text-xs text-gray-400">{c.label}</p>
                  <p className="text-xl font-bold text-gray-800 mt-0.5">{c.value}</p>
                  {c.sub && <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>}
                </div>
              ))}
              <div className={`col-span-2 border-2 rounded-xl p-3 ${data.totals.total_fot_pct != null && data.totals.total_fot_pct < FOT_NORM_TOTAL ? 'bg-green-50 border-green-200' : data.totals.total_fot_pct != null && data.totals.total_fot_pct < FOT_NORM_TOTAL + 1.5 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
                <p className="text-xs text-gray-500">ФОТ общий</p>
                <p className="text-xl font-bold">{fmtM(data.totals.total_fot)} ₽</p>
                <p className={`text-sm font-semibold ${fotStatusClass(data.totals.total_fot_pct, FOT_NORM_TOTAL)}`}>
                  {fmtPct(data.totals.total_fot_pct)} · норма &lt;{FOT_NORM_TOTAL}%
                </p>
              </div>
              <div className={`col-span-2 border-2 rounded-xl p-3 ${data.totals.kitchen_fot_pct != null && data.totals.kitchen_fot_pct < FOT_NORM_KITCHEN ? 'bg-green-50 border-green-200' : data.totals.kitchen_fot_pct != null && data.totals.kitchen_fot_pct < FOT_NORM_KITCHEN + 1 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
                <p className="text-xs text-gray-500">ФОТ кухни</p>
                <p className="text-xl font-bold">{fmtM(data.totals.kitchen_fot)} ₽</p>
                <p className={`text-sm font-semibold ${fotStatusClass(data.totals.kitchen_fot_pct, FOT_NORM_KITCHEN)}`}>
                  {fmtPct(data.totals.kitchen_fot_pct)} · норма &lt;{FOT_NORM_KITCHEN}%
                </p>
              </div>
            </div>
          </Section>

          {/* ── 3. Тренд по дням ── */}
          <Section title="📅 Тренд по дням">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead className="bg-gray-50 border-b text-xs text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Дата</th>
                    <th className="px-3 py-2 text-left">День</th>
                    <th className="px-3 py-2 text-right">Выручка</th>
                    <th className="px-3 py-2 text-right">Заказы</th>
                    <th className="px-3 py-2 text-right">Выносы</th>
                    <th className="px-3 py-2 text-right">Ср. чек</th>
                    <th className="px-3 py-2 text-right">ФОТ %</th>
                    <th className="px-3 py-2 text-right">ФОТ кухни %</th>
                  </tr>
                </thead>
                <tbody>
                  {[...data.trend].reverse().map(row => (
                    <tr key={row.date} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-500">{row.date}</td>
                      <td className="px-3 py-2 font-medium">{row.weekday}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmt(Math.round(row.revenue))} ₽</td>
                      <td className="px-3 py-2 text-right">{row.orders}</td>
                      <td className="px-3 py-2 text-right text-gray-400">{row.takeaways}</td>
                      <td className="px-3 py-2 text-right">{row.avg_check != null ? `${fmt(Math.round(row.avg_check))} ₽` : '—'}</td>
                      <td className={`px-3 py-2 text-right ${fotStatusClass(row.total_fot_pct, FOT_NORM_TOTAL)}`}>
                        {fmtPct(row.total_fot_pct)}
                      </td>
                      <td className={`px-3 py-2 text-right ${fotStatusClass(row.kitchen_fot_pct, FOT_NORM_KITCHEN)}`}>
                        {fmtPct(row.kitchen_fot_pct)}
                      </td>
                    </tr>
                  ))}
                  {data.trend.length === 0 && (
                    <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Нет данных</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          {/* ── 4. Дни недели ── */}
          {data.weekday_stats.length > 0 && (
            <Section title="📆 Статистика по дням недели">
              <div className="grid grid-cols-7 gap-2 mb-3">
                {data.weekday_stats.map(wd => {
                  const isBest = wd.weekday === data.best_weekday
                  const isWorst = wd.weekday === data.worst_weekday
                  return (
                    <div key={wd.weekday}
                      className={`p-3 rounded-xl border text-center ${
                        isBest ? 'bg-green-50 border-green-300' : isWorst ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'
                      }`}>
                      <p className="text-sm font-bold">{wd.weekday}</p>
                      {isBest && <p className="text-xs text-green-600">🏆</p>}
                      {isWorst && <p className="text-xs text-red-500">📉</p>}
                      <p className="text-xs font-semibold mt-1">{fmtM(wd.avg_revenue)} ₽</p>
                      <p className="text-xs text-gray-400">{wd.samples} дн.</p>
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-4 text-sm text-gray-500">
                {data.best_weekday && <span>🏆 Лучший: <strong className="text-green-600">{data.best_weekday}</strong></span>}
                {data.worst_weekday && <span>📉 Худший: <strong className="text-red-500">{data.worst_weekday}</strong></span>}
              </div>
            </Section>
          )}

          {/* ── 5. Рейтинг филиалов ── */}
          {data.branch_stats.length > 0 && (
            <Section title="🏢 Рейтинг филиалов">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b text-xs text-gray-500">
                    <tr>
                      <th className="px-4 py-2 text-left">#</th>
                      <th className="px-4 py-2 text-left">Филиал</th>
                      <th className="px-4 py-2 text-right">Выручка</th>
                      <th className="px-4 py-2 text-right">Выр./день</th>
                      <th className="px-4 py-2 text-right">Заказы</th>
                      <th className="px-4 py-2 text-right">Дней</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.branch_stats.map((b, i) => {
                      const isBest = i === 0
                      const isWorst = i === data.branch_stats.length - 1
                      return (
                        <tr key={b.branch_id}
                          className={`border-b ${isBest ? 'bg-green-50' : isWorst ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-2.5 text-gray-400 text-xs">
                            {isBest ? '🏆' : isWorst ? '📉' : i + 1}
                          </td>
                          <td className="px-4 py-2.5 font-medium">{b.branch_name}</td>
                          <td className="px-4 py-2.5 text-right font-semibold">{fmt(Math.round(b.revenue))} ₽</td>
                          <td className="px-4 py-2.5 text-right">{fmt(Math.round(b.avg_revenue))} ₽</td>
                          <td className="px-4 py-2.5 text-right">{b.orders}</td>
                          <td className="px-4 py-2.5 text-right text-gray-400">{b.days}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* ── 6. Прогноз месяца ── */}
          <Section title="🔮 Прогноз выполнения месяца">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Выручка за месяц (факт)', value: `${fmtM(data.month_forecast.month_revenue_so_far)} ₽` },
                { label: 'Дней прошло', value: `${data.month_forecast.days_elapsed} из ${data.month_forecast.days_in_month}` },
                { label: 'Прогноз до конца месяца', value: data.month_forecast.projected_month_revenue != null ? `${fmtM(data.month_forecast.projected_month_revenue)} ₽` : '—' },
                {
                  label: 'Выполнение',
                  value: data.month_forecast.projected_month_revenue != null
                    ? `${Math.round(data.month_forecast.month_revenue_so_far / data.month_forecast.projected_month_revenue * 100 * (data.month_forecast.days_in_month / data.month_forecast.days_elapsed))}%`
                    : '—',
                },
              ].map(c => (
                <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-3">
                  <p className="text-xs text-gray-400">{c.label}</p>
                  <p className="text-xl font-bold text-gray-800 mt-0.5">{c.value}</p>
                </div>
              ))}
            </div>

            {/* Прогресс-бар */}
            {data.month_forecast.projected_month_revenue && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>0</span>
                  <span className="font-semibold">{fmtM(data.month_forecast.projected_month_revenue)} ₽ (прогноз)</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-4 bg-brand rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, Math.round(data.month_forecast.month_revenue_so_far / data.month_forecast.projected_month_revenue * 100))}%`
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Выполнено {Math.round(data.month_forecast.month_revenue_so_far / data.month_forecast.projected_month_revenue * 100)}%
                  ({data.month_forecast.days_elapsed}/{data.month_forecast.days_in_month} дней)
                </p>
              </div>
            )}
          </Section>

        </div>
      )}
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50">
        <h2 className="font-semibold text-gray-700 text-sm">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}
