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
const SHIFT_STATUS: Record<string, string> = { open: '🟢 Открыта', closed: '⚫ Закрыта', approved: '✅ Утверждена' }

type Tab = 'employees' | 'shifts' | 'reports' | 'fot'

function fmt(n: number) { return n.toLocaleString('ru-RU') }
function fmtDT(s: string) {
  return new Date(s).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    setToken(localStorage.getItem('token'))
  }, [])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [tab, setTab] = useState<Tab>('employees')

  const today = new Date().toISOString().slice(0, 10)
  const week_ago = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)

  // Общие фильтры
  const [branchId, setBranchId] = useState(1)
  const [fromDate, setFromDate] = useState(week_ago)
  const [toDate, setToDate] = useState(today)
  const [shiftDate, setShiftDate] = useState(today)

  // Данные
  const [employees, setEmployees] = useState<any[]>([])
  const [shifts, setShifts] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [fot, setFot] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

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
    api.getShifts(branchId, shiftDate).then(setShifts).catch(() => {}).finally(() => setLoading(false))
  }, [branchId, shiftDate])

  const loadReports = useCallback(() => {
    setLoading(true)
    api.getReports(branchId, fromDate, toDate).then(setReports).catch(() => {}).finally(() => setLoading(false))
  }, [branchId, fromDate, toDate])

  const loadFot = useCallback(() => {
    setLoading(true)
    api.getFotSummary(branchId, fromDate, toDate).then(setFot).catch(() => {}).finally(() => setLoading(false))
  }, [branchId, fromDate, toDate])

  useEffect(() => {
    if (!token) return
    if (tab === 'employees') loadEmployees()
    if (tab === 'shifts') loadShifts()
    if (tab === 'reports') loadReports()
    if (tab === 'fot') loadFot()
  }, [token, tab, loadEmployees, loadShifts, loadReports, loadFot])

  const TABS: { key: Tab; label: string }[] = [
    { key: 'employees', label: '👥 Сотрудники' },
    { key: 'shifts',    label: '🕐 Смены' },
    { key: 'reports',   label: '📋 Отчёты дня' },
    { key: 'fot',       label: '💰 ФОТ' },
  ]

  const BRANCHES = [
    { id: 1, name: 'Челябинск' }, { id: 2, name: 'Казань Ямашева' },
    { id: 3, name: 'Казань Глушко' }, { id: 4, name: 'Казань Хади Такташ' },
    { id: 5, name: 'Казань Шакирова' },
  ]

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

      {/* Управление: быстрый доступ */}
      <div className="grid grid-cols-2 gap-3 mb-6">
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
      </div>

      {/* Фильтр филиала */}
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-500">Филиал</span>
          <select value={branchId} onChange={e => setBranchId(Number(e.target.value))}
            className="border rounded-lg px-3 py-2">
            {BRANCHES.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>

        {tab === 'shifts' && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-500">Дата</span>
            <input type="date" value={shiftDate} onChange={e => setShiftDate(e.target.value)}
              className="border rounded-lg px-3 py-2" />
          </label>
        )}

        {(tab === 'reports' || tab === 'fot') && (
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

        <button onClick={() => {
          if (tab === 'employees') loadEmployees()
          if (tab === 'shifts') loadShifts()
          if (tab === 'reports') loadReports()
          if (tab === 'fot') loadFot()
        }} className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-red-700 font-medium">
          Загрузить
        </button>
      </div>

      {/* Аналитика */}
      <div className="flex gap-2 mb-5 border-b pb-0">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
              tab === t.key ? 'bg-white border border-b-white border-gray-200 -mb-px text-brand' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-400 py-4">Загрузка...</p>}

      {/* Сотрудники */}
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

      {/* Смены */}
      {tab === 'shifts' && !loading && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">Сотрудник</th>
                <th className="px-4 py-3 text-left">Начало</th>
                <th className="px-4 py-3 text-left">Конец</th>
                <th className="px-4 py-3 text-right">Часов</th>
                <th className="px-4 py-3 text-center">Статус</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s: any) => {
                const hours = s.closed_at
                  ? ((new Date(s.closed_at).getTime() - new Date(s.opened_at).getTime()) / 3600000).toFixed(1)
                  : null
                return (
                  <tr key={s.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{s.employee_name}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDT(s.opened_at)}</td>
                    <td className="px-4 py-3 text-gray-600">{s.closed_at ? fmtDT(s.closed_at) : '—'}</td>
                    <td className="px-4 py-3 text-right">{hours ? `${hours} ч` : '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-xs">{SHIFT_STATUS[s.status]}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {shifts.length === 0 && <p className="text-center text-gray-400 py-8">Нет смен за этот день</p>}
        </div>
      )}

      {/* Отчёты дня */}
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

      {/* ФОТ */}
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
    </main>
  )
}
