'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'

// ─── Constants ───────────────────────────────────────────────────────────────

const IS_TEST_MODE = process.env.NEXT_PUBLIC_TEST_MODE === 'true'

const CAT: Record<string, string> = {
  admin: 'Администрация',
  kitchen: 'Кухня',
  tech: 'Техперсонал',
  courier: 'Курьеры',
  reserve: 'Резерв',
}
const CAT_ORDER = ['admin', 'kitchen', 'tech', 'courier', 'reserve']
const DAYS_RU = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayPlan {
  plan_id: number
  planned_hours: number
  start_time: string | null   // "HH:MM" or null
  end_time: string | null
  break_minutes: number
  comment: string
}

interface DayActual {
  approved_hours: number
  shift_count: number
  first_opened: string | null   // "HH:MM" of first shift open
  last_closed: string | null    // "HH:MM" of last shift close
}

interface DebugShift {
  id: number; date: string
  opened_at: string | null; closed_at: string | null
  total_minutes: number | null; approved_hours: number | null; computed_hours: number
}

interface EmployeeRow {
  employee_id: number
  employee_name: string
  category: string
  payment_type: string
  rate: number
  fixed_daily_rate: number | null
  plans: Record<string, DayPlan | null>
  actuals: Record<string, DayActual | null>
  debug_shifts: DebugShift[]
}

interface ScheduleWeek {
  week_start: string
  week_end: string
  branch_id: number
  branch_name: string
  days: string[]
  employees: EmployeeRow[]
}

type Branch = { id: number; name: string; city: string }

// Edit record: start+end time drive hours; hours is legacy fallback
interface EditEntry {
  start_time: string    // "HH:MM" or ""
  end_time: string      // "HH:MM" or ""
  break_minutes: string // "0"
  hours: string         // legacy fallback (no times)
  comment: string
}
type Edits = Record<string, EditEntry>

// ─── Time helpers ─────────────────────────────────────────────────────────────

/** Parse "HH:MM" into total minutes from midnight. */
function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** Compute planned hours from times (supports overnight). */
function hoursFromTimes(start: string, end: string, breakMin = 0): number {
  if (!start || !end) return 0
  let sMin = toMin(start)
  let eMin = toMin(end)
  if (eMin <= sMin) eMin += 24 * 60   // overnight shift
  return Math.max(0, (eMin - sMin - breakMin) / 60)
}

/** Get effective hours from an edit entry. */
function editHours(val: EditEntry | undefined): number {
  if (!val) return 0
  if (val.start_time && val.end_time) {
    return hoursFromTimes(val.start_time, val.end_time, parseInt(val.break_minutes || '0') || 0)
  }
  return parseFloat(val.hours || '0') || 0
}

/** Format hours as "8ч" or "7.5ч". */
function fmtH(h: number): string {
  if (h <= 0) return ''
  return Number.isInteger(h) ? `${h}ч` : `${h.toFixed(1)}ч`
}

// ─── Calendar helpers ─────────────────────────────────────────────────────────

