'use client'
import { useState, useEffect } from 'react'
import { api } from '@/lib/api'

const MONTHS = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
]
const CAT_RU: Record<string, string> = {
  kitchen: 'Кухня', admin: 'Администрация', tech: 'Техперсонал',
  courier: 'Курьеры', reserve: 'Резерв',
}
const PAY_RU: Record<string, string> = { hourly: 'Почасовая', fixed_daily: 'Фикс/день' }

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return n.toLocaleString('ru-RU')
}
function fmtDT(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

type Profile = { id: number; full_name: string; position: string; category: string; payment_type: string; branch: string; is_cashier: boolean; rate: number | null; fixed_daily_rate: number | null; rate_since: string | null }
type PayrollData = { year: number; month: number; days_worked: number; total_hours: number; total_pay: number; projected_pay: number | null; days_elapsed: number; days_in_month: number; entries: Array<{ date: string; hours: number; base_pay: number; bonus: number; total_pay: number; is_corrected: boolean }> }
type ShiftsData = { year: number; month: number; shifts: Array<{ id: number; date: string; status: string; is_extra_shift: boolean; opened_at: string | null; closed_at: string | null; hours: number | null; total_pay: number | null; is_corrected: boolean; anomaly_flag: string | null; note: string | null }> }
type ScheduleData = { week_start: string; week_end: string; days: Array<{ date: string; weekday: string; is_today: boolean; is_past: boolean; plan_hours: number | null; plan_start: string | null; plan_end: string | null; actual_hours: number | null; has_open_shift: boolean; shifts_count: number }> }

type Tab = 'main' | 'shifts' | 'schedule'

export default function EmployeePage() {
  const [empToken, setEmpToken] = useState<string | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    const t = localStorage.getItem('emp_token')
    if (t) { setEmpToken(t); loadProfile(t) }
  }, [])

  const [login, setLogin] = useState('')
  const [pin, setPin] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [tab, setTab] = useState<Tab>('main')
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [payroll, setPayroll] = useState<PayrollData | null>(null)
  const [shiftsData, setShiftsData] = useState<ShiftsData | null>(null)
  const [schedule, setSchedule] = useState<ScheduleData | null>(null)
  const [dataLoading, setDataLoading] = useState(false)

  async function loadProfile(token: string) {
    try {
      const p = await api.employeeProfile(token)
      setProfile(p)
    } catch { logout() }
  }

  async function handleLogin() {
    setLoginError('')
    setLoginLoading(true)
    try {
      const res = await api.employeeLogin(login, pin)
      localStorage.setItem('emp_token', res.access_token)
      setEmpToken(res.access_token)
      setProfile({
        id: res.employee_id, full_name: res.full_name,
        position: res.position, category: '', payment_type: res.payment_type || '',
        branch: res.branch, is_cashier: false,
        rate: res.rate, fixed_daily_rate: null, rate_since: null,
      })
      await loadProfile(res.access_token)
    } catch (e: any) { setLoginError(e.message) }
    finally { setLoginLoading(false) }
  }

  function logout() {
    localStorage.removeItem('emp_token')
    setEmpToken(null); setProfile(null)
    setPayroll(null); setShiftsData(null); setSchedule(null)
  }

  async function loadPayroll(t = empToken) {
    if (!t) return
    setDataLoading(true)
    try { setPayroll(await api.employeePayroll(t, year, month)) }
    catch {} finally { setDataLoading(false) }
  }

  async function loadShifts(t = empToken) {
    if (!t) return
    setDataLoading(true)
    try { setShiftsData(await api.employeeShifts(t, year, month)) }
    catch {} finally { setDataLoading(false) }
  }

  async function loadSchedule(t = empToken) {
    if (!t) return
    setDataLoading(true)
    try { setSchedule(await api.employeeSchedule(t)) }
    catch {} finally { setDataLoading(false) }
  }

  useEffect(() => {
    if (!empToken) return
    if (tab === 'main') loadPayroll()
    if (tab === 'shifts') loadShifts()
    if (tab === 'schedule') loadSchedule()
  }, [empToken, tab, year, month]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Вход ─────────────────────────────────────────────────────────────────
  if (!empToken || !profile) return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 gap-5">
      <div className="text-center">
        <div className="text-4xl mb-2">👤</div>
        <h1 className="text-2xl font-bold text-brand">Кабинет сотрудника</h1>
        <p className="text-sm text-gray-400 mt-1">Аппетит — личный кабинет</p>
      </div>

      <div className="w-full max-w-xs bg-white rounded-2xl shadow-md p-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600 font-medium">Логин</span>
          <input
            className="border rounded-xl px-4 py-3 text-base focus:border-brand outline-none"
            placeholder="Ваш логин (задаёт бухгалтер)"
            value={login} onChange={e => setLogin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600 font-medium">PIN-код</span>
          <input
            type="password"
            className="border rounded-xl px-4 py-3 text-base focus:border-brand outline-none tracking-widest"
            placeholder="••••"
            value={pin} onChange={e => setPin(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            maxLength={6}
          />
        </label>
        {loginError && (
          <p className="text-red-500 text-sm text-center">{loginError}</p>
        )}
        <button onClick={handleLogin} disabled={loginLoading || !login || !pin}
          className="bg-brand text-white py-3 rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
          {loginLoading ? 'Вход...' : 'Войти'}
        </button>
        <p className="text-xs text-gray-400 text-center">
          Логин и первоначальный PIN выдаёт бухгалтер
        </p>
      </div>
    </main>
  )

  // ── Главный экран ─────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-50 pb-8">
      {/* Шапка */}
      <header className="bg-white border-b shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="font-bold text-gray-800">{profile.full_name}</p>
          <p className="text-xs text-gray-400">{profile.position} · {profile.branch}</p>
        </div>
        <button onClick={logout} className="text-sm text-gray-400 hover:text-gray-600">Выйти</button>
      </header>

      {/* Карточка сотрудника */}
      <div className="mx-4 mt-4 bg-brand rounded-2xl text-white p-5">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-sm opacity-80">{profile.branch}</p>
            <p className="text-xl font-bold mt-0.5">{profile.full_name}</p>
            <p className="text-sm opacity-90 mt-0.5">{profile.position}</p>
          </div>
          <div className="text-right">
            {profile.rate != null && (
              <p className="text-lg font-bold">
                {fmt(profile.rate)} ₽{profile.payment_type === 'fixed_daily' ? '/д' : '/ч'}
              </p>
            )}
            <p className="text-xs opacity-70 mt-0.5">{PAY_RU[profile.payment_type] ?? ''}</p>
            {profile.is_cashier && (
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full mt-1 inline-block">Кассир</span>
            )}
          </div>
        </div>
        {profile.rate_since && (
          <p className="text-xs opacity-60 mt-3">Ставка с {profile.rate_since}</p>
        )}
      </div>

      {/* Табы */}
      <div className="flex mx-4 mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
        {[
          { key: 'main', label: '💰 Начисления' },
          { key: 'shifts', label: '🕐 Смены' },
          { key: 'schedule', label: '📅 График' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as Tab)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-brand text-white' : 'text-gray-500 hover:bg-gray-50'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Выбор месяца (для начислений и смен) */}
      {(tab === 'main' || tab === 'shifts') && (
        <div className="flex items-center gap-2 mx-4 mt-3 justify-center">
          <button onClick={() => {
            if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1)
          }} className="w-8 h-8 flex items-center justify-center rounded-full bg-white border hover:bg-gray-50">‹</button>
          <span className="text-sm font-semibold text-gray-700 min-w-[120px] text-center">
            {MONTHS[month - 1]} {year}
          </span>
          <button onClick={() => {
            if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1)
          }} className="w-8 h-8 flex items-center justify-center rounded-full bg-white border hover:bg-gray-50">›</button>
        </div>
      )}

      <div className="mx-4 mt-3">
        {dataLoading && <p className="text-center text-gray-400 py-8">Загрузка...</p>}

        {/* ── Начисления ── */}
        {tab === 'main' && !dataLoading && payroll && (
          <div className="space-y-3">
            {/* Сводка */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <p className="text-xs text-gray-400">Начислено</p>
                <p className="text-2xl font-bold text-brand mt-0.5">{fmt(Math.round(payroll.total_pay))} ₽</p>
                <p className="text-xs text-gray-400 mt-1">{payroll.days_worked} смен · {payroll.total_hours.toFixed(1)} ч</p>
              </div>
              {payroll.projected_pay != null && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-400">Прогноз за месяц</p>
                  <p className="text-2xl font-bold text-gray-700 mt-0.5">{fmt(Math.round(payroll.projected_pay))} ₽</p>
                  <p className="text-xs text-gray-400 mt-1">{payroll.days_elapsed} из {payroll.days_in_month} дн.</p>
                </div>
              )}
            </div>

            {/* Прогресс-бар */}
            {payroll.projected_pay != null && payroll.projected_pay > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex justify-between text-xs text-gray-500 mb-2">
                  <span>Выполнено за месяц</span>
                  <span className="font-semibold">{Math.round(payroll.days_elapsed / payroll.days_in_month * 100)}% дней</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div className="h-2.5 bg-brand rounded-full"
                    style={{ width: `${Math.min(100, Math.round(payroll.total_pay / payroll.projected_pay * 100 * (payroll.days_in_month / payroll.days_elapsed)))}%` }} />
                </div>
              </div>
            )}

            {/* По дням */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <p className="px-4 py-2.5 text-xs font-semibold text-gray-500 border-b bg-gray-50 uppercase tracking-wide">
                По дням
              </p>
              {payroll.entries.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-6">Нет начислений</p>
              )}
              {payroll.entries.map(e => (
                <div key={e.date} className="flex items-center justify-between px-4 py-3 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{e.date}</p>
                    <p className="text-xs text-gray-400">{e.hours} ч{e.bonus > 0 ? ` · бонус ${fmt(Math.round(e.bonus))} ₽` : ''}{e.is_corrected ? ' · ✏️' : ''}</p>
                  </div>
                  <p className="font-semibold text-gray-800">{fmt(Math.round(e.total_pay))} ₽</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Смены ── */}
        {tab === 'shifts' && !dataLoading && shiftsData && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {shiftsData.shifts.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-6">Нет смен за этот месяц</p>
            )}
            {shiftsData.shifts.map(s => {
              const isOpen = s.status === 'open'
              return (
                <div key={s.id}
                  className={`flex items-start justify-between px-4 py-3 border-b last:border-0 ${isOpen ? 'bg-orange-50' : ''}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{s.date}</p>
                      {isOpen && <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">открыта</span>}
                      {s.is_extra_shift && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">доп.</span>}
                      {s.is_corrected && <span className="text-xs text-yellow-500">✏️</span>}
                      {s.anomaly_flag && <span className="text-xs text-red-500">⚠️</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {fmtDT(s.opened_at)} – {fmtDT(s.closed_at)}
                      {s.hours != null && <span className="ml-1 font-medium">{s.hours} ч</span>}
                    </p>
                    {s.note && <p className="text-xs text-gray-400 italic mt-0.5">{s.note}</p>}
                  </div>
                  <div className="text-right ml-3">
                    {s.total_pay != null
                      ? <p className="font-semibold text-gray-800">{fmt(Math.round(s.total_pay))} ₽</p>
                      : <p className="text-gray-300 text-sm">—</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── График ── */}
        {tab === 'schedule' && !dataLoading && schedule && (
          <div className="space-y-2">
            <p className="text-xs text-gray-400 text-center">
              {schedule.week_start} – {schedule.week_end}
            </p>
            {schedule.days.map(day => {
              const hasAnything = day.plan_hours != null || day.actual_hours != null
              return (
                <div key={day.date}
                  className={`bg-white rounded-xl border overflow-hidden ${
                    day.is_today ? 'border-brand shadow-sm' : day.has_open_shift ? 'border-orange-300' : 'border-gray-200'
                  }`}>
                  <div className="flex items-center px-4 py-3 gap-3">
                    <div className={`text-center min-w-[36px] ${day.is_today ? 'text-brand font-bold' : 'text-gray-400'}`}>
                      <p className="text-xs">{day.weekday}</p>
                      <p className="text-lg font-bold leading-none">{new Date(day.date + 'T12:00').getDate()}</p>
                    </div>

                    <div className="flex-1">
                      {day.plan_hours != null && (
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <span className="text-xs text-gray-400">План:</span>
                          {day.plan_start && day.plan_end
                            ? <span>{day.plan_start.slice(0,5)} – {day.plan_end.slice(0,5)}</span>
                            : <span>{day.plan_hours} ч</span>}
                        </div>
                      )}
                      {day.actual_hours != null && (
                        <div className="flex items-center gap-1 text-sm">
                          <span className="text-xs text-gray-400">Факт:</span>
                          <span className={`font-medium ${day.has_open_shift ? 'text-orange-600' : 'text-gray-700'}`}>
                            {day.actual_hours} ч {day.has_open_shift ? '(открыта)' : ''}
                          </span>
                        </div>
                      )}
                      {!hasAnything && (
                        <p className="text-sm text-gray-300">Выходной</p>
                      )}
                    </div>

                    {/* Индикатор план/факт */}
                    {day.plan_hours != null && day.actual_hours != null && (
                      <div className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                        day.actual_hours >= day.plan_hours * 0.95
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {day.actual_hours >= day.plan_hours * 0.95 ? '✓' : `−${(day.plan_hours - day.actual_hours).toFixed(1)}ч`}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Неделя вперёд / назад */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={async () => {
                  const d = new Date(schedule.week_start)
                  d.setDate(d.getDate() - 7)
                  const newStart = d.toISOString().slice(0, 10)
                  if (!empToken) return
                  setDataLoading(true)
                  try { setSchedule(await api.employeeSchedule(empToken, newStart)) }
                  catch {} finally { setDataLoading(false) }
                }}
                className="flex-1 py-2 border rounded-xl text-sm text-gray-500 hover:bg-gray-50">
                ‹ Предыдущая
              </button>
              <button
                onClick={async () => {
                  const d = new Date(schedule.week_end)
                  d.setDate(d.getDate() + 1)
                  const newStart = d.toISOString().slice(0, 10)
                  if (!empToken) return
                  setDataLoading(true)
                  try { setSchedule(await api.employeeSchedule(empToken, newStart)) }
                  catch {} finally { setDataLoading(false) }
                }}
                className="flex-1 py-2 border rounded-xl text-sm text-gray-500 hover:bg-gray-50">
                Следующая ›
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
