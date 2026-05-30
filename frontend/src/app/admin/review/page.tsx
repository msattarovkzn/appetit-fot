'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'

// ── Константы ─────────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, string> = {
  red:    'bg-red-50 border-red-200',
  yellow: 'bg-yellow-50 border-yellow-200',
  green:  'bg-green-50 border-green-200',
}
const STATUS_TEXT: Record<string, string> = {
  red: 'text-red-700', yellow: 'text-yellow-700', green: 'text-green-700',
}
const STATUS_EMOJI: Record<string, string> = { red: '🔴', yellow: '🟡', green: '🟢' }
const STATUS_LABEL: Record<string, string> = {
  red: 'Требует внимания', yellow: 'Ожидает проверки', green: 'Проверен',
}
const FOT_BG: Record<string, string> = {
  green: 'bg-green-100 text-green-800', yellow: 'bg-yellow-100 text-yellow-800', red: 'bg-red-100 text-red-800',
}
const CAT_RU: Record<string, string> = {
  kitchen: 'Кухня', admin: 'Администрация', tech: 'Техперсонал', courier: 'Курьеры', reserve: 'Резерв',
}

// ── Форматирование ────────────────────────────────────────────────────────────
function fmt(n: number) { return n.toLocaleString('ru-RU') }
function fmtPct(n: number | null) { return n != null ? `${Number(n).toFixed(1)}%` : '—' }
function fmtDT(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
function fmtDateFull(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function yesterday() { return new Date(Date.now() - 86400000).toISOString().slice(0, 10) }

// ── Типы ──────────────────────────────────────────────────────────────────────
type BranchSummary = {
  branch_id: number; branch_name: string; date: string
  status: string; emoji: string
  issues_count: number; issues: string[]; issues_labels: string[]
  reviewed_by: string | null; reviewed_at: string | null
}

type ShiftRow = {
  id: number; employee_id: number; employee_name: string
  position_name: string; category: string; payment_type: string; comment: string | null
  status: string; is_extra_shift: boolean; extra_shift_reason: string | null
  opened_at: string | null; closed_at: string | null; hours: number | null
  anomaly_flag: string | null; anomaly_resolved: boolean
  is_corrected: boolean; is_annulled: boolean; note: string | null
  rate: number | null; fixed_daily_rate: number | null
  approved_hours: number | null; base_pay: number | null; bonus: number; total_pay: number | null
  plan_hours: number | null; plan_start: string | null; plan_end: string | null
}

type DetailData = {
  branch_id: number; date: string; status: string; emoji: string
  issues_count: number; issues: string[]; issues_labels: string[]
  reviewed_by: string | null; reviewed_at: string | null; notes: string | null
  daily_report: { revenue: number | null; orders_count: number | null; takeaway_count: number | null; avg_check: number | null }
  fot: { total_fot: number | null; kitchen_fot: number | null; total_fot_pct: number | null; kitchen_fot_pct: number | null; status_total: string | null; status_kitchen: string | null }
  plan_fact: { plan_hours: number; fact_hours: number; plan_fot: number; fact_fot: number | null }
  verdict: string; shifts: ShiftRow[]
}

type ModalMode = 'time' | 'hours' | 'rate' | 'annul' | 'close'

// ── Вспомогательные компоненты ────────────────────────────────────────────────
function ShiftStatusBadge({ s }: { s: ShiftRow }) {
  if (s.is_annulled) return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">аннулирована</span>
  if (s.status === 'open') return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">🔴 незакрыта</span>
  if (s.anomaly_flag === 'critical' && !s.anomaly_resolved) return <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">🚨 &gt;16 ч</span>
  if (s.anomaly_flag === 'warning' && !s.anomaly_resolved) return <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">⚠️ &gt;14 ч</span>
  if (s.is_extra_shift) return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">доп.</span>
  if (s.is_corrected) return <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">✏️ скорр.</span>
  return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">закрыта</span>
}

function Btn({ onClick, label, cls = '' }: { onClick: () => void; label: string; cls?: string }) {
  return (
    <button onClick={onClick}
      className={`text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 whitespace-nowrap transition-colors ${cls}`}>
      {label}
    </button>
  )
}

// ── Главный компонент ─────────────────────────────────────────────────────────
export default function ReviewPage() {
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => { setToken(localStorage.getItem('token')) }, [])

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  const [reviewDate, setReviewDate] = useState(yesterday())
  const [branches, setBranches] = useState<BranchSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<BranchSummary | null>(null)
  const [detail, setDetail] = useState<DetailData | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Модалка корректировки
  const [modalShift, setModalShift] = useState<ShiftRow | null>(null)
  const [modalMode, setModalMode] = useState<ModalMode>('hours')
  const [mOpenedAt, setMOpenedAt] = useState('')
  const [mClosedAt, setMClosedAt] = useState('')
  const [mHours, setMHours] = useState('')
  const [mRate, setMRate] = useState('')
  const [mNote, setMNote] = useState('')
  const [mSaving, setMSaving] = useState(false)

  // Верификация
  const [verifyNote, setVerifyNote] = useState('')
  const [verifying, setVerifying] = useState(false)

  const handleLogin = async () => {
    setLoginError('')
    try {
      const res = await api.login(username, password)
      localStorage.setItem('token', res.access_token)
      setToken(res.access_token)
    } catch (e: any) { setLoginError(e.message) }
  }

  const loadBranches = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try { const d = await api.reviewList(reviewDate); setBranches(d.branches) }
    catch {} finally { setLoading(false) }
  }, [token, reviewDate])

  useEffect(() => { loadBranches() }, [loadBranches])

  const openBranch = async (b: BranchSummary) => {
    setSelected(b); setDetail(null); setDetailLoading(true)
    try { setDetail(await api.reviewDetail(b.branch_id, reviewDate)) }
    catch {} finally { setDetailLoading(false) }
  }

  const refreshDetail = async () => {
    if (!selected) return
    setDetailLoading(true)
    try { setDetail(await api.reviewDetail(selected.branch_id, reviewDate)) }
    catch {} finally { setDetailLoading(false) }
    await loadBranches()
  }

  const openModal = (shift: ShiftRow, mode: ModalMode) => {
    setModalShift(shift)
    setModalMode(mode)
    setMOpenedAt(toLocalInput(shift.opened_at))
    setMClosedAt(toLocalInput(shift.closed_at))
    setMHours(shift.hours != null ? String(shift.hours) : '')
    setMRate(shift.rate != null ? String(shift.rate) : '')
    setMNote(shift.note || '')
  }

  const handleSaveCorrection = async () => {
    if (!modalShift) return
    if (modalMode === 'annul' && !mNote) { alert('Для аннулирования необходим комментарий'); return }
    setMSaving(true)
    try {
      const body: any = {}
      if (mNote) body.note = mNote
      if (modalMode === 'time') {
        if (mOpenedAt) body.opened_at = new Date(mOpenedAt).toISOString()
        if (mClosedAt) body.closed_at = new Date(mClosedAt).toISOString()
      } else if (modalMode === 'hours') {
        body.approved_hours = parseFloat(mHours)
      } else if (modalMode === 'rate') {
        if (mRate) body.rate_override = parseFloat(mRate)
        if (mHours) body.approved_hours = parseFloat(mHours)
      } else if (modalMode === 'annul') {
        body.annul = true
      } else if (modalMode === 'close') {
        body.closed_at = new Date().toISOString()
        if (mHours) body.approved_hours = parseFloat(mHours)
      }
      await api.reviewCorrectShift(modalShift.id, body)
      setModalShift(null)
      await refreshDetail()
    } catch (e: any) { alert(e.message) } finally { setMSaving(false) }
  }

  const handleVerify = async () => {
    if (!selected) return
    setVerifying(true)
    try {
      await api.reviewVerify(selected.branch_id, reviewDate, verifyNote || undefined)
      setVerifyNote(''); await refreshDetail()
    } catch (e: any) { alert(e.message) } finally { setVerifying(false) }
  }

  const handleReopen = async () => {
    if (!selected) return
    try { await api.reviewReopen(selected.branch_id, reviewDate); await refreshDetail() }
    catch (e: any) { alert(e.message) }
  }

  if (!token) return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-6">
      <h1 className="text-2xl font-bold text-brand">Проверка дней</h1>
      <div className="w-full max-w-xs flex flex-col gap-3">
        <input className="border rounded-xl px-4 py-3" placeholder="Логин" value={username} onChange={e => setUsername(e.target.value)} />
        <input type="password" className="border rounded-xl px-4 py-3" placeholder="Пароль" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
        {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
        <button onClick={handleLogin} className="bg-brand text-white py-3 rounded-xl font-semibold hover:bg-red-700">Войти</button>
      </div>
    </main>
  )

  const redC = branches.filter(b => b.status === 'red').length
  const yelC = branches.filter(b => b.status === 'yellow').length
  const grnC = branches.filter(b => b.status === 'green').length

  return (
    <main className="h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* Шапка */}
      <header className="flex items-center gap-4 px-5 py-3 bg-white border-b shadow-sm shrink-0 flex-wrap">
        <a href="/admin" className="text-gray-400 hover:text-gray-600 text-sm">← Назад</a>
        <h1 className="text-xl font-bold text-brand">Проверка дней</h1>
        <div className="flex gap-2 items-center">
          <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm" />
          <button onClick={loadBranches} disabled={loading}
            className="px-3 py-1.5 bg-brand text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            {loading ? '...' : 'Обновить'}
          </button>
        </div>
        <div className="ml-auto flex gap-3 text-sm font-semibold">
          {redC > 0 && <span className="text-red-600">🔴 {redC}</span>}
          {yelC > 0 && <span className="text-yellow-600">🟡 {yelC}</span>}
          {grnC > 0 && <span className="text-green-600">🟢 {grnC}</span>}
        </div>
        <button onClick={() => { localStorage.removeItem('token'); setToken(null) }}
          className="text-sm text-gray-400 hover:text-gray-600">Выйти</button>
      </header>

      {/* Основная область */}
      <div className="flex flex-1 overflow-hidden">

        {/* Левая панель — список филиалов */}
        <aside className="w-56 shrink-0 border-r bg-white overflow-y-auto">
          {branches.map(b => (
            <button key={b.branch_id} onClick={() => openBranch(b)}
              className={`w-full text-left px-4 py-3 border-b transition-all hover:bg-gray-50
                ${selected?.branch_id === b.branch_id ? 'bg-brand/5 border-l-4 border-l-brand' : ''}
              `}>
              <div className={`font-medium text-sm ${STATUS_TEXT[b.status] ?? ''}`}>
                {STATUS_EMOJI[b.status]} {b.branch_name}
                {b.issues_count > 0 && <span className="ml-1 text-xs font-bold">({b.issues_count})</span>}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">{STATUS_LABEL[b.status]}</div>
            </button>
          ))}
          {branches.length === 0 && !loading && (
            <p className="text-center text-gray-300 text-xs p-4">Нет данных</p>
          )}
        </aside>

        {/* Правая панель — детали */}
        <section className="flex-1 overflow-y-auto">
          {!selected && (
            <div className="flex items-center justify-center h-full text-gray-300 text-sm">← Выберите филиал</div>
          )}
          {selected && detailLoading && (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">Загрузка...</div>
          )}
          {selected && detail && !detailLoading && (
            <div className="p-5 space-y-5 max-w-6xl">

              {/* Заголовок + статус + кнопка верификации */}
              <div className={`rounded-xl border-2 p-4 ${STATUS_STYLE[detail.status]}`}>
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div>
                    <h2 className={`text-xl font-bold ${STATUS_TEXT[detail.status]}`}>
                      {STATUS_EMOJI[detail.status]} {selected.branch_name}
                    </h2>
                    <p className="text-sm opacity-70 mt-0.5">{detail.date} · {STATUS_LABEL[detail.status]}</p>
                    {detail.reviewed_by && (
                      <p className="text-xs opacity-60 mt-1">✅ Проверил: {detail.reviewed_by} · {fmtDateFull(detail.reviewed_at)}</p>
                    )}
                  </div>
                  <div className="flex gap-2 items-center flex-wrap">
                    {detail.status === 'green' ? (
                      <button onClick={handleReopen}
                        className="px-3 py-1.5 border border-yellow-400 text-yellow-700 rounded-lg text-sm hover:bg-yellow-50">
                        🔄 Переоткрыть
                      </button>
                    ) : (
                      <>
                        <input type="text" value={verifyNote} onChange={e => setVerifyNote(e.target.value)}
                          placeholder="Примечание (необязательно)"
                          className="border rounded-lg px-3 py-1.5 text-sm bg-white/80 w-48" />
                        <button onClick={handleVerify} disabled={verifying}
                          className="px-4 py-1.5 bg-green-600 text-white text-sm rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
                          {verifying ? '...' : '✅ Проверка завершена'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Вердикт */}
                <p className={`mt-3 text-sm font-medium ${STATUS_TEXT[detail.status]}`}>{detail.verdict}</p>

                {/* Замечания */}
                {detail.issues_labels.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {detail.issues_labels.map((l, i) => <li key={i} className="text-xs opacity-80">• {l}</li>)}
                  </ul>
                )}
              </div>

              {/* Сводка дня */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Сводка дня</h3>

                {detail.daily_report.revenue == null && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-3">
                    ⚠️ День не закрыт кассиром. Данные о выручке отсутствуют.
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Выручка', value: detail.daily_report.revenue != null ? `${fmt(Math.round(detail.daily_report.revenue))} ₽` : '—' },
                    { label: 'Заказы', value: detail.daily_report.orders_count ?? '—' },
                    { label: 'Выносы', value: detail.daily_report.takeaway_count ?? '—' },
                    { label: 'Ср. чек', value: detail.daily_report.avg_check != null ? `${fmt(Math.round(detail.daily_report.avg_check))} ₽` : '—' },
                  ].map(c => (
                    <div key={c.label} className="bg-white border border-gray-200 rounded-xl p-3">
                      <p className="text-xs text-gray-400">{c.label}</p>
                      <p className="text-xl font-bold text-gray-800 mt-0.5">{c.value}</p>
                    </div>
                  ))}
                  <div className={`col-span-2 border-2 rounded-xl p-3 ${FOT_BG[detail.fot.status_total ?? 'green']}`}>
                    <p className="text-xs opacity-70">ФОТ общий</p>
                    <p className="text-xl font-bold">{detail.fot.total_fot != null ? `${fmt(Math.round(detail.fot.total_fot))} ₽` : '—'}</p>
                    <p className="text-sm font-semibold">{fmtPct(detail.fot.total_fot_pct)} · норма &lt;27.5%</p>
                  </div>
                  <div className={`col-span-2 border-2 rounded-xl p-3 ${FOT_BG[detail.fot.status_kitchen ?? 'green']}`}>
                    <p className="text-xs opacity-70">ФОТ кухни</p>
                    <p className="text-xl font-bold">{detail.fot.kitchen_fot != null ? `${fmt(Math.round(detail.fot.kitchen_fot))} ₽` : '—'}</p>
                    <p className="text-sm font-semibold">{fmtPct(detail.fot.kitchen_fot_pct)} · норма &lt;14.5%</p>
                  </div>
                </div>
              </div>

              {/* План / Факт */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">План / Факт</h3>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b text-xs text-gray-500">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Показатель</th>
                        <th className="px-4 py-2 text-right font-medium">План</th>
                        <th className="px-4 py-2 text-right font-medium">Факт</th>
                        <th className="px-4 py-2 text-right font-medium">Отклонение</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const pf = detail.plan_fact
                        const rows = [
                          {
                            label: 'Часы персонала',
                            plan: `${pf.plan_hours.toFixed(1)} ч`,
                            fact: `${pf.fact_hours.toFixed(1)} ч`,
                            diff: pf.fact_hours - pf.plan_hours,
                            fmtDiff: (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(1)} ч`,
                            invertColor: false,
                          },
                          {
                            label: 'ФОТ (расчётный)',
                            plan: pf.plan_fot > 0 ? `${fmt(Math.round(pf.plan_fot))} ₽` : '—',
                            fact: pf.fact_fot != null ? `${fmt(Math.round(pf.fact_fot))} ₽` : '—',
                            diff: pf.fact_fot != null && pf.plan_fot > 0 ? pf.fact_fot - pf.plan_fot : null,
                            fmtDiff: (d: number) => `${d >= 0 ? '+' : ''}${fmt(Math.round(d))} ₽`,
                            invertColor: true,
                          },
                        ]
                        return rows.map(r => {
                          const diffCls = r.diff == null ? 'text-gray-300'
                            : r.diff === 0 ? 'text-gray-400'
                            : (r.diff > 0) === r.invertColor ? 'text-red-600 font-semibold'
                            : 'text-green-600 font-semibold'
                          return (
                            <tr key={r.label} className="border-b last:border-0">
                              <td className="px-4 py-2.5 font-medium">{r.label}</td>
                              <td className="px-4 py-2.5 text-right text-gray-500">{r.plan}</td>
                              <td className="px-4 py-2.5 text-right">{r.fact}</td>
                              <td className={`px-4 py-2.5 text-right ${diffCls}`}>
                                {r.diff != null ? r.fmtDiff(r.diff) : '—'}
                              </td>
                            </tr>
                          )
                        })
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Таблица смен */}
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                  Смены сотрудников ({detail.shifts.length})
                </h3>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[900px]">
                      <thead className="bg-gray-50 border-b">
                        <tr className="text-xs text-gray-500 font-medium">
                          <th className="px-3 py-2.5 text-left">Сотрудник</th>
                          <th className="px-3 py-2.5 text-left">Категория</th>
                          <th className="px-3 py-2.5 text-center">Тип</th>
                          <th className="px-3 py-2.5 text-center">План</th>
                          <th className="px-3 py-2.5 text-center">Начало–Конец</th>
                          <th className="px-3 py-2.5 text-right">Ч (пл/фк)</th>
                          <th className="px-3 py-2.5 text-right">Ставка</th>
                          <th className="px-3 py-2.5 text-right">Начислено</th>
                          <th className="px-3 py-2.5 text-center">Статус</th>
                          <th className="px-3 py-2.5 text-center">Действия</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.shifts.map(s => {
                          const isOpen = s.status === 'open'
                          const isAnom = s.anomaly_flag && !s.anomaly_resolved
                          const rowCls = s.is_annulled
                            ? 'bg-gray-50 opacity-50 border-b'
                            : isOpen ? 'bg-red-50 border-b'
                            : isAnom ? (s.anomaly_flag === 'critical' ? 'bg-red-50 border-b' : 'bg-yellow-50/60 border-b')
                            : s.is_extra_shift ? 'bg-blue-50/40 border-b'
                            : 'border-b hover:bg-gray-50/50'

                          return (
                            <tr key={s.id} className={rowCls}>
                              <td className="px-3 py-2.5">
                                <div className="font-medium text-sm">{s.employee_name}</div>
                                <div className="text-xs text-gray-400">{s.position_name}</div>
                                {s.comment && <div className="text-xs text-gray-300 italic">{s.comment}</div>}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
                                  {CAT_RU[s.category] ?? s.category}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {s.is_extra_shift
                                  ? <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Доп.</span>
                                  : <span className="text-xs text-gray-300">Осн.</span>}
                              </td>
                              <td className="px-3 py-2.5 text-center text-xs text-gray-400">
                                {s.plan_start && s.plan_end
                                  ? <>{s.plan_start.slice(0,5)}–{s.plan_end.slice(0,5)}</>
                                  : s.plan_hours != null ? `${s.plan_hours} ч`
                                  : <span className="text-gray-200">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-center text-xs whitespace-nowrap">
                                {s.opened_at
                                  ? <>{fmtDT(s.opened_at)}&nbsp;–&nbsp;{fmtDT(s.closed_at)}</>
                                  : <span className="text-gray-300">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right text-xs whitespace-nowrap">
                                <span className="text-gray-400">{s.plan_hours != null ? s.plan_hours : '—'}</span>
                                <span className="text-gray-200 mx-0.5">/</span>
                                <span className={`font-semibold ${isAnom ? 'text-red-600' : ''}`}>
                                  {s.hours != null ? s.hours : '—'}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-right text-xs text-gray-500 whitespace-nowrap">
                                {s.rate != null
                                  ? s.payment_type === 'fixed_daily' ? `${fmt(s.rate)} ₽/д` : `${fmt(s.rate)} ₽/ч`
                                  : '—'}
                                {s.is_corrected && !s.is_annulled && <span className="ml-1 text-yellow-500">✏️</span>}
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">
                                {s.is_annulled
                                  ? <span className="text-gray-300 line-through text-xs">{s.total_pay != null ? `${fmt(Math.round(s.total_pay))} ₽` : '—'}</span>
                                  : s.total_pay != null ? `${fmt(Math.round(s.total_pay))} ₽` : '—'}
                              </td>
                              <td className="px-3 py-2.5 text-center whitespace-nowrap">
                                <ShiftStatusBadge s={s} />
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {!s.is_annulled ? (
                                  <div className="flex gap-1 justify-center flex-wrap">
                                    {isOpen && <Btn onClick={() => openModal(s, 'close')} label="🔒 Закрыть" cls="bg-red-600 text-white border-red-600 hover:bg-red-700" />}
                                    <Btn onClick={() => openModal(s, 'time')} label="🕐" />
                                    <Btn onClick={() => openModal(s, 'hours')} label="⏱" />
                                    <Btn onClick={() => openModal(s, 'rate')} label="₽" />
                                    <Btn onClick={() => openModal(s, 'annul')} label="🚫" cls="text-red-500 border-red-200 hover:bg-red-50" />
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-300">аннул.</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Итог */}
                  {detail.shifts.length > 0 && (
                    <div className="border-t bg-gray-50 px-4 py-2 flex flex-wrap gap-4 text-sm">
                      <span className="text-gray-500">
                        Смен: <strong>{detail.shifts.filter(s => !s.is_annulled).length}</strong>
                        {detail.shifts.some(s => s.is_annulled) && <span className="text-gray-400 ml-1">({detail.shifts.filter(s => s.is_annulled).length} аннул.)</span>}
                      </span>
                      <span className="text-gray-500">
                        Часов: <strong>{detail.shifts.filter(s => !s.is_annulled).reduce((a, s) => a + (s.hours ?? 0), 0).toFixed(1)}</strong>
                      </span>
                      <span className="text-gray-500">
                        Начислено: <strong>{fmt(Math.round(detail.shifts.filter(s => !s.is_annulled).reduce((a, s) => a + (s.total_pay ?? 0), 0)))} ₽</strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </section>
      </div>

      {/* Модалка корректировки */}
      {modalShift && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setModalShift(null) }}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-1">
              {modalMode === 'time' && '🕐 Изменить время смены'}
              {modalMode === 'hours' && '⏱ Изменить фактические часы'}
              {modalMode === 'rate' && '₽ Разовая корректировка ставки'}
              {modalMode === 'annul' && '🚫 Аннулировать смену'}
              {modalMode === 'close' && '🔒 Закрыть незакрытую смену'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">{modalShift.employee_name} · {modalShift.position_name}</p>

            {modalMode === 'annul' && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
                ⚠️ Смена будет аннулирована — начисление обнулится. Требуется комментарий.
              </div>
            )}
            {modalMode === 'rate' && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 mb-4">
                Разовая корректировка — постоянная ставка сотрудника не меняется. Пересчёт только для этой смены.
              </div>
            )}

            <div className="space-y-3">
              {modalMode === 'time' && (
                <>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-gray-600">Начало смены</span>
                    <input type="datetime-local" value={mOpenedAt} onChange={e => setMOpenedAt(e.target.value)}
                      className="border rounded-lg px-3 py-2 focus:border-brand outline-none" />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-gray-600">Конец смены</span>
                    <input type="datetime-local" value={mClosedAt} onChange={e => setMClosedAt(e.target.value)}
                      className="border rounded-lg px-3 py-2 focus:border-brand outline-none" />
                  </label>
                </>
              )}
              {(modalMode === 'hours' || modalMode === 'close') && (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-600">Часов отработано</span>
                  <input type="number" step="0.5" min="0" max="24" value={mHours}
                    onChange={e => setMHours(e.target.value)} autoFocus
                    className="border rounded-lg px-3 py-2 text-xl font-semibold focus:border-brand outline-none"
                    placeholder="Например: 8.5" />
                </label>
              )}
              {modalMode === 'rate' && (
                <>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-gray-600">Разовая ставка (₽/ч)</span>
                    <input type="number" step="10" min="0" value={mRate} onChange={e => setMRate(e.target.value)} autoFocus
                      className="border rounded-lg px-3 py-2 text-xl font-semibold focus:border-brand outline-none"
                      placeholder={`Текущая: ${modalShift.rate ?? '—'} ₽/ч`} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-medium text-gray-600">Часов (если нужно скорректировать)</span>
                    <input type="number" step="0.5" min="0" max="24" value={mHours} onChange={e => setMHours(e.target.value)}
                      className="border rounded-lg px-3 py-2 focus:border-brand outline-none"
                      placeholder={`Текущие: ${modalShift.hours ?? '—'} ч`} />
                  </label>
                </>
              )}
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-600">
                  Комментарий{modalMode === 'annul' ? ' *' : ' (необязательно)'}
                </span>
                <input type="text" value={mNote} onChange={e => setMNote(e.target.value)}
                  className="border rounded-lg px-3 py-2 focus:border-brand outline-none"
                  placeholder={modalMode === 'annul' ? 'Причина аннулирования' : 'Причина корректировки'} />
              </label>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setModalShift(null)}
                className="flex-1 py-2.5 border rounded-xl text-gray-600 hover:bg-gray-50">Отмена</button>
              <button onClick={handleSaveCorrection}
                disabled={mSaving || (modalMode === 'annul' && !mNote)}
                className={`flex-1 py-2.5 rounded-xl font-semibold text-white disabled:opacity-50 ${
                  modalMode === 'annul' ? 'bg-red-600 hover:bg-red-700' : 'bg-brand hover:bg-red-700'
                }`}>
                {mSaving ? 'Сохранение...' : modalMode === 'annul' ? 'Аннулировать' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