function getMondayOf(d: Date): string {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setDate(d.getDate() + diff)
  return mon.toISOString().slice(0, 10)
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

// ─── Pay helpers ──────────────────────────────────────────────────────────────

function dayPay(emp: EmployeeRow, hours: number): number {
  if (hours <= 0) return 0
  if (emp.payment_type === 'fixed_daily') return emp.fixed_daily_rate ?? emp.rate
  return hours * emp.rate
}

function calcDayFot(employees: EmployeeRow[], day: string, edits: Edits): number {
  return employees.reduce((s, emp) => {
    return s + dayPay(emp, editHours(edits[`${emp.employee_id}:${day}`]))
  }, 0)
}

function calcDayActualFot(employees: EmployeeRow[], day: string): number {
  return employees.reduce((s, emp) => {
    return s + dayPay(emp, emp.actuals[day]?.approved_hours ?? 0)
  }, 0)
}

function calcEmpPlannedPay(emp: EmployeeRow, days: string[], edits: Edits): number {
  return days.reduce((s, day) => s + dayPay(emp, editHours(edits[`${emp.employee_id}:${day}`])), 0)
}

function calcEmpActualPay(emp: EmployeeRow, days: string[]): number {
  return days.reduce((s, day) => s + dayPay(emp, emp.actuals[day]?.approved_hours ?? 0), 0)
}

function fmt(n: number) {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}

// ─── Cell background (by hours) ───────────────────────────────────────────────

function cellCls(hours: number): string {
  if (hours <= 0)  return 'border-gray-200 bg-white'
  if (hours <= 8)  return 'border-green-200 bg-green-50'
  if (hours <= 12) return 'border-yellow-200 bg-yellow-50'
  return 'border-red-200 bg-red-50'
}

// ─── Diff badge ───────────────────────────────────────────────────────────────

interface DiffInfo { text: string; cls: string }

function diffInfo(planned: number, actual: number): DiffInfo | null {
  if (actual <= 0) return null
  if (planned <= 0) {
    const n = Number.isInteger(actual) ? actual.toFixed(0) : actual.toFixed(1)
    return { text: `+${n}ч вне плана`, cls: 'text-orange-500 text-[10px]' }
  }
  const diff = actual - planned
  const absDiff = Math.abs(diff)
  if (absDiff < 0.05) return { text: '✓', cls: 'text-green-600 font-semibold text-xs' }
  const sign = diff > 0 ? '+' : ''
  const n = Number.isInteger(diff) ? diff.toFixed(0) : diff.toFixed(1)
  const text = `${sign}${n}ч`
  if (absDiff <= 1) return { text, cls: 'text-yellow-600 font-semibold text-xs' }
  return { text, cls: 'text-red-500 font-semibold text-xs' }
}

// ─── Mini timeline bar ────────────────────────────────────────────────────────

function TimelineBar({ planStart, planEnd, actualStart, actualEnd, hasDeviation }: {
  planStart: string; planEnd: string
  actualStart?: string | null; actualEnd?: string | null
  hasDeviation?: boolean
}) {
  const hasPlan = planStart && planEnd
  const hasActual = actualStart && actualEnd

  if (!hasPlan && !hasActual) return null

  const seg = (start: string, end: string): { left: number; width: number } => {
    const sMin = toMin(start)
    let eMin = toMin(end)
    if (eMin <= sMin) eMin += 24 * 60
    const left = (sMin / (24 * 60)) * 100
    const width = ((eMin - sMin) / (24 * 60)) * 100
    return { left: Math.min(left, 98), width: Math.min(width, 100) }
  }

  return (
    <div className="relative h-2 bg-gray-100 rounded-full mt-0.5 overflow-hidden" title="00:00 — 24:00">
      {hasPlan && (() => {
        const { left, width } = seg(planStart, planEnd)
        const color = hasDeviation ? 'bg-orange-400' : 'bg-green-400'
        return (
          <div
            className={`absolute h-full rounded-full ${color}`}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        )
      })()}
      {hasActual && (() => {
        const { left, width } = seg(actualStart!, actualEnd!)
        return (
          <div
            className="absolute h-full rounded-full bg-blue-400 opacity-70"
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        )
      })()}
    </div>
  )
}

// ─── Edits builder ────────────────────────────────────────────────────────────

function editsFromData(data: ScheduleWeek): Edits {
  const result: Edits = {}
  for (const emp of data.employees) {
    for (const day of data.days) {
      const plan = emp.plans[day]
      result[`${emp.employee_id}:${day}`] = {
        start_time: plan?.start_time ?? '',
        end_time: plan?.end_time ?? '',
        break_minutes: plan ? String(plan.break_minutes ?? 0) : '0',
        hours: plan ? String(plan.planned_hours) : '',
        comment: plan?.comment ?? '',
      }
    }
  }
  return result
}

// ── CSV export ────────────────────────────────────────────────────────────────

function csvCell(val: string | number): string {
  if (val === '' || val === null || val === undefined) return ''
  const s = String(val)
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function exportCsv(data: ScheduleWeek, edits: Edits) {
  const header = ['Сотрудник', 'Категория',
    ...data.days.map((d, i) => `${DAYS_RU[i]} ${formatDate(d)}`),
    'Итого план', 'Итого факт',
  ]

  const rows = data.employees.map(emp => {
    let totalPlan = 0, totalActual = 0
    const cells = data.days.map(day => {
      const h = editHours(edits[`${emp.employee_id}:${day}`])
      totalPlan += h
      totalActual += emp.actuals[day]?.approved_hours ?? 0
      const plan = emp.plans[day]
      if (plan?.start_time && plan?.end_time) {
        return `${plan.start_time}—${plan.end_time} (${fmtH(h)})`
      }
      return h > 0 ? h : ''
    })
    return [
      emp.employee_name,
      CAT[emp.category] ?? emp.category,
      ...cells,
      totalPlan > 0 ? Math.round(totalPlan * 10) / 10 : '',
      totalActual > 0 ? Math.round(totalActual * 10) / 10 : '',
    ]
  })

  const csv = [header, ...rows]
    .map(row => row.map(c => csvCell(c as string | number)).join(';'))
    .join('\r\n')

  const blob = new Blob(['﻿' + csv], { type: 'text/csv; charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `график_${data.week_start}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── XLSX export ───────────────────────────────────────────────────────────────

async function exportXlsx(data: ScheduleWeek, edits: Edits) {
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Аппетит'
  wb.created = new Date()

  const ws = wb.addWorksheet('График', {
    views: [{ state: 'frozen', ySplit: 1, xSplit: 0 }],
    properties: { defaultRowHeight: 22 },
  })

  const numDays = data.days.length
  const totalCols = 2 + numDays + 2

  ws.columns = [
    { width: 26 },
    { width: 16 },
    ...data.days.map(() => ({ width: 14 })),
    { width: 12 },
    { width: 12 },
  ]

  const headerValues = [
    'Сотрудник', 'Категория',
    ...data.days.map((d, i) => `${DAYS_RU[i]} ${formatDate(d)}`),
    'Итого план', 'Итого факт',
  ]
  const headerRow = ws.addRow(headerValues)
  headerRow.height = 28
  headerRow.eachCell((cell, colNum) => {
    cell.font = { bold: true, size: 11 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }
    cell.alignment = { vertical: 'middle', horizontal: colNum <= 2 ? 'left' : 'center', wrapText: true }
    cell.border = { bottom: { style: 'medium', color: { argb: 'FF9CA3AF' } } }
  })

  for (const cat of CAT_ORDER) {
    const emps = data.employees.filter(e => e.category === cat)
    if (!emps.length) continue

    const catRow = ws.addRow([CAT[cat] ?? cat])
    catRow.height = 16
    for (let col = 1; col <= totalCols; col++) {
      const cell = catRow.getCell(col)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
      cell.font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }
    }
    catRow.getCell(1).value = (CAT[cat] ?? cat).toUpperCase()
    catRow.getCell(1).font = { bold: true, size: 9, color: { argb: 'FF6B7280' } }

    for (const emp of emps) {
      let totalPlan = 0, totalActual = 0
      const dayValues: (string | null)[] = data.days.map(day => {
        const h = editHours(edits[`${emp.employee_id}:${day}`])
        totalPlan += h
        totalActual += emp.actuals[day]?.approved_hours ?? 0
        const plan = emp.plans[day]
        if (plan?.start_time && plan?.end_time) {
          return `${plan.start_time}–${plan.end_time}\n${fmtH(h)}`
        }
        return h > 0 ? fmtH(h) : null
      })

      const row = ws.addRow([
        emp.employee_name,
        CAT[emp.category] ?? emp.category,
        ...dayValues,
        totalPlan > 0 ? Math.round(totalPlan * 10) / 10 : null,
        totalActual > 0 ? Math.round(totalActual * 10) / 10 : null,
      ])
      row.height = 30

      for (let i = 0; i < numDays; i++) {
        const h = editHours(edits[`${emp.employee_id}:${data.days[i]}`])
        const cell = row.getCell(3 + i)
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        if (h > 0 && h <= 8) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }
        } else if (h > 8 && h <= 12) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
        } else if (h > 12) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
        }
      }

      const planCell = row.getCell(3 + numDays)
      planCell.font = { bold: true }
      planCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
      planCell.alignment = { horizontal: 'center', vertical: 'middle' }

      const actualCell = row.getCell(3 + numDays + 1)
      actualCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } }
      actualCell.alignment = { horizontal: 'center', vertical: 'middle' }

      row.eachCell(cell => {
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } }
      })
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `график_${data.week_start}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Time input component ─────────────────────────────────────────────────────

const timeCls = [
  'w-[72px] text-center text-xs px-1 py-0.5 rounded border border-gray-200',
  'focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand',
  'bg-white font-mono',
].join(' ')

// ─── Main component ───────────────────────────────────────────────────────────

export default function SchedulePage() {
  const [token, setToken] = useState<string | null>(null)
  const [role, setRole] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  const [branches, setBranches] = useState<Branch[]>([])
  const [branchId, setBranchId] = useState<number | null>(null)
  const [weekStart, setWeekStart] = useState(() => getMondayOf(new Date()))
  const [scheduleData, setScheduleData] = useState<ScheduleWeek | null>(null)
  const [edits, setEdits] = useState<Edits>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveMsg, setSaveMsg] = useState('')
  const [dirty, setDirty] = useState(false)
  const [xlsxExporting, setXlsxExporting] = useState(false)

  const canEdit = role === 'manager' || role === 'owner'

  useEffect(() => {
    setToken(localStorage.getItem('token'))
    setRole(localStorage.getItem('role') || '')
  }, [])

  useEffect(() => {
    if (!token) return
    api.getBranches().then(bs => {
      setBranches(bs)
      if (bs.length > 0 && !branchId) setBranchId(bs[0].id)
    }).catch(() => {})
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadSchedule = useCallback(() => {
    if (!token || !branchId) return
    setLoading(true)
    setLoadError('')
    setSaveMsg('')
    api.getScheduleWeek(branchId, weekStart)
      .then(data => {
        setScheduleData(data)
        setEdits(editsFromData(data))
        setDirty(false)
      })
      .catch(e => setLoadError(e.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }, [token, branchId, weekStart])

  useEffect(() => { loadSchedule() }, [loadSchedule])

  const handleLogin = async () => {
    setLoginError('')
    try {
      const res = await api.login(username, password)
      localStorage.setItem('token', res.access_token)
      localStorage.setItem('role', res.role)
      setToken(res.access_token)
      setRole(res.role)
    } catch (e: any) {
      setLoginError(e.message || 'Ошибка входа')
    }
  }

  const handleCellChange = (
    employeeId: number, day: string,
    field: keyof EditEntry,
    value: string,
  ) => {
    const key = `${employeeId}:${day}`
    setEdits(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
    setDirty(true)
    setSaveMsg('')
  }

  const handleSave = async () => {
    if (!scheduleData || !branchId) return
    setSaving(true)
    setSaveMsg('')
    try {
      const entries = scheduleData.employees.flatMap(emp =>
        scheduleData.days.map(day => {
          const val = edits[`${emp.employee_id}:${day}`]
          const hours = editHours(val)
          return {
            employee_id: emp.employee_id,
            date: day,
            planned_hours: hours,
            start_time: val?.start_time || undefined,
            end_time: val?.end_time || undefined,
            break_minutes: parseInt(val?.break_minutes || '0') || 0,
            comment: val?.comment ?? '',
          }
        })
      )
      const res = await api.saveSchedule(branchId, entries)
      setSaveMsg(`Сохранено: ${res.saved}, удалено: ${res.deleted}`)
      setDirty(false)
      loadSchedule()
    } catch (e: any) {
      setSaveMsg(`Ошибка: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleExportXlsx = async () => {
    if (!scheduleData) return
    setXlsxExporting(true)
    try { await exportXlsx(scheduleData, edits) }
    catch (e: any) { alert('Ошибка генерации XLSX: ' + (e.message || '')) }
    finally { setXlsxExporting(false) }
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    setToken(null)
    setRole('')
    setScheduleData(null)
  }

  // ── Login screen ──────────────────────────────────────────────────────────

  if (!token) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-6">
        <h1 className="text-2xl font-bold text-brand">График смен</h1>
        <div className="w-full max-w-xs flex flex-col gap-3">
          <input className="border rounded-xl px-4 py-3" placeholder="Логин"
            value={username} onChange={e => setUsername(e.target.value)} />
          <input type="password" className="border rounded-xl px-4 py-3" placeholder="Пароль"
            value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          {loginError && <p className="text-red-500 text-sm">{loginError}</p>}
          <button onClick={handleLogin}
            className="bg-brand text-white py-3 rounded-xl font-semibold hover:bg-red-700">
            Войти
          </button>
          <p className="text-xs text-gray-400 text-center">manager1 / manager123</p>
        </div>
      </main>
    )
  }

  const grouped: Record<string, EmployeeRow[]> = {}
  if (scheduleData) {
    for (const emp of scheduleData.employees) {
      if (!grouped[emp.category]) grouped[emp.category] = []
      grouped[emp.category].push(emp)
    }
  }
  const days = scheduleData?.days ?? []

  // ── Main page ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toolbar */}
      <div className="bg-white border-b shadow-sm px-4 py-3 sticky top-0 z-20">
        <div className="max-w-screen-xl mx-auto flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold text-brand mr-2">📅 График смен</h1>

          <select value={branchId ?? ''} onChange={e => setBranchId(Number(e.target.value))}
            className="border rounded-lg px-3 py-1.5 text-sm bg-white">
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          <div className="flex items-center gap-1">
            <button onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="px-2 py-1 rounded-lg border hover:bg-gray-100 text-sm font-medium">←</button>
            <span className="px-3 py-1 text-sm font-medium text-gray-700 min-w-[160px] text-center">
              {scheduleData
                ? `${formatDate(scheduleData.week_start)} — ${formatDate(scheduleData.week_end)}`
                : weekStart}
            </span>
            <button onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="px-2 py-1 rounded-lg border hover:bg-gray-100 text-sm font-medium">→</button>
            <button onClick={() => setWeekStart(getMondayOf(new Date()))}
              className="ml-1 px-2 py-1 rounded-lg border hover:bg-gray-100 text-xs text-gray-500">
              Сегодня
            </button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              canEdit ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {canEdit ? '✏️ Редактирование' : '👁 Просмотр'}
            </span>

            {scheduleData && (
              <>
                <button onClick={() => exportCsv(scheduleData, edits)}
                  title="Разделитель ; для Excel/WPS"
                  className="px-3 py-1.5 rounded-lg border text-sm hover:bg-gray-100 text-gray-600">
                  ↓ CSV
                </button>
                <button onClick={handleExportXlsx} disabled={xlsxExporting}
                  className="px-3 py-1.5 rounded-lg border text-sm hover:bg-green-50 text-green-700 border-green-200 disabled:opacity-50">
                  {xlsxExporting ? '...' : '↓ Excel'}
                </button>
              </>
            )}

            {canEdit && (
              <button onClick={handleSave} disabled={saving || !dirty || !scheduleData}
                className="px-4 py-1.5 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
                {saving ? 'Сохраняю...' : 'Сохранить'}
              </button>
            )}

            <button onClick={handleLogout} className="text-xs text-gray-400 hover:text-gray-600 ml-1">
              Выйти
            </button>
          </div>
        </div>

        {saveMsg && (
          <div className={`max-w-screen-xl mx-auto mt-1 text-xs ${
            saveMsg.startsWith('Ошибка') ? 'text-red-500' : 'text-green-600'
          }`}>{saveMsg}</div>
        )}
      </div>

      {/* Body */}
      <div className="max-w-screen-xl mx-auto p-4">
        {loading && <div className="text-center text-gray-400 py-16">Загрузка...</div>}
        {loadError && <div className="text-center text-red-500 py-8">{loadError}</div>}

        {scheduleData && !loading && (
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm bg-white">
            <table className="w-full border-collapse text-sm">

              {/* Header */}
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-600 min-w-[180px] sticky left-0 bg-gray-50 z-10">
                    Сотрудник
                  </th>
                  {days.map((day, i) => (
                    <th key={day} className={`px-2 py-3 text-center font-semibold min-w-[130px] ${
                      i >= 5 ? 'text-orange-600' : 'text-gray-600'
                    }`}>
                      <div>{DAYS_RU[i]}</div>
                      <div className="text-xs font-normal text-gray-400">{formatDate(day)}</div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center font-semibold text-gray-500 min-w-[80px]">
                    Итого, ч
                  </th>
                  <th className="px-3 py-3 text-center font-semibold text-gray-500 min-w-[90px]">
                    ФОТ, ₽
                  </th>
                </tr>
              </thead>

              <tbody>
                {CAT_ORDER.filter(cat => grouped[cat]?.length > 0).flatMap(cat => [
                  /* Category header */
                  <tr key={`cat-${cat}`} className="bg-gray-50 border-b border-t border-gray-200">
                    <td colSpan={days.length + 3}
                      className="px-4 py-1.5 text-xs font-bold text-gray-500 uppercase tracking-widest sticky left-0 bg-gray-50">
                      {CAT[cat]}
                    </td>
                  </tr>,

                  /* Employee rows */
                  ...(grouped[cat] ?? []).map(emp => {
                    let totalPlanned = 0
                    let totalActual = 0
                    for (const day of days) {
                      totalPlanned += editHours(edits[`${emp.employee_id}:${day}`])
                      totalActual += emp.actuals[day]?.approved_hours ?? 0
                    }

                    return (
                      <tr key={emp.employee_id} className="border-b border-gray-100 hover:bg-orange-50/30">

                        {/* Name */}
                        <td className="px-4 py-2 sticky left-0 bg-white hover:bg-orange-50/30 z-10">
                          <div className="font-medium text-gray-800 text-sm leading-tight">
                            {emp.employee_name}
                          </div>
                          <div className="text-xs text-gray-400">
                            {emp.payment_type === 'fixed_daily'
                              ? `Фикс ${fmt(emp.fixed_daily_rate ?? emp.rate)} ₽/день`
                              : `${fmt(emp.rate)} ₽/ч`}
                          </div>
                        </td>

                        {/* Day cells */}
                        {days.map((day, i) => {
                          const key = `${emp.employee_id}:${day}`
                          const val = edits[key] ?? { start_time: '', end_time: '', break_minutes: '0', hours: '', comment: '' }
                          const actual = emp.actuals[day]
                          const hours = editHours(val)
                          const hasActualTimes = !!(actual?.first_opened && actual?.last_closed)
                          const di = diffInfo(hours, actual?.approved_hours ?? 0)
                          const hasDeviation = !!di && di.cls.includes('red')

                          return (
                            <td key={day} className={`px-1.5 py-1.5 ${i >= 5 ? 'bg-orange-50/20' : ''}`}>
                              <div className={`rounded-lg border p-1.5 flex flex-col gap-0.5 ${cellCls(hours)}`}>

                                {canEdit ? (
                                  /* Edit mode: time pickers */
                                  <div className="flex flex-col gap-0.5">
                                    <div className="flex items-center gap-0.5">
                                      <input
                                        type="time"
                                        value={val.start_time}
                                        onChange={e => handleCellChange(emp.employee_id, day, 'start_time', e.target.value)}
                                        className={timeCls}
                                      />
                                      <span className="text-gray-300 text-xs">—</span>
                                      <input
                                        type="time"
                                        value={val.end_time}
                                        onChange={e => handleCellChange(emp.employee_id, day, 'end_time', e.target.value)}
                                        className={timeCls}
                                      />
                                    </div>
                                    <div className="text-center text-xs text-gray-500 font-medium leading-tight">
                                      {hours > 0 ? fmtH(hours) : <span className="text-gray-300">—</span>}
                                    </div>
                                  </div>
                                ) : (
                                  /* View mode */
                                  <div className="text-center">
                                    {val.start_time && val.end_time ? (
                                      <>
                                        <div className="text-xs font-mono text-gray-700 leading-tight">
                                          {val.start_time}—{val.end_time}
                                        </div>
                                        <div className="text-xs text-gray-500 font-medium">{fmtH(hours)}</div>
                                      </>
                                    ) : hours > 0 ? (
                                      <div className="text-sm font-semibold text-gray-700">{fmtH(hours)}</div>
                                    ) : (
                                      <span className="text-gray-300 text-xs">—</span>
                                    )}
                                  </div>
                                )}

                                {/* Mini timeline bar: plan (green) + actual (blue) */}
                                <TimelineBar
                                  planStart={val.start_time}
                                  planEnd={val.end_time}
                                  actualStart={actual?.first_opened}
                                  actualEnd={actual?.last_closed}
                                  hasDeviation={hasDeviation}
                                />

                                {/* Actual hours */}
                                {actual && (
                                  <div className="text-center text-[10px] text-blue-500 leading-tight">
                                    ф: {actual.approved_hours}ч
                                    {hasActualTimes && (
                                      <span className="text-blue-300 ml-1 font-mono">
                                        {actual.first_opened}—{actual.last_closed}
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Diff badge */}
                                {di && (
                                  <div className={`text-center leading-tight ${di.cls}`}>{di.text}</div>
                                )}
                              </div>
                            </td>
                          )
                        })}

                        {/* Totals — hours */}
                        <td className="px-2 py-2 text-center align-top">
                          <div className="text-sm font-semibold text-gray-700">
                            {totalPlanned > 0 ? fmtH(Math.round(totalPlanned * 10) / 10) : '—'}
                          </div>
                          {totalActual > 0 && (
                            <div className="text-xs text-blue-500">
                              ф: {fmtH(Math.round(totalActual * 10) / 10)}
                            </div>
                          )}
                          {(() => {
                            if (totalActual <= 0 || totalPlanned <= 0) return null
                            const di = diffInfo(Math.round(totalPlanned * 10) / 10, Math.round(totalActual * 10) / 10)
                            return di ? <div className={`leading-tight ${di.cls}`}>{di.text}</div> : null
                          })()}
                        </td>

                        {/* Totals — FOT */}
                        <td className="px-2 py-2 text-center align-top">
                          {(() => {
                            const planPay = calcEmpPlannedPay(emp, days, edits)
                            const actualPay = calcEmpActualPay(emp, days)
                            const diff = actualPay - planPay
                            return (
                              <>
                                {planPay > 0 && (
                                  <div className="text-xs font-semibold text-brand">{fmt(planPay)}</div>
                                )}
                                {actualPay > 0 && (
                                  <div className="text-xs text-blue-500">ф: {fmt(actualPay)}</div>
                                )}
                                {planPay > 0 && actualPay > 0 && (
                                  <div className={`text-xs ${
                                    Math.abs(diff) < 1 ? 'text-green-600' :
                                    Math.abs(diff) <= planPay * 0.05 ? 'text-yellow-600' : 'text-red-500'
                                  }`}>
                                    {diff >= 0 ? '+' : ''}{fmt(diff)}
                                  </div>
                                )}
                              </>
                            )
                          })()}
                        </td>
                      </tr>
                    )
                  }),
                ])}

                {/* Summary rows */}
                {scheduleData.employees.length > 0 && (() => {
                  const dayActualHours = (day: string) =>
                    scheduleData.employees.reduce((s, e) => s + (e.actuals[day]?.approved_hours ?? 0), 0)
                  const dayPlannedHours = (day: string) =>
                    scheduleData.employees.reduce((s, e) => s + editHours(edits[`${e.employee_id}:${day}`]), 0)

                  const totalPlanFot = days.reduce((s, d) => s + calcDayFot(scheduleData.employees, d, edits), 0)
                  const totalActualFot = scheduleData.employees.reduce((s, e) => s + calcEmpActualPay(e, days), 0)
                  const totalPlanHours = days.reduce((s, d) => s + dayPlannedHours(d), 0)
                  const totalActualHours = days.reduce((s, d) => s + dayActualHours(d), 0)
                  const totalDeviation = Math.round((totalActualHours - totalPlanHours) * 10) / 10

                  const devCls = (diff: number) =>
                    Math.abs(diff) < 0.05 ? 'text-green-600' :
                    Math.abs(diff) <= 1 ? 'text-yellow-600' : 'text-red-500'

                  return (
                    <>
                      <tr className="border-t-2 border-gray-300 bg-orange-50">
                        <td className="px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wide sticky left-0 bg-orange-50">
                          ФОТ (план), ₽
                        </td>
                        {days.map((day, i) => {
                          const fot = calcDayFot(scheduleData.employees, day, edits)
                          return (
                            <td key={day} className={`px-2 py-2 text-center text-xs font-semibold ${
                              fot > 0 ? 'text-brand' : 'text-gray-300'
                            } ${i >= 5 ? 'bg-orange-100/60' : ''}`}>
                              {fot > 0 ? fmt(fot) : '—'}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-center text-xs font-bold text-brand">
                          {totalPlanHours > 0 ? fmt(totalPlanFot) : '—'}
                        </td>
                        <td className="px-3 py-2 text-center text-xs text-gray-400">—</td>
                      </tr>

                      <tr className="bg-blue-50/40">
                        <td className="px-4 py-2 text-xs font-bold text-gray-600 uppercase tracking-wide sticky left-0 bg-blue-50/40">
                          ФОТ (факт), ₽
                        </td>
                        {days.map((day, i) => {
                          const fot = calcDayActualFot(scheduleData.employees, day)
                          return (
                            <td key={day} className={`px-2 py-2 text-center text-xs font-semibold ${
                              fot > 0 ? 'text-blue-700' : 'text-gray-300'
                            } ${i >= 5 ? 'bg-blue-100/30' : ''}`}>
                              {fot > 0 ? fmt(fot) : '—'}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-center text-xs text-gray-400">—</td>
                        <td className="px-3 py-2 text-center text-xs font-bold text-gray-700">
                          {totalActualFot > 0 ? fmt(totalActualFot) : '—'}
                        </td>
                      </tr>

                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td className="px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wide sticky left-0 bg-gray-50">
                          Откл. план/факт
                        </td>
                        {days.map((day, i) => {
                          const planned = dayPlannedHours(day)
                          const actual = dayActualHours(day)
                          const diff = Math.round((actual - planned) * 10) / 10
                          const hasBoth = planned > 0 && actual > 0
                          return (
                            <td key={day} className={`px-2 py-2 text-center text-xs ${i >= 5 ? 'bg-gray-100/50' : ''}`}>
                              {hasBoth ? (
                                <span className={`font-semibold ${devCls(diff)}`}>
                                  {diff >= 0 ? '+' : ''}{diff}ч
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-center text-xs font-semibold">
                          {totalPlanHours > 0 && totalActualHours > 0 ? (
                            <span className={devCls(totalDeviation)}>
                              {totalDeviation >= 0 ? '+' : ''}{totalDeviation}ч
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-center text-xs font-semibold">
                          {totalPlanFot > 0 && totalActualFot > 0 ? (
                            <span className={devCls(totalActualFot - totalPlanFot)}>
                              {totalActualFot >= totalPlanFot ? '+' : ''}{fmt(totalActualFot - totalPlanFot)}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    </>
                  )
                })()}
              </tbody>
            </table>

            {scheduleData.employees.length === 0 && (
              <div className="text-center text-gray-400 py-12">
                Нет активных сотрудников в этом филиале
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        {scheduleData && (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-2 rounded bg-green-400" />
              <span>план (таймлайн)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-2 rounded bg-blue-400 opacity-70" />
              <span>факт (таймлайн)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded border border-green-200 bg-green-50" />
              <span>1–8 ч (норма)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded border border-yellow-200 bg-yellow-50" />
              <span>8–12 ч (длинная смена)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded border border-red-200 bg-red-50" />
              <span>&gt;12 ч (переработка)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-blue-500 font-medium">ф:</span>
              <span>факт из закрытых смен</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-green-600 font-semibold">✓</span>
              <span>совпадает с планом</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-orange-500 font-medium">+Xч вне плана</span>
              <span>факт есть, плана нет</span>
            </div>
          </div>
        )}

        {/* Debug panel — TEST MODE only */}
        {IS_TEST_MODE && scheduleData && (
          <div className="mt-6 rounded-xl border border-yellow-300 bg-yellow-50 p-4">
            <h2 className="text-sm font-bold text-yellow-800 mb-3">
              🔧 DEBUG: Сырые данные смен (TEST MODE)
            </h2>
            <p className="text-xs text-yellow-700 mb-3">
              Источник: <code>shifts</code> где <code>closed_at IS NOT NULL AND total_minutes &gt; 0</code>.
              Оплата: <code>total_minutes / 60 × rate</code>.
            </p>
            {scheduleData.employees.map(emp => {
              if (!emp.debug_shifts || emp.debug_shifts.length === 0) return null
              return (
                <details key={emp.employee_id} className="mb-3">
                  <summary className="cursor-pointer text-xs font-semibold text-yellow-900 py-1">
                    {emp.employee_name} — {emp.debug_shifts.length} смен(а)&nbsp;·&nbsp;
                    {emp.payment_type === 'fixed_daily'
                      ? `фикс ${fmt(emp.fixed_daily_rate ?? emp.rate)} ₽/день`
                      : `${fmt(emp.rate)} ₽/ч`}
                  </summary>
                  <table className="mt-1 w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-yellow-100">
                        <th className="text-left px-2 py-1 border border-yellow-200">ID</th>
                        <th className="text-left px-2 py-1 border border-yellow-200">Дата</th>
                        <th className="text-left px-2 py-1 border border-yellow-200">Открыт</th>
                        <th className="text-left px-2 py-1 border border-yellow-200">Закрыт</th>
                        <th className="text-right px-2 py-1 border border-yellow-200">total_min</th>
                        <th className="text-right px-2 py-1 border border-yellow-200">computed_h</th>
                        <th className="text-right px-2 py-1 border border-yellow-200">Оплата</th>
                      </tr>
                    </thead>
                    <tbody>
                      {emp.debug_shifts.map(s => {
                        const pay = dayPay(emp, s.computed_hours)
                        return (
                          <tr key={s.id} className="odd:bg-white even:bg-yellow-50">
                            <td className="px-2 py-0.5 border border-yellow-200 text-gray-500">{s.id}</td>
                            <td className="px-2 py-0.5 border border-yellow-200">{s.date}</td>
                            <td className="px-2 py-0.5 border border-yellow-200 text-gray-500 font-mono text-[10px]">
                              {s.opened_at ? s.opened_at.replace('T', ' ').slice(0, 16) : '—'}
                            </td>
                            <td className="px-2 py-0.5 border border-yellow-200 text-gray-500 font-mono text-[10px]">
                              {s.closed_at ? s.closed_at.replace('T', ' ').slice(0, 16) : '—'}
                            </td>
                            <td className="px-2 py-0.5 border border-yellow-200 text-right">{s.total_minutes ?? '—'}</td>
                            <td className="px-2 py-0.5 border border-yellow-200 text-right font-semibold">{s.computed_hours}</td>
                            <td className="px-2 py-0.5 border border-yellow-200 text-right text-blue-700 font-semibold">{fmt(pay)} ₽</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-yellow-100 font-semibold">
                        <td colSpan={5} className="px-2 py-1 border border-yellow-200 text-right">Итого:</td>
                        <td className="px-2 py-1 border border-yellow-200 text-right">
                          {emp.debug_shifts.reduce((s, x) => s + x.computed_hours, 0).toFixed(2)}ч
                        </td>
                        <td className="px-2 py-1 border border-yellow-200 text-right text-blue-700">
                          {fmt(calcEmpActualPay(emp, scheduleData.days))} ₽
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </details>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
