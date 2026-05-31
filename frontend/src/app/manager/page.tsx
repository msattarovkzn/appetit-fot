'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'

const STATUS_BG: Record<string, string> = {
  green:  'bg-green-100 text-green-800 border-green-200',
  yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  red:    'bg-red-100 text-red-800 border-red-200',
}
const STATUS_LABEL: Record<string, string> = {
  green: '✅ Норма', yellow: '⚠️ Граница', red: '🔴 Превышение',
}

type DashRow = {
  date: string; branch_id: number; branch_name: string;
  revenue: number | null; orders_count: number | null; total_fot: number | null;
  total_fot_pct: number | null; kitchen_fot_pct: number | null;
  kitchen_fot: number | null;
  status_total: string | null; status_kitchen: string | null; open_shifts: number;
}

function fmt(n: number) { return n.toLocaleString('ru-RU') }

export default function ManagerPage() {
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    setToken(localStorage.getItem('token'))
  }, [])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [rows, setRows] = useState<DashRow[]>([])
  const [loading, setLoading] = useState(false)

  const today = new Date().toISOString().slice(0, 10)
  const week_ago = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)
  const [fromDate, setFromDate] = useState(week_ago)
  const [toDate, setToDate] = useState(today)

  const loadData = useCallback(() => {
    if (!token) return
    setLoading(true)
    api.getDashboard({ from_date: fromDate, to_date: toDate })
      .then(setRows).catch(() => {}).finally(() => setLoading(false))
  }, [token, fromDate, toDate])

  useEffect(() => { loadData() }, [loadData])

  const handleLogin = async () => {
    setLoginError('')
    try {
      const res = await api.login(username, password)
      localStorage.setItem('token', res.access_token)
      setToken(res.access_token)
    } catch (e: any) { setLoginError(e.message) }
  }

  if (!token) return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-6">
      <h1 className="text-2xl font-bold text-brand">Управляющий</h1>
      <div className="w-full max-w-xs flex flex-col gap-3">
        <input className="border rounded-xl px-4 py-3" placeholder="Логин" value={username}
          onChange={e => setUsername(e.target.value)} />
        <input type="password" className="border rounded-xl px-4 py-3" placeholder="Пароль"
          value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()} />
        {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
        <button onClick={handleLogin}
          className="bg-brand text-white py-3 rounded-xl font-semibold hover:bg-red-700">Войти</button>
        <p className="text-xs text-gray-400 text-center">manager1 / manager123</p>
      </div>
    </main>
  )

  // Группируем по дате для итогов
  const byDate: Record<string, DashRow[]> = {}
  rows.forEach(r => { if (!byDate[r.date]) byDate[r.date] = []; byDate[r.date].push(r) })

  return (
    <main className="p-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6 mt-4">
        <h1 className="text-2xl font-bold text-brand">Дашборд управляющего</h1>
        <div className="flex items-center gap-3">
          <a href="/live"
            className="flex items-center gap-1.5 text-sm bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 font-medium">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse inline-block" />
            Кто сейчас на смене
          </a>
          <button onClick={() => { localStorage.removeItem('token'); setToken(null) }}
            className="text-sm text-gray-400 hover:text-gray-600">Выйти</button>
        </div>
      </div>

      {/* Фильтр периода */}
      <div className="flex flex-wrap gap-3 mb-5 items-end">
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
        <button onClick={loadData}
          className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-red-700 font-medium">
          Обновить
        </button>
      </div>

      {loading && <p className="text-gray-400 mb-4">Загрузка...</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Дата</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Филиал</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Выручка</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Заказы</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">ФОТ общ.</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">% ФОТ</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">ФОТ кухни</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">% Кухня</th>
              <th className="px-4 py-3 text-center font-semibold text-gray-600">Незакр.</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(byDate)
              .sort((a, b) => b[0].localeCompare(a[0]))
              .flatMap(([d, dateRows]) =>
                dateRows.map((r, i) => (
                  <tr key={`${d}-${r.branch_id}`}
                    className={`border-b hover:bg-gray-50 ${i === 0 ? 'border-t-2 border-t-gray-200' : ''}`}>
                    <td className="px-4 py-3 text-gray-500">{i === 0 ? d : ''}</td>
                    <td className="px-4 py-3 font-medium">{r.branch_name}</td>
                    <td className="px-4 py-3 text-right">
                      {r.revenue != null
                        ? <span className="font-medium">{fmt(r.revenue)} ₽</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {r.orders_count != null ? r.orders_count : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.total_fot != null
                        ? `${fmt(r.total_fot)} ₽`
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.status_total
                        ? <span className={`px-2 py-1 rounded-lg text-xs font-semibold border ${STATUS_BG[r.status_total]}`}>
                            {Number(r.total_fot_pct).toFixed(1)}% {STATUS_LABEL[r.status_total]}
                          </span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.kitchen_fot != null
                        ? `${fmt(r.kitchen_fot)} ₽`
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.status_kitchen
                        ? <span className={`px-2 py-1 rounded-lg text-xs font-semibold border ${STATUS_BG[r.status_kitchen]}`}>
                            {Number(r.kitchen_fot_pct).toFixed(1)}%
                          </span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.open_shifts > 0
                        ? <span className="text-red-600 font-bold">{r.open_shifts}</span>
                        : <span className="text-green-500">0</span>}
                    </td>
                  </tr>
                ))
              )}
          </tbody>
        </table>
        {rows.length === 0 && !loading && (
          <p className="text-center text-gray-400 py-12">Нет данных за выбранный период</p>
        )}
      </div>

      <div className="mt-6 p-4 bg-gray-50 rounded-xl text-xs text-gray-500 grid grid-cols-2 gap-2">
        <div><span className="font-semibold">ФОТ общий:</span> 🟢 &lt;27.5% · 🟡 27.5–29% · 🔴 &gt;29%</div>
        <div><span className="font-semibold">ФОТ кухни:</span> 🟢 &lt;14.5% · 🟡 14.5–15.5% · 🔴 &gt;15.5%</div>
      </div>
    </main>
  )
}
