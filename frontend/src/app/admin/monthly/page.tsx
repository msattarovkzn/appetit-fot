'use client'
import { useState, useEffect, Fragment } from 'react'
import { api } from '@/lib/api'

const CAT: Record<string, string> = {
  admin: 'Администрация', kitchen: 'Кухня',
  tech: 'Техперсонал', courier: 'Курьеры', reserve: 'Резерв',
}
const PAY: Record<string, string> = { hourly: 'Почасовая', fixed_daily: 'Фикс/день' }

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
]

const BRANCHES = [
  { id: 1, name: 'Челябинск' }, { id: 2, name: 'Казань Ямашева' },
  { id: 3, name: 'Казань Глушко' }, { id: 4, name: 'Казань Хади Такташ' },
  { id: 5, name: 'Казань Шакирова' },
]

function fmt(n: number) { return n.toLocaleString('ru-RU') }

type ReportData = {
  year: number
  month: number
  branch_id: number | null
  rows: Array<{
    employee_id: number; employee_name: string
    position: string; category: string
    payment_type: string; rate: number
    days_worked: number; total_hours: number
    base_pay: number; bonus: number; total_pay: number
    has_corrections: boolean
  }>
  total_hours: number
  total_pay: number
}

export default function MonthlyReportPage() {
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => { setToken(localStorage.getItem('token')) }, [])

  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [branchId, setBranchId] = useState(1)
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

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

  const loadReport = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.adminMonthlyReport(year, month, branchId)
      setData(result)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const exportExcel = async () => {
    if (!data) return
    setExporting(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Аппетит ФОТ'
      wb.created = new Date()

      const branchName = BRANCHES.find(b => b.id === branchId)?.name ?? `Филиал ${branchId}`
      const monthLabel = MONTH_NAMES[month - 1]
      const ws = wb.addWorksheet(`ФОТ ${monthLabel} ${year}`)

      // Title
      ws.mergeCells('A1:J1')
      const titleCell = ws.getCell('A1')
      titleCell.value = `Месячный отчёт ФОТ — ${branchName} — ${monthLabel} ${year}`
      titleCell.font = { bold: true, size: 13 }
      titleCell.alignment = { horizontal: 'center' }

      ws.addRow([]) // empty row

      // Headers
      const headers = ['ФИО', 'Должность', 'Категория', 'Тип оплаты', 'Ставка', 'Дней', 'Часов', 'Базовая оплата', 'Бонус', 'Итого']
      const headerRow = ws.addRow(headers)
      headerRow.eachCell(cell => {
        cell.font = { bold: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FF94A3B8' } }
        }
      })

      // Column widths
      ws.columns = [
        { key: 'name', width: 28 },
        { key: 'position', width: 20 },
        { key: 'category', width: 16 },
        { key: 'payment', width: 14 },
        { key: 'rate', width: 10 },
        { key: 'days', width: 8 },
        { key: 'hours', width: 8 },
        { key: 'base_pay', width: 16 },
        { key: 'bonus', width: 10 },
        { key: 'total', width: 14 },
      ]

      // Group by category
      const categories = ['kitchen', 'admin', 'tech', 'courier', 'reserve']
      for (const cat of categories) {
        const catRows = data.rows.filter(r => r.category === cat)
        if (catRows.length === 0) continue

        // Category header
        const catHeaderRow = ws.addRow([CAT[cat] ?? cat, '', '', '', '', '', '', '', '', ''])
        ws.mergeCells(`A${catHeaderRow.number}:J${catHeaderRow.number}`)
        catHeaderRow.getCell(1).font = { bold: true, italic: true, color: { argb: 'FF475569' } }
        catHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }

        for (const r of catRows) {
          const row = ws.addRow([
            r.employee_name,
            r.position,
            CAT[r.category] ?? r.category,
            PAY[r.payment_type] ?? r.payment_type,
            r.rate,
            r.days_worked,
            r.total_hours,
            r.base_pay,
            r.bonus,
            r.total_pay,
          ])
          // Number formatting
          row.getCell(5).numFmt = '#,##0'
          row.getCell(7).numFmt = '#,##0.0'
          row.getCell(8).numFmt = '#,##0'
          row.getCell(9).numFmt = '#,##0'
          row.getCell(10).numFmt = '#,##0'
          if (r.has_corrections) {
            row.getCell(1).font = { italic: true, color: { argb: 'FFB45309' } }
          }
          row.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } }
        }
      }

      // Totals row
      ws.addRow([])
      const totalsRow = ws.addRow(['', '', '', '', '', '', data.total_hours, '', '', data.total_pay])
      totalsRow.getCell(1).value = 'ИТОГО'
      totalsRow.font = { bold: true, size: 11 }
      totalsRow.getCell(7).numFmt = '#,##0.0'
      totalsRow.getCell(10).numFmt = '#,##0'
      totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
      totalsRow.border = { top: { style: 'medium', color: { argb: 'FFFBBF24' } } }

      // Note for corrections
      if (data.rows.some(r => r.has_corrections)) {
        ws.addRow([])
        const noteRow = ws.addRow(['* Курсивом — записи с ручными корректировками'])
        noteRow.getCell(1).font = { italic: true, color: { argb: 'FFB45309' }, size: 9 }
        ws.mergeCells(`A${noteRow.number}:J${noteRow.number}`)
      }

      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer as ArrayBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `ФОТ_${branchName}_${year}_${String(month).padStart(2, '0')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert('Ошибка экспорта: ' + e.message)
    } finally {
      setExporting(false)
    }
  }

  if (!token) return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-6">
      <h1 className="text-2xl font-bold text-brand">Месячный отчёт</h1>
      <div className="w-full max-w-xs flex flex-col gap-3">
        <input className="border rounded-xl px-4 py-3" placeholder="Логин" value={username}
          onChange={e => setUsername(e.target.value)} />
        <input type="password" className="border rounded-xl px-4 py-3" placeholder="Пароль"
          value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()} />
        {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
        <button onClick={handleLogin}
          className="bg-brand text-white py-3 rounded-xl font-semibold hover:bg-red-700">Войти</button>
      </div>
    </main>
  )

  const branchName = BRANCHES.find(b => b.id === branchId)?.name ?? ''

  return (
    <main className="p-4 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6 mt-4">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-gray-400 hover:text-gray-600 text-sm">← Назад</a>
          <h1 className="text-2xl font-bold text-brand">Месячный отчёт ФОТ</h1>
        </div>
        <button onClick={() => {
          localStorage.removeItem('token')
          localStorage.removeItem('role')
          localStorage.removeItem('full_name')
          setToken(null)
        }} className="text-sm text-gray-400 hover:text-gray-600">Выйти</button>
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
          <span className="text-gray-500">Год</span>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 bg-white">
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-500">Месяц</span>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 bg-white">
            {MONTH_NAMES.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
          </select>
        </label>

        <button onClick={loadReport} disabled={loading}
          className="px-5 py-2 bg-brand text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50">
          {loading ? 'Загрузка...' : 'Показать'}
        </button>

        {data && (
          <button onClick={exportExcel} disabled={exporting}
            className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 flex items-center gap-2">
            <span>📥</span>
            {exporting ? 'Экспорт...' : 'Скачать Excel'}
          </button>
        )}
      </div>

      {error && <p className="text-red-500 mb-4 p-3 bg-red-50 rounded-lg">{error}</p>}

      {/* Итоговая сводка */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <p className="text-xs text-gray-400 mb-1">Сотрудников</p>
            <p className="text-2xl font-bold text-gray-800">{data.rows.length}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200">
            <p className="text-xs text-gray-400 mb-1">Всего часов</p>
            <p className="text-2xl font-bold text-gray-800">{data.total_hours.toFixed(1)}</p>
          </div>
          <div className="bg-white p-4 rounded-xl border border-gray-200 md:col-span-2">
            <p className="text-xs text-gray-400 mb-1">Итого ФОТ</p>
            <p className="text-2xl font-bold text-brand">{fmt(Math.round(data.total_pay))} ₽</p>
          </div>
        </div>
      )}

      {/* Таблица */}
      {data && data.rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <div className="p-3 bg-gray-50 border-b font-semibold text-sm text-gray-700">
            {branchName} — {MONTH_NAMES[month - 1]} {year}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">ФИО</th>
                <th className="px-4 py-3 text-left">Должность</th>
                <th className="px-4 py-3 text-left">Категория</th>
                <th className="px-4 py-3 text-right">Ставка</th>
                <th className="px-4 py-3 text-right">Дней</th>
                <th className="px-4 py-3 text-right">Часов</th>
                <th className="px-4 py-3 text-right">База</th>
                <th className="px-4 py-3 text-right">Бонус</th>
                <th className="px-4 py-3 text-right font-bold">Итого</th>
              </tr>
            </thead>
            <tbody>
              {/* Group by category */}
              {['kitchen', 'admin', 'tech', 'courier', 'reserve'].map(cat => {
                const catRows = data.rows.filter(r => r.category === cat)
                if (catRows.length === 0) return null
                const catTotal = catRows.reduce((s, r) => s + r.total_pay, 0)
                return (
                  <Fragment key={cat}>
                    <tr className="bg-slate-50">
                      <td colSpan={9} className="px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        {CAT[cat] ?? cat}
                      </td>
                    </tr>
                    {catRows.map(r => (
                      <tr key={r.employee_id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className={r.has_corrections ? 'italic text-yellow-700' : 'font-medium'}>
                            {r.employee_name}
                          </span>
                          {r.has_corrections && <span className="ml-1.5 text-xs text-yellow-500">✏️</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{r.position}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                            {PAY[r.payment_type] ?? r.payment_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-500">{fmt(r.rate)} ₽</td>
                        <td className="px-4 py-3 text-right">{r.days_worked}</td>
                        <td className="px-4 py-3 text-right">{r.total_hours.toFixed(1)}</td>
                        <td className="px-4 py-3 text-right">{fmt(Math.round(r.base_pay))} ₽</td>
                        <td className="px-4 py-3 text-right text-gray-500">
                          {r.bonus > 0 ? `${fmt(Math.round(r.bonus))} ₽` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{fmt(Math.round(r.total_pay))} ₽</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50/50 border-b">
                      <td colSpan={8} className="px-4 py-2 text-right text-xs text-slate-500">
                        Итого {CAT[cat] ?? cat}:
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-sm">{fmt(Math.round(catTotal))} ₽</td>
                    </tr>
                  </Fragment>
                )
              })}

              {/* Grand total */}
              <tr className="bg-amber-50 border-t-2 border-amber-200">
                <td colSpan={5} className="px-4 py-3 font-bold text-gray-700">ИТОГО</td>
                <td className="px-4 py-3 text-right font-bold">{data.total_hours.toFixed(1)}</td>
                <td colSpan={2}></td>
                <td className="px-4 py-3 text-right font-bold text-brand text-base">
                  {fmt(Math.round(data.total_pay))} ₽
                </td>
              </tr>
            </tbody>
          </table>

          {data.rows.some(r => r.has_corrections) && (
            <div className="p-3 bg-yellow-50 border-t text-xs text-yellow-700 flex items-center gap-2">
              <span>✏️</span>
              <span>Курсивом выделены записи с ручными корректировками</span>
            </div>
          )}
        </div>
      )}

      {data && data.rows.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p>Нет данных за {MONTH_NAMES[month - 1]} {year}</p>
        </div>
      )}
    </main>
  )
}
