'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import ChangePasswordButton from '@/components/ChangePasswordButton'

const IS_TEST_MODE = process.env.NEXT_PUBLIC_TEST_MODE === 'true'
const TEST_BRANCH_ID = 1

// ─── Types ────────────────────────────────────────────────────────────────────

type BranchSummary = {
  branch_id: number; branch_name: string;
  revenue: number; orders_count: number;
  total_fot: number; kitchen_fot: number;
  total_fot_pct: number | null; kitchen_fot_pct: number | null;
  status_total: string | null; status_kitchen: string | null;
  days_closed: number;
}

type BranchDetail = {
  branch_id: number; branch_name: string;
  from_date: string; to_date: string;
  revenue: number; orders_count: number;
  total_fot: number; kitchen_fot: number;
  admin_fot: number; tech_fot: number; courier_fot: number; reserve_fot: number;
  total_fot_pct: number; kitchen_fot_pct: number;
  status_total: string; status_kitchen: string;
  plan_total: number; plan_kitchen: number;
  deviation_total: number; deviation_kitchen: number;
  entries: Array<{
    employee_id: number; employee_name: string;
    category: string; payment_type: string;
    approved_hours: number; rate: number;
    base_pay: number; bonus: number; total_pay: number;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Pydantic v2 serialises Decimal as strings — always coerce before arithmetic/formatting
const fmt = (n: number | string) => Number(n).toLocaleString('ru-RU')
const fmtRub = (n: number | string) =>
  new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(n))
const fmtPct = (n: number | string | null) => n != null ? `${Number(n).toFixed(1)}%` : '—'

const STATUS_CARD: Record<string, string> = {
  green:  'bg-green-50 border-green-300 text-green-800',
  yellow: 'bg-yellow-50 border-yellow-300 text-yellow-800',
  red:    'bg-red-50 border-red-300 text-red-800',
}
const STATUS_BADGE: Record<string, string> = {
  green:  'bg-green-100 text-green-800',
  yellow: 'bg-yellow-100 text-yellow-800',
  red:    'bg-red-100 text-red-800',
}
const STATUS_LABEL: Record<string, string> = {
  green: '✅ Норма', yellow: '⚠️ Граница', red: '🔴 Превышение',
}
const CATEGORY_RU: Record<string, string> = {
  admin: 'Администратор', kitchen: 'Кухня',
  tech: 'Технический', courier: 'Курьер', reserve: 'Резерв',
}

function monthStart() {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function today() {
  return new Date().toISOString().slice(0, 10)
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function downloadCsv(detail: BranchDetail) {
  const BOM = '﻿'
  const header = ['Сотрудник', 'Категория', 'Тип оплаты', 'Часы', 'Ставка', 'Оклад', 'Бонус', 'Итого']
  const payTypeRu = (t: string) =>
    t === 'hourly' ? 'Почасовой' : t === 'fixed_daily' ? 'Фикс/день' : t
  const rows: (string | number)[][] = detail.entries.map(e => [
    e.employee_name,
    CATEGORY_RU[e.category] ?? e.category,
    payTypeRu(e.payment_type),
    Number(e.approved_hours).toFixed(2).replace('.', ','),
    e.payment_type === 'fixed_daily' ? 'Фикс' : Number(e.rate),
    Number(e.base_pay),
    Number(e.bonus),
    Number(e.total_pay),
  ])
  rows.push([])
  rows.push(['', '', '', '', '', '', 'Итого ФОТ', Number(detail.total_fot)])
  rows.push(['', '', '', '', '', '', 'ФОТ кухни', Number(detail.kitchen_fot)])
  rows.push(['', '', '', '', '', '', 'Выручка', Number(detail.revenue)])
  rows.push(['', '', '', '', '', '', '% ФОТ', `${Number(detail.total_fot_pct).toFixed(1)}%`])
  rows.push(['', '', '', '', '', '', 'Статус', STATUS_LABEL[detail.status_total] ?? detail.status_total])
  const csv = BOM + [header, ...rows].map(r => r.join(';')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `FOT_${detail.branch_name}_${detail.from_date}_${detail.to_date}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function downloadXlsx(detail: BranchDetail) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Аппетит ФОТ'
  const ws = wb.addWorksheet('ФОТ')
  const payTypeRu = (t: string) =>
    t === 'hourly' ? 'Почасовой' : t === 'fixed_daily' ? 'Фикс/день' : t

  // Title row
  ws.mergeCells('A1:H1')
  const title = ws.getCell('A1')
  title.value = `${detail.branch_name}  ·  ${detail.from_date} — ${detail.to_date}`
  title.font = { bold: true, size: 13 }
  title.alignment = { horizontal: 'left' }
  ws.addRow([])

  // Header
  const hRow = ws.addRow(['Сотрудник', 'Категория', 'Тип оплаты', 'Часы', 'Ставка', 'Оклад', 'Бонус', 'Итого'])
  hRow.font = { bold: true }
  hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
  hRow.eachCell(c => { c.border = { bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } } } })

  // Data
  for (const e of detail.entries) {
    const r = ws.addRow([
      e.employee_name,
      CATEGORY_RU[e.category] ?? e.category,
      payTypeRu(e.payment_type),
      Number(e.approved_hours),
      e.payment_type === 'fixed_daily' ? 'Фикс' : Number(e.rate),
      Number(e.base_pay),
      Number(e.bonus) || 0,
      Number(e.total_pay),
    ])
    ;[6, 7, 8].forEach(i => {
      r.getCell(i).numFmt = '#,##0'
    })
  }

  // Totals
  const tRow = ws.addRow([
    'ИТОГО', '', '', '', '',
    detail.entries.reduce((s, e) => s + Number(e.base_pay), 0),
    detail.entries.reduce((s, e) => s + Number(e.bonus), 0),
    Number(detail.total_fot),
  ])
  tRow.font = { bold: true }
  tRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }
  ;[6, 7, 8].forEach(i => { tRow.getCell(i).numFmt = '#,##0' })

  // Summary
  ws.addRow([])
  const summaryData: [string, string | number][] = [
    ['Выручка', Number(detail.revenue)],
    ['Заказов', detail.orders_count],
    ['ФОТ общий', Number(detail.total_fot)],
    ['ФОТ кухни', Number(detail.kitchen_fot)],
    ['% ФОТ общий', `${Number(detail.total_fot_pct).toFixed(1)}%`],
    ['% ФОТ кухня', `${Number(detail.kitchen_fot_pct).toFixed(1)}%`],
    ['Статус', STATUS_LABEL[detail.status_total] ?? detail.status_total],
    ['План общий', Number(detail.plan_total)],
    ['Отклонение', Number(detail.deviation_total)],
  ]
  for (const [label, value] of summaryData) {
    const r = ws.addRow([label, value])
    r.getCell(1).font = { color: { argb: 'FF6B7280' } }
    if (typeof value === 'number') r.getCell(2).numFmt = '#,##0'
  }

  // Column widths
  ws.getColumn(1).width = 26
  ws.getColumn(2).width = 16
  ws.getColumn(3).width = 14
  ws.getColumn(4).width = 8
  ws.getColumn(5).width = 12
  ws.getColumn(6).width = 12
  ws.getColumn(7).width = 12
  ws.getColumn(8).width = 13

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `FOT_${detail.branch_name}_${detail.from_date}_${detail.to_date}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${color || 'bg-white border-gray-200'}`}>
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

function DeviationBadge({ value }: { value: number | string }) {
  const num = Number(value)
  const good = num <= 0
  const cls = good ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100'
  const sign = num > 0 ? '+' : ''
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cls}`}>
      {sign}{fmtRub(num)}
    </span>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FotPage() {
  const [token, setToken] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  const [fromDate, setFromDate] = useState(monthStart)
  const [toDate, setToDate] = useState(today)
  const [loading, setLoading] = useState(false)

  const [branches, setBranches] = useState<BranchSummary[]>([])
  const [detail, setDetail] = useState<BranchDetail | null>(null)
  const [selectedBranch, setSelectedBranch] = useState<number | null>(null)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [totalFot, setTotalFot] = useState(0)

  useEffect(() => {
    setToken(localStorage.getItem('token'))
  }, [])

  // Load branch list
  const loadBranches = useCallback(() => {
    if (!token) return
    setLoading(true)
    api.getFotBranches(fromDate, toDate)
      .then(data => {
        setBranches(data)
        setTotalRevenue(data.reduce((s, b) => s + Number(b.revenue), 0))
        setTotalFot(data.reduce((s, b) => s + Number(b.total_fot), 0))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token, fromDate, toDate])

  // Load branch detail
  const loadDetail = useCallback((branchId: number) => {
    if (!token) return
    setLoading(true)
    api.getFotBranchDetail(branchId, fromDate, toDate)
      .then(setDetail)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token, fromDate, toDate])

  useEffect(() => {
    if (selectedBranch) {
      loadDetail(selectedBranch)
    } else {
      loadBranches()
    }
  }, [loadBranches, loadDetail, selectedBranch])

  const handleLogin = async () => {
    setLoginError('')
    try {
      const res = await api.login(username, password)
      localStorage.setItem('token', res.access_token)
      setToken(res.access_token)
    } catch (e: any) { setLoginError(e.message) }
  }

  const openBranch = (id: number) => { setSelectedBranch(id); setDetail(null) }
  const backToNetwork = () => { setSelectedBranch(null); setDetail(null) }
  const refresh = () => selectedBranch ? loadDetail(selectedBranch) : loadBranches()

  // ─── Login ────────────────────────────────────────────────────────────────
  if (!token) return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-6">
      <h1 className="text-2xl font-bold text-brand">ФОТ — Дашборд</h1>
      <div className="w-full max-w-xs flex flex-col gap-3">
        <input className="border rounded-xl px-4 py-3" placeholder="Логин" value={username}
          onChange={e => setUsername(e.target.value)} />
        <input type="password" className="border rounded-xl px-4 py-3" placeholder="Пароль"
          value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLogin()} />
        {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
        <button onClick={handleLogin}
          className="bg-brand text-white py-3 rounded-xl font-semibold hover:bg-red-700">
          Войти
        </button>
      </div>
    </main>
  )

  // ─── Date filter (shared) ─────────────────────────────────────────────────
  const DateFilter = () => (
    <div className="flex flex-wrap gap-3 items-end">
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
      <button onClick={refresh}
        className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-red-700 font-medium">
        Обновить
      </button>
    </div>
  )

  // ─── Branch detail view ───────────────────────────────────────────────────
  if (selectedBranch) {
    return (
      <main className="p-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-4 mt-4 mb-6">
          <button onClick={backToNetwork}
            className="text-sm text-gray-400 hover:text-gray-700 flex items-center gap-1">
            ← Все филиалы
          </button>
          <h1 className="text-xl font-bold text-brand flex-1 flex items-center gap-2">
            {detail?.branch_name ?? '...'}
            {IS_TEST_MODE && detail?.branch_id === TEST_BRANCH_ID && (
              <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 px-2 py-0.5 rounded-full font-normal">
                🧪 Тестовые данные
              </span>
            )}
          </h1>
          <ChangePasswordButton />
          <button onClick={() => { localStorage.removeItem('token'); setToken(null) }}
            className="text-sm text-gray-400 hover:text-gray-600">Выйти</button>
        </div>

        <DateFilter />

        {loading && <p className="text-gray-400 my-4">Загрузка...</p>}

        {detail && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              <KpiCard label="Выручка" value={fmtRub(detail.revenue)}
                sub={`${detail.orders_count} заказов`} />
              <KpiCard label="Общий ФОТ" value={fmtRub(detail.total_fot)}
                sub={`${fmtPct(detail.total_fot_pct)} от выручки`}
                color={detail.status_total ? STATUS_CARD[detail.status_total] : undefined} />
              <KpiCard label="ФОТ кухни" value={fmtRub(detail.kitchen_fot)}
                sub={`${fmtPct(detail.kitchen_fot_pct)} от выручки`}
                color={detail.status_kitchen ? STATUS_CARD[detail.status_kitchen] : undefined} />
              <div className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col gap-1">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Отклонение от плана</p>
                <div className="flex flex-col gap-1 mt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Общий</span>
                    <DeviationBadge value={detail.deviation_total} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Кухня</span>
                    <DeviationBadge value={detail.deviation_kitchen} />
                  </div>
                </div>
              </div>
            </div>

            {/* Category breakdown */}
            <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { key: 'admin', value: detail.admin_fot },
                { key: 'kitchen', value: detail.kitchen_fot },
                { key: 'tech', value: detail.tech_fot },
                { key: 'courier', value: detail.courier_fot },
                { key: 'reserve', value: detail.reserve_fot },
              ].map(({ key, value }) => (
                <div key={key} className="bg-white border border-gray-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">{CATEGORY_RU[key]}</p>
                  <p className="font-semibold text-sm">{fmtRub(value)}</p>
                </div>
              ))}
            </div>

            {/* Plan reference */}
            <div className="mt-4 p-3 bg-gray-50 rounded-xl text-xs text-gray-500 flex gap-6">
              <span>План общий: <strong>{fmtRub(detail.plan_total)}</strong> (29% от выручки)</span>
              <span>План кухня: <strong>{fmtRub(detail.plan_kitchen)}</strong> (15.5% от выручки)</span>
            </div>

            {/* Export + employee table header */}
            <div className="mt-5 flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">Детализация по сотрудникам</h2>
              {detail.entries.length > 0 && (
                <div className="flex gap-2">
                  <button
                    onClick={() => downloadCsv(detail)}
                    className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 flex items-center gap-1"
                  >
                    ⬇ CSV
                  </button>
                  <button
                    onClick={() => downloadXlsx(detail)}
                    className="px-3 py-1.5 text-sm border border-green-400 text-green-700 rounded-lg hover:bg-green-50 flex items-center gap-1"
                  >
                    ⬇ XLSX
                  </button>
                </div>
              )}
            </div>

            {/* Employee table */}
            {detail.entries.length > 0 ? (
              <div className="mt-3 overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Сотрудник</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-600">Категория</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Часы</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Ставка</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Оклад</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600">Бонус</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-600 bg-gray-100">Итого</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.entries.map(e => (
                      <tr key={e.employee_id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{e.employee_name}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {CATEGORY_RU[e.category] ?? e.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {Number(e.approved_hours).toFixed(1)} ч
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {e.payment_type === 'fixed_daily'
                            ? 'Фикс'
                            : `${fmt(e.rate)} ₽/ч`}
                        </td>
                        <td className="px-4 py-3 text-right">{fmtRub(e.base_pay)}</td>
                        <td className="px-4 py-3 text-right text-blue-600">
                          {Number(e.bonus) > 0 ? `+${fmtRub(e.bonus)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold bg-gray-50">
                          {fmtRub(e.total_pay)}
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="bg-gray-100 font-semibold border-t-2 border-gray-300">
                      <td className="px-4 py-3" colSpan={4}>Итого</td>
                      <td className="px-4 py-3 text-right">
                        {fmtRub(detail.entries.reduce((s, e) => s + Number(e.base_pay), 0))}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-700">
                        +{fmtRub(detail.entries.reduce((s, e) => s + Number(e.bonus), 0))}
                      </td>
                      <td className="px-4 py-3 text-right bg-gray-200">
                        {fmtRub(detail.total_fot)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center text-gray-400 py-10 mt-5 border border-gray-200 rounded-xl">
                Нет данных по сотрудникам за выбранный период
              </p>
            )}
          </>
        )}
      </main>
    )
  }

  // ─── Network (all branches) view ──────────────────────────────────────────
  const totalFotPct = totalRevenue > 0 ? totalFot / totalRevenue * 100 : null

  return (
    <main className="p-4 max-w-6xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6 mt-4">
        <h1 className="text-2xl font-bold text-brand">ФОТ — Сеть филиалов</h1>
        <div className="flex items-center gap-3">
          <ChangePasswordButton />
          <button onClick={() => { localStorage.removeItem('token'); setToken(null) }}
            className="text-sm text-gray-400 hover:text-gray-600">Выйти</button>
        </div>
      </div>

      <DateFilter />
      {loading && <p className="text-gray-400 my-4">Загрузка...</p>}

      {/* Network KPI */}
      {branches.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 mb-6">
          <KpiCard label="Выручка по сети" value={fmtRub(totalRevenue)} />
          <KpiCard label="ФОТ по сети" value={fmtRub(totalFot)} />
          <KpiCard label="ФОТ % сеть" value={totalFotPct != null ? `${totalFotPct.toFixed(1)}%` : '—'} />
          <KpiCard label="Филиалов с данными"
            value={`${branches.filter(b => b.days_closed > 0).length} / ${branches.length}`} />
        </div>
      )}

      {/* Branch cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {branches.map(b => {
          const st = b.status_total
          const cardCls = st ? STATUS_CARD[st] : 'bg-gray-50 border-gray-200'
          return (
            <button
              key={b.branch_id}
              onClick={() => openBranch(b.branch_id)}
              className={`rounded-xl border p-4 text-left hover:shadow-md transition-shadow ${cardCls}`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-base">{b.branch_name}</p>
                  {IS_TEST_MODE && b.branch_id === TEST_BRANCH_ID && b.days_closed > 0 && (
                    <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-300 px-2 py-0.5 rounded-full font-medium">
                      🧪 тест
                    </span>
                  )}
                </div>
                {st
                  ? <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_BADGE[st]}`}>
                      {STATUS_LABEL[st]}
                    </span>
                  : <span className="text-xs text-gray-400">Нет данных</span>
                }
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Выручка</p>
                  <p className="font-semibold">{Number(b.revenue) > 0 ? fmtRub(b.revenue) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Заказы</p>
                  <p className="font-semibold">{b.orders_count > 0 ? b.orders_count : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">ФОТ общий</p>
                  <p className={`font-semibold ${st === 'red' ? 'text-red-700' : st === 'yellow' ? 'text-yellow-700' : ''}`}>
                    {fmtPct(b.total_fot_pct)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">ФОТ кухни</p>
                  <p className={`font-semibold ${b.status_kitchen === 'red' ? 'text-red-700' : b.status_kitchen === 'yellow' ? 'text-yellow-700' : ''}`}>
                    {fmtPct(b.kitchen_fot_pct)}
                  </p>
                </div>
              </div>
              {b.days_closed > 0 && (
                <p className="text-xs text-gray-400 mt-3">{b.days_closed} дн. закрыто · нажмите для деталей</p>
              )}
            </button>
          )
        })}
      </div>

      {/* Detailed table */}
      {branches.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Филиал</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Выручка</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Заказы</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">ФОТ</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">% ФОТ</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">% Кухня</th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">Дней</th>
              </tr>
            </thead>
            <tbody>
              {branches.map(b => (
                <tr key={b.branch_id}
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => openBranch(b.branch_id)}>
                  <td className="px-4 py-3 font-medium">{b.branch_name}</td>
                  <td className="px-4 py-3 text-right">
                    {Number(b.revenue) > 0 ? fmtRub(b.revenue) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {b.orders_count > 0 ? b.orders_count : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {Number(b.total_fot) > 0 ? fmtRub(b.total_fot) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {b.status_total
                      ? <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${STATUS_BADGE[b.status_total]}`}>
                          {fmtPct(b.total_fot_pct)}
                        </span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {b.status_kitchen
                      ? <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${STATUS_BADGE[b.status_kitchen]}`}>
                          {fmtPct(b.kitchen_fot_pct)}
                        </span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">{b.days_closed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {branches.length === 0 && !loading && (
        <p className="text-center text-gray-400 py-12">Нет данных за выбранный период</p>
      )}

      {/* Legend */}
      <div className="mt-6 p-4 bg-gray-50 rounded-xl text-xs text-gray-500 grid grid-cols-2 gap-2">
        <div><span className="font-semibold">ФОТ общий:</span> 🟢 &lt;27.5% · 🟡 27.5–29% · 🔴 &gt;29%</div>
        <div><span className="font-semibold">ФОТ кухни:</span> 🟢 &lt;14.5% · 🟡 14.5–15.5% · 🔴 &gt;15.5%</div>
      </div>
    </main>
  )
}
