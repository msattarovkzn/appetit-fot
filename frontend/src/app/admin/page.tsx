'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'

const CAT: Record<string, string> = {
  admin: 'Администрация', kitchen: 'Кухня',
  tech: 'Техперсонал', courier: 'Курьеры', reserve: 'Резерв',
}
const PAY: Record<string, string> = { hourly: 'Почасовая', fixed_daily: 'Фикс/день' }
const STATUS_BG: Record<string, string> = {
  green: 'bg-green-100 text-green-700', yellow: 'bg-yellow-100 text-yellow-700', red: 'bg-red-100 text-red-700',
}
const SHIFT_STATUS: Record<string, string> = { open: '🔴 Открыта', closed: '⚫ Закрыта', approved: '✅ Утверждена' }

type Tab = 'employees' | 'shifts' | 'corrections' | 'violations' | 'reports' | 'fot'

type ModalShift = {
  id: number
  employee_name: string
  date: string
  opened_at: string | null
  mode: 'correct' | 'close'
}

function fmt(n: number) { return n.toLocaleString('ru-RU') }
function fmtDT(s: string) {
  return new Date(s).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
function fmtFull(s: string) {
  return new Date(s).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

const BRANCHES = [
  { id: 1, name: 'Челябинск' }, { id: 2, name: 'Казань Ямашева' },
  { id: 3, name: 'Казань Глушко' }, { id: 4, name: 'Казань Хади Такташ' },
  { id: 5, name: 'Казань Шакирова' },
]

const TABS: { key: Tab; label: string }[] = [
  { key: 'employees',   label: '👥 Сотрудники' },
  { key: 'shifts',      label: '🕐 Смены' },
  { key: 'corrections', label: '✏️ Корректировки' },
  { key: 'violations',  label: '⚠️ Нарушения' },
  { key: 'reports',     label: '📋 Отчёты дня' },
  { key: 'fot',         label: '💰 ФОТ' },
]

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => { setToken(localStorage.getItem('token')) }, [])

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [tab, setTab] = useState<Tab>('employees')

  const today = new Date().toISOString().slice(0, 10)
  const week_ago = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)

  const [branchId, setBranchId] = useState(1)
  const [fromDate, setFromDate] = useState(week_ago)
  const [toDate, setToDate] = useState(today)

  const [employees, setEmployees] = useState<any[]>([])
  const [shifts, setShifts] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [fot, setFot] = useState<any[]>([])
  const [corrections, setCorrections] = useState<any[]>([])
  const [violations, setViolations] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  // Modal state
  const [modal, setModal] = useState<ModalShift | null>(null)
  const [modalHours, setModalHours] = useState('')
  const [modalNote, setModalNote] = useState('')
  const [modalSaving, setModalSaving] = useState(false)

  const handleLogin = async () => {
    setLoginError('')
    try {
      const res = await api.login(username, password)
      localStorage.setItem('token', res.access_token)
      localStorage.setItem('role', res.role)
      localStorage.setItem('full_name', res.full_name)
      setToken(res.access_token)
    } catch (e: any) { setLoginError(e.message) }
  }

  const loadEmployees = useCallback(() => {
    setLoading(true)
    api.getEmployees(branchId).then(setEmployees).catch(() => {}).finally(() => setLoading(false))
  }, [branchId])

  const loadShifts = useCallback(() => {
    setLoading(true)
    api.adminGetShifts({ from_date: fromDate, to_date: toDate, branch_id: branchId })
      .then(setShifts).catch(() => {}).finally(() => setLoading(false))
  }, [branchId, fromDate, toDate])

  const loadReports = useCallback(() => {
    setLoading(true)
    api.getReports(branchId, fromDate, toDate).then(setReports).catch(() => {}).finally(() => setLoading(false))
  }, [branchId, fromDate, toDate])

  const loadFot = useCallback(() => {
    setLoading(true)
    api.getFotSummary(branchId, fromDate, toDate).then(setFot).catch(() => {}).finally(() => setLoading(false))
  }, [branchId, fromDate, toDate])

  const loadCorrections = useCallback(() => {
    setLoading(true)
    api.adminCorrectionsLog({ from_date: fromDate, to_date: toDate, branch_id: branchId })
      .then(setCorrections).catch(() => {}).finally(() => setLoading(false))
  }, [branchId, fromDate, toDate])

  const loadViolations = useCallback(() => {
    setLoading(true)
    api.adminViolations({ from_date: fromDate, to_date: toDate, branch_id: branchId })
      .then(setViolations).catch(() => {}).finally(() => setLoading(false))
  }, [branchId, fromDate, toDate])

  useEffect(() => {
    if (!token) return
    if (tab === 'employees') loadEmployees()
    if (tab === 'shifts') loadShifts()
    if (tab === 'reports') loadReports()
    if (tab === 'fot') loadFot()
    if (tab === 'corrections') loadCorrections()
    if (tab === 'violations') loadViolations()
  }, [token, tab, loadEmployees, loadShifts, loadReports, loadFot, loadCorrections, loadViolations])

  const openModal = (s: any, mode: 'correct' | 'close') => {
    let hours: number | null = s.approved_hours
    if (mode === 'close' && s.opened_at && !s.approved_hours) {
      const computed = (Date.now() - new Date(s.opened_at).getTime()) / 3600000
      hours = Math.round(computed * 2) / 2  // round to nearest 0.5h
    }
    setModalHours(hours != null ? String(hours) : '')
    setModalNote(s.note || '')
    setModal({ id: s.id, employee_name: s.employee_name, date: s.date, opened_at: s.opened_at, mode })
  }

  const handleCorrect = async () => {
    if (!modal || !modalHours) return
    setModalSaving(true)
    try {
      await api.adminCorrectShift(modal.id, parseFloat(modalHours), modalNote || undefined)
      setModal(null)
      loadShifts()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setModalSaving(false)
    }
  }

  const reload = () => {
    if (tab === 'employees') loadEmployees()
    else if (tab === 'shifts') loadShifts()
    else if (tab === 'reports') loadReports()
    else if (tab === 'fot') loadFot()
    else if (tab === 'corrections') loadCorrections()
    else if (tab === 'violations') loadViolations()
  }

  if (!token) return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-6">
      <h1 className="text-2xl font-bold text-brand">Бухгалтерия / Владелец</h1>
      <div className="w-full max-w-xs flex flex-col gap-3">
        <input className="border rounded-xl px-4 py-3" placeholder="Логин" value={username}
          onChange={e => setUsername(e.target.value)} />
        <input type="password" className="border rounded-xl px-4 py-3" placeholder="Пароль"
          value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()} />
        {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
        <button onClick={handleLogin}
          className="bg-brand text-white py-3 rounded-xl font-semibold hover:bg-red-700">Войти</button>
        <p className="text-xs text-gray-400 text-center">owner / owner123 · accountant1 / accountant123</p>
      </div>
    </main>
  )

  return (
    <main className="p-4 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6 mt-4">
        <h1 className="text-2xl font-bold text-brand">Бухгалтерия</h1>
        <button onClick={() => {
          localStorage.removeItem('token')
          localStorage.removeItem('role')
          localStorage.removeItem('full_name')
          setToken(null)
        }} className="text-sm text-gray-400 hover:text-gray-600">Выйти</button>
      </div>

      {/* Быстрый доступ */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
        <a href="/admin/employees"
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-brand/30 transition-all">
          <span className="text-2xl">👥</span>
          <div>
            <p className="font-semibold text-gray-800 text-sm">Сотрудники</p>
            <p className="text-xs text-gray-400">Добавить, изменить ставку, уволить</p>
          </div>
        </a>
        <a href="/admin/positions"
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-brand/30 transition-all">
          <span className="text-2xl">📋</span>
          <div>
            <p className="font-semibold text-gray-800 text-sm">Должности</p>
            <p className="text-xs text-gray-400">Справочник категорий и типов оплаты</p>
          </div>
        </a>
        <a href="/admin/monthly"
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-brand/30 transition-all">
          <span className="text-2xl">📊</span>
          <div>
            <p className="font-semibold text-gray-800 text-sm">Месячный отчёт</p>
            <p className="text-xs text-gray-400">ФОТ по сотрудникам, экспорт Excel</p>
          </div>
        </a>
        <a href="/admin/review"
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-red-100 shadow-sm hover:shadow-md hover:border-brand/30 transition-all">
          <span className="text-2xl">✅</span>
          <div>
            <p className="font-semibold text-gray-800 text-sm">Проверка дней</p>
            <p className="text-xs text-gray-400">🔴🟡🟢 Статусы, аномалии, закрытие</p>
          </div>
        </a>
        <a href="/live"
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-green-100 shadow-sm hover:shadow-md hover:border-green-300 transition-all">
          <span className="text-2xl flex items-center gap-1">🟢</span>
          <div>
            <p className="font-semibold text-gray-800 text-sm">Live — кто на смене</p>
            <p className="text-xs text-gray-400">Все филиалы в реальном времени</p>
          </div>
        </a>
        <a href="/analytics"
          className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md hover:border-brand/30 transition-all">
          <span className="text-2xl">📈</span>
          <div>
            <p className="font-semibold text-gray-800 text-sm">Аналитика</p>
            <p className="text-xs text-gray-400">Тренды, сравнения, прогноз месяца</p>
          </div>
        </a>
      </div>

      {/* Фильтры */}
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-500">Филиал</span>
          <select value={branchId} onChange={e => setBranchId(Number(e.target.value))}
            className="border rounded-lg px-3 py-2">
            {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>

        {tab !== 'employees' && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-500">От</span>
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="border rounded-lg px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-gray-500">До</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="border rounded-lg px-3 py-2" />
            </label>
          </>
        )}

        <button onClick={reload}
          className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-red-700 font-medium">
          Загрузить
        </button>
      </div>

      {/* Табы */}
      <div className="flex gap-1 mb-5 border-b pb-0 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 font-medium text-sm rounded-t-lg transition-colors ${
              tab === t.key
                ? 'bg-white border border-b-white border-gray-200 -mb-px text-brand'
                : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-400 py-4">Загрузка...</p>}

      {/* ═══ Сотрудники ═══ */}
      {tab === 'employees' && !loading && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">ФИО</th>
                <th className="px-4 py-3 text-left">Должность</th>
                <th className="px-4 py-3 text-left">Категория</th>
                <th className="px-4 py-3 text-left">Тип оплаты</th>
                <th className="px-4 py-3 text-center">Кассир</th>
                <th className="px-4 py-3 text-center">Активен</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(e => (
                <tr key={e.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{e.full_name}</td>
                  <td className="px-4 py-3 text-gray-600">{e.position?.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                      {CAT[e.position?.category] ?? e.position?.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{PAY[e.position?.payment_type] ?? '—'}</td>
                  <td className="px-4 py-3 text-center">{e.is_cashier ? '✅' : '—'}</td>
                  <td className="px-4 py-3 text-center">{e.is_active ? '✅' : '❌'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {employees.length === 0 && <p className="text-center text-gray-400 py-8">Нет сотрудников</p>}
        </div>
      )}

      {/* ═══ Смены ═══ */}
      {tab === 'shifts' && !loading && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">Дата</th>
                <th className="px-4 py-3 text-left">Сотрудник</th>
                <th className="px-4 py-3 text-left">Начало</th>
                <th className="px-4 py-3 text-left">Конец</th>
                <th className="px-4 py-3 text-right">Часов</th>
                <th className="px-4 py-3 text-center">Статус</th>
                <th className="px-4 py-3 text-center">Действия</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s: any) => {
                const isOpen = s.status === 'open'
                const displayHours = s.approved_hours != null
                  ? s.approved_hours
                  : s.closed_at && s.opened_at
                    ? ((new Date(s.closed_at).getTime() - new Date(s.opened_at).getTime()) / 3600000).toFixed(1)
                    : null
                return (
                  <tr key={s.id}
                    className={`border-b ${isOpen ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'} ${s.is_corrected ? 'border-l-2 border-l-yellow-400' : ''}`}>
                    <td className="px-4 py-3 text-gray-500">{s.date}</td>
                    <td className="px-4 py-3 font-medium">
                      {s.employee_name}
                      {s.is_corrected && <span className="ml-1.5 text-xs text-yellow-600">✏️</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{s.opened_at ? fmtDT(s.opened_at) : '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{s.closed_at ? fmtDT(s.closed_at) : '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      {displayHours != null ? `${displayHours} ч` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${isOpen ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                        {SHIFT_STATUS[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-1 justify-center">
                        {isOpen && (
                          <button onClick={() => openModal(s, 'close')}
                            className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 whitespace-nowrap">
                            🔒 Закрыть
                          </button>
                        )}
                        <button onClick={() => openModal(s, 'correct')}
                          className="text-xs px-2 py-1 bg-brand text-white rounded hover:bg-red-700 whitespace-nowrap">
                          ✏️ Изменить
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {shifts.length === 0 && <p className="text-center text-gray-400 py-8">Нет смен за период</p>}
          {shifts.filter((s: any) => s.status === 'open').length > 0 && (
            <div className="p-3 bg-red-50 border-t text-xs text-red-600 flex items-center gap-2">
              <span>🔴</span>
              <span>Красным выделены незакрытые смены — требуют ручного закрытия</span>
            </div>
          )}
        </div>
      )}

      {/* ═══ Корректировки ═══ */}
      {tab === 'corrections' && !loading && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">Дата</th>
                <th className="px-4 py-3 text-left">Сотрудник</th>
                <th className="px-4 py-3 text-right">Часов</th>
                <th className="px-4 py-3 text-right">Сумма</th>
                <th className="px-4 py-3 text-left">Примечание</th>
                <th className="px-4 py-3 text-left">Кто изменил</th>
                <th className="px-4 py-3 text-left">Когда</th>
              </tr>
            </thead>
            <tbody>
              {corrections.map((c: any) => (
                <tr key={c.id} className="border-b hover:bg-yellow-50/50 bg-yellow-50/20">
                  <td className="px-4 py-3 text-gray-500">{c.date}</td>
                  <td className="px-4 py-3 font-medium">{c.employee_name}</td>
                  <td className="px-4 py-3 text-right">{c.approved_hours} ч</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(Math.round(c.total_pay))} ₽</td>
                  <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">{c.notes || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.corrected_by}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                    {c.corrected_at ? fmtFull(c.corrected_at) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {corrections.length === 0 && (
            <p className="text-center text-gray-400 py-8">Нет корректировок за период</p>
          )}
          {corrections.length > 0 && (
            <div className="p-3 bg-gray-50 border-t text-xs text-gray-500">
              Всего корректировок: <span className="font-semibold">{corrections.length}</span>
            </div>
          )}
        </div>
      )}

      {/* ═══ Нарушения ═══ */}
      {tab === 'violations' && !loading && (
        <div className="space-y-3">
          <div className="flex gap-4 text-sm text-gray-500 px-1">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 inline-block"></span> ≥3 нарушений — критично</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-200 inline-block"></span> 1–2 нарушения — внимание</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Сотрудник</th>
                  <th className="px-4 py-3 text-left">Филиал</th>
                  <th className="px-4 py-3 text-center">Незакрытых</th>
                  <th className="px-4 py-3 text-center">Ручн. закрытий</th>
                  <th className="px-4 py-3 text-center">Итого</th>
                  <th className="px-4 py-3 text-left">Последний случай</th>
                </tr>
              </thead>
              <tbody>
                {violations.map((v: any, i: number) => {
                  const rowCls = v.total >= 3
                    ? 'bg-red-50 border-b'
                    : v.total >= 1
                      ? 'bg-yellow-50 border-b'
                      : 'border-b hover:bg-gray-50'
                  return (
                    <tr key={v.employee_id} className={rowCls}>
                      <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                      <td className="px-4 py-3 font-medium">{v.employee_name}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{v.branch_name}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={v.unclosed > 0 ? 'text-red-600 font-bold' : 'text-gray-300'}>{v.unclosed}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={v.manual_closed > 0 ? 'text-yellow-700 font-semibold' : 'text-gray-300'}>{v.manual_closed}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-lg font-bold ${v.total >= 3 ? 'text-red-600' : v.total >= 1 ? 'text-yellow-600' : 'text-gray-400'}`}>
                          {v.total}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{v.last_incident}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {violations.length === 0 && (
              <p className="text-center text-gray-400 py-8">✅ Нарушений за период не обнаружено</p>
            )}
          </div>
        </div>
      )}

      {/* ═══ Отчёты дня ═══ */}
      {tab === 'reports' && !loading && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">Дата</th>
                <th className="px-4 py-3 text-right">Выручка</th>
                <th className="px-4 py-3 text-right">Заказы</th>
                <th className="px-4 py-3 text-right">Выносы</th>
                <th className="px-4 py-3 text-left">Закрыт в</th>
                <th className="px-4 py-3 text-center">Статус</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{r.date}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(r.revenue)} ₽</td>
                  <td className="px-4 py-3 text-right">{r.orders_count}</td>
                  <td className="px-4 py-3 text-right">{r.takeaway_count}</td>
                  <td className="px-4 py-3 text-gray-500">{fmtDT(r.closed_at)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs">✅ {r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {reports.length === 0 && <p className="text-center text-gray-400 py-8">Нет отчётов за период</p>}
        </div>
      )}

      {/* ═══ ФОТ ═══ */}
      {tab === 'fot' && !loading && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">Дата</th>
                <th className="px-4 py-3 text-right">Выручка</th>
                <th className="px-4 py-3 text-right">ФОТ общ.</th>
                <th className="px-4 py-3 text-center">% общ.</th>
                <th className="px-4 py-3 text-right">ФОТ кухни</th>
                <th className="px-4 py-3 text-center">% кухни</th>
                <th className="px-4 py-3 text-right">Адм.</th>
                <th className="px-4 py-3 text-right">Техн.</th>
              </tr>
            </thead>
            <tbody>
              {fot.map((f: any) => (
                <tr key={f.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{f.date}</td>
                  <td className="px-4 py-3 text-right">{fmt(f.revenue)} ₽</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(f.total_fot)} ₽</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_BG[f.status_total]}`}>
                      {Number(f.total_fot_pct).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">{fmt(f.kitchen_fot)} ₽</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_BG[f.status_kitchen]}`}>
                      {Number(f.kitchen_fot_pct).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{fmt(f.admin_fot)} ₽</td>
                  <td className="px-4 py-3 text-right text-gray-500">{fmt(f.tech_fot)} ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
          {fot.length === 0 && <p className="text-center text-gray-400 py-8">Нет данных ФОТ за период</p>}
          {fot.length > 0 && (
            <div className="p-3 bg-gray-50 border-t text-xs text-gray-500 flex gap-4">
              <span>🟢 Норма</span>
              <span>ФОТ общ.: &lt;27.5%</span>
              <span>ФОТ кухни: &lt;14.5%</span>
              <span>🟡 Граница · 🔴 Превышение</span>
            </div>
          )}
        </div>
      )}

      {/* ═══ Модальное окно корректировки ═══ */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-1">
              {modal.mode === 'close' ? '🔒 Закрыть смену' : '✏️ Корректировка часов'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {modal.employee_name} · {modal.date}
              {modal.opened_at && modal.mode === 'close' && (
                <span className="ml-2 text-gray-400">с {fmtDT(modal.opened_at)}</span>
              )}
            </p>

            <label className="flex flex-col gap-1 text-sm mb-3">
              <span className="text-gray-600 font-medium">Часов отработано</span>
              <input
                type="number" step="0.5" min="0" max="24"
                value={modalHours}
                onChange={e => setModalHours(e.target.value)}
                className="border rounded-lg px-3 py-2.5 text-lg font-semibold focus:border-brand outline-none"
                placeholder="Например: 8.5"
                autoFocus
              />
            </label>

            <label className="flex flex-col gap-1 text-sm mb-5">
              <span className="text-gray-600 font-medium">Примечание</span>
              <input
                type="text"
                value={modalNote}
                onChange={e => setModalNote(e.target.value)}
                className="border rounded-lg px-3 py-2 focus:border-brand outline-none"
                placeholder="Причина корректировки"
              />
            </label>

            <div className="flex gap-2">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 border rounded-xl text-gray-600 hover:bg-gray-50">
                Отмена
              </button>
              <button
                onClick={handleCorrect}
                disabled={modalSaving || !modalHours || isNaN(parseFloat(modalHours))}
                className="flex-1 py-2.5 bg-brand text-white rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
                {modalSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
