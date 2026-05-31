'use client'
import { useState, useEffect } from 'react'
import PinPad from '@/components/PinPad'
import { api } from '@/lib/api'

// Тестовый режим: только development + только Челябинск (branch_id=1)
const IS_TEST_MODE = process.env.NEXT_PUBLIC_TEST_MODE === 'true'
// LIVE_TEST_MODE: реальное время, тестовый UI скрыт
const IS_LIVE_TEST = process.env.NEXT_PUBLIC_LIVE_TEST_MODE === 'true'
const TEST_BRANCH_ID = 1

// Временная зона Екатеринбурга / Челябинска (UTC+5)
const TZ = 'Asia/Yekaterinburg'

type Mode = 'select_branch' | 'enter_pin' | 'status_card' | 'close_form' | 'success'

interface Branch { id: number; name: string }
interface CashierStatus {
  employee_id: number
  employee_name: string
  has_open_shift: boolean
  opened_at: string | null
  hours_so_far: number | null
}
interface CloseForm { revenue: string; orders: string; takeaway: string; comment: string }

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
  } catch { return '' }
}

export default function CashierPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [branch, setBranch] = useState<Branch | null>(null)
  const [mode, setMode] = useState<Mode>('select_branch')
  const [cashierStatus, setCashierStatus] = useState<CashierStatus | null>(null)
  const [currentPin, setCurrentPin] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [form, setForm] = useState<CloseForm>({ revenue: '', orders: '', takeaway: '', comment: '' })
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Тестовый режим: дата закрытия
  const [testDate, setTestDate] = useState(todayStr)
  const [resetting, setResetting] = useState(false)

  // Тестовый UI активен только если IS_TEST_MODE=true И IS_LIVE_TEST=false
  const isTestActive = IS_TEST_MODE && !IS_LIVE_TEST && branch?.id === TEST_BRANCH_ID
  const closeDate = isTestActive ? testDate : todayStr()

  useEffect(() => {
    api.getBranches().then(setBranches).catch(() => {})
  }, [])

  const handlePinSubmit = async (pin: string) => {
    const status = await api.cashierCheckPin(pin, branch!.id)
    setCurrentPin(pin)
    setCashierStatus(status)
    setActionError('')
    setMode('status_card')
  }

  const handleOpenShift = async () => {
    if (!branch) return
    setLoading(true)
    setActionError('')
    try {
      const res = await api.openShift(currentPin, branch.id)
      setSuccessMsg(`${res.employee_name}, ваша смена открыта. Хорошей работы!`)
      setMode('success')
    } catch (e: any) {
      const msg = e.message || 'Ошибка'
      if (msg === 'already_had_shift') {
        setActionError(
          'Смена уже была сегодня.\nМожно сразу закрывать день — нажмите «Закрыть смену и день» ниже.\nЕсли нужна ещё одна смена — используйте «Открыть доп. смену».'
        )
      } else {
        setActionError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCloseDay = async () => {
    setFormError('')
    if (!form.revenue || !form.orders || !form.takeaway) {
      setFormError('Выручка, заказы и выносы — обязательные поля')
      return
    }
    if (parseFloat(form.revenue) <= 0) {
      setFormError('Выручка должна быть больше 0')
      return
    }
    setSubmitting(true)
    try {
      // В тестовом режиме: сначала сбросить старые данные за эту дату
      if (isTestActive) {
        setResetting(true)
        await api.testResetDay(branch!.id, testDate)
        setResetting(false)
      }

      const res = await api.cashierCloseByPin({
        pin: currentPin,
        branch_id: branch!.id,
        date: closeDate,
        revenue: parseFloat(form.revenue),
        orders_count: parseInt(form.orders),
        takeaway_count: parseInt(form.takeaway),
        comment: form.comment || undefined,
      })
      setSuccessMsg(res.bot_message)
      setMode('success')
    } catch (e: any) {
      setFormError(e.message || 'Ошибка при закрытии дня')
    } finally {
      setSubmitting(false)
      setResetting(false)
    }
  }

  const backToPin = () => {
    setMode('enter_pin')
    setCashierStatus(null)
    setCurrentPin('')
    setActionError('')
  }

  const done = () => {
    setMode('enter_pin')
    setCashierStatus(null)
    setCurrentPin('')
    setSuccessMsg('')
    setActionError('')
    setForm({ revenue: '', orders: '', takeaway: '', comment: '' })
    setFormError('')
  }

  const hasWarning = successMsg.includes('⚠️')

  // ── Доп. смена ────────────────────────────────────────────────────────────
  const [extraMode, setExtraMode] = useState<'hidden' | 'open_form' | 'close_form'>('hidden')
  const [employees, setEmployees] = useState<Array<{id: number; full_name: string; position: {name: string} | null}>>([])
  const [extraEmployeeId, setExtraEmployeeId] = useState('')
  const [extraStartTime, setExtraStartTime] = useState('')
  const [extraReason, setExtraReason] = useState('')
  const [extraShiftId, setExtraShiftId] = useState<number | null>(null)
  const [extraEmployeeName, setExtraEmployeeName] = useState('')
  const [extraLoading, setExtraLoading] = useState(false)
  const [extraError, setExtraError] = useState('')

  const loadEmployees = async () => {
    if (!branch) return
    try {
      const list = await api.getEmployees(branch.id)
      setEmployees(list.filter((e: any) => e.is_active))
    } catch {}
  }

  const handleOpenExtraShift = async () => {
    if (!extraEmployeeId || !branch) return
    setExtraLoading(true)
    setExtraError('')
    try {
      const res = await api.cashierOpenExtraShift({
        pin: currentPin,
        branch_id: branch.id,
        employee_id: parseInt(extraEmployeeId),
        start_time: extraStartTime || undefined,
        reason: extraReason || 'Дополнительная смена',
      })
      setExtraShiftId(res.shift_id)
      setExtraEmployeeName(res.employee_name)
      setExtraMode('close_form')
      setExtraReason('')
      setExtraStartTime('')
    } catch (e: any) { setExtraError(e.message) } finally { setExtraLoading(false) }
  }

  const handleCloseExtraShift = async () => {
    if (!extraShiftId || !branch) return
    setExtraLoading(true)
    setExtraError('')
    try {
      await api.cashierCloseExtraShift({
        pin: currentPin,
        branch_id: branch.id,
        shift_id: extraShiftId,
      })
      setExtraMode('hidden')
      setExtraShiftId(null)
      setExtraEmployeeName('')
      setExtraEmployeeId('')
    } catch (e: any) { setExtraError(e.message) } finally { setExtraLoading(false) }
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-6 bg-gray-50">
      <div className="flex flex-col items-center gap-1">
        <h1 className="text-2xl font-bold text-brand">Аппетит — Кассир</h1>
        {IS_LIVE_TEST && (
          <span className="text-xs bg-green-100 text-green-700 px-3 py-1 rounded-full font-semibold">
            🟢 Реальный тест — дата и время фиксируются автоматически
          </span>
        )}
        {IS_TEST_MODE && !IS_LIVE_TEST && (
          <span className="text-xs bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full">
            🧪 Тестовый режим
          </span>
        )}
      </div>

      {/* ШАГ 1: Выбор филиала */}
      {mode === 'select_branch' && (
        <div className="w-full max-w-sm">
          <h2 className="text-lg font-semibold text-center mb-4">Выберите филиал</h2>
          <div className="flex flex-col gap-3">
            {branches.map(b => (
              <button key={b.id}
                onClick={() => { setBranch(b); setMode('enter_pin') }}
                className="py-4 px-6 bg-white rounded-xl shadow text-left font-medium hover:bg-orange-50 transition-colors">
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ШАГ 2: Ввод PIN кассира */}
      {mode === 'enter_pin' && branch && (
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="text-center">
            <h2 className="text-lg font-semibold">{branch.name}</h2>
            <p className="text-sm text-gray-500 mt-1">Введите PIN кассира</p>
          </div>

          {/* Тестовый режим: дата */}
          {isTestActive && (
            <div className="w-full max-w-xs bg-yellow-50 border border-yellow-300 rounded-xl p-4">
              <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-2">
                🧪 Тестовый режим
              </p>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-yellow-800 font-medium">Дата закрытия дня</span>
                <input
                  type="date"
                  value={testDate}
                  onChange={e => setTestDate(e.target.value)}
                  className="border border-yellow-300 rounded-lg px-3 py-2 bg-white text-gray-800"
                />
              </label>
            </div>
          )}

          <PinPad onSubmit={handlePinSubmit} label="Войти" loading={loading} />
          <button
            onClick={() => { setBranch(null); setMode('select_branch') }}
            className="text-sm text-gray-400 hover:text-gray-600">
            Сменить филиал
          </button>
        </div>
      )}

      {/* ШАГ 3: Статус кассира */}
      {mode === 'status_card' && cashierStatus && branch && (
        <div className="flex flex-col items-center gap-5 w-full max-w-sm text-center">
          <h2 className="text-lg font-semibold">
            {branch.name}
            {isTestActive && (
              <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-normal">
                🧪 {testDate}
              </span>
            )}
          </h2>

          <div className="w-full bg-white rounded-xl shadow-md p-6">
            <p className="text-2xl font-bold mb-1">{cashierStatus.employee_name}</p>
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-4">Кассир</p>

            {cashierStatus.has_open_shift ? (
              <div className="text-gray-600 text-sm mb-5 space-y-1">
                <p>🕐 Смена открыта с <span className="font-semibold">{formatTime(cashierStatus.opened_at)}</span></p>
                <p>Отработано: <span className="font-semibold">{cashierStatus.hours_so_far} ч.</span></p>
              </div>
            ) : (
              <p className="text-gray-400 text-sm mb-5">Смена ещё не открыта</p>
            )}

            {actionError && (
              <p className="text-red-500 text-sm mb-3 whitespace-pre-line">{actionError}</p>
            )}

            {cashierStatus.has_open_shift ? (
              <button
                onClick={() => { setFormError(''); setMode('close_form') }}
                className="w-full py-4 bg-gray-700 text-white rounded-xl font-semibold text-lg hover:bg-gray-800 transition-colors">
                🔒 Закрыть смену и день
              </button>
            ) : actionError ? (
              // Уже была смена сегодня — можно сразу закрыть день с выручкой
              <button
                onClick={() => { setFormError(''); setActionError(''); setMode('close_form') }}
                className="w-full py-4 bg-gray-700 text-white rounded-xl font-semibold text-lg hover:bg-gray-800 transition-colors">
                🔒 Закрыть день (внести выручку)
              </button>
            ) : (
              <button
                onClick={handleOpenShift}
                disabled={loading}
                className="w-full py-4 bg-green-500 text-white rounded-xl font-semibold text-lg hover:bg-green-600 disabled:opacity-50 transition-colors">
                {loading ? 'Открываю...' : '🟢 Открыть смену'}
              </button>
            )}
          </div>

          <button onClick={backToPin} className="text-sm text-gray-400 hover:text-gray-600">
            ← Ввести PIN снова
          </button>

          {/* ── Доп. смена ── */}
          <div className="w-full border-t pt-4">
            {extraMode === 'hidden' && (
              <button
                onClick={() => { setExtraMode('open_form'); setExtraError(''); loadEmployees() }}
                className="w-full py-2.5 border border-gray-300 rounded-xl text-sm text-gray-600 hover:bg-gray-50 font-medium">
                ➕ Открыть доп. смену сотруднику
              </button>
            )}

            {extraMode === 'open_form' && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col gap-3">
                <p className="font-semibold text-sm text-blue-800">➕ Дополнительная смена</p>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600 font-medium">Сотрудник</span>
                  <select value={extraEmployeeId} onChange={e => setExtraEmployeeId(e.target.value)}
                    className="border rounded-lg px-3 py-2 bg-white">
                    <option value="">— выберите —</option>
                    {employees.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.full_name}{e.position ? ` (${e.position.name})` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600 font-medium">Время начала (необязательно)</span>
                  <input type="time" value={extraStartTime}
                    onChange={e => setExtraStartTime(e.target.value)}
                    className="border rounded-lg px-3 py-2 bg-white" />
                  <span className="text-xs text-gray-400">Оставьте пустым — запишется сейчас</span>
                </label>

                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-gray-600 font-medium">Причина</span>
                  <input type="text" value={extraReason}
                    onChange={e => setExtraReason(e.target.value)}
                    placeholder="Дополнительная смена"
                    className="border rounded-lg px-3 py-2 bg-white" />
                </label>

                {extraError && <p className="text-red-500 text-xs">{extraError}</p>}

                <div className="flex gap-2">
                  <button onClick={() => setExtraMode('hidden')}
                    className="flex-1 py-2 border rounded-lg text-gray-500 text-sm hover:bg-gray-50">
                    Отмена
                  </button>
                  <button onClick={handleOpenExtraShift}
                    disabled={extraLoading || !extraEmployeeId}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-blue-700">
                    {extraLoading ? '...' : 'Открыть'}
                  </button>
                </div>
              </div>
            )}

            {extraMode === 'close_form' && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex flex-col gap-3">
                <p className="font-semibold text-sm text-green-800">
                  ✅ Доп. смена открыта: {extraEmployeeName}
                </p>
                <p className="text-xs text-gray-500">Когда сотрудник закончит — закройте смену</p>
                {extraError && <p className="text-red-500 text-xs">{extraError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => { setExtraMode('open_form'); loadEmployees() }}
                    className="flex-1 py-2 border rounded-lg text-gray-500 text-sm hover:bg-gray-50">
                    Ещё одну
                  </button>
                  <button onClick={handleCloseExtraShift} disabled={extraLoading}
                    className="flex-1 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-800">
                    {extraLoading ? '...' : '🔒 Закрыть смену'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ШАГ 4: Форма закрытия дня */}
      {mode === 'close_form' && cashierStatus && branch && (
        <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold text-lg">Закрытие дня</h2>
            <span className="text-sm text-gray-400">{branch.name}</span>
          </div>
          <div className="text-sm text-gray-500 space-y-0.5">
            <p>Кассир: <span className="font-medium text-gray-800">{cashierStatus.employee_name}</span></p>
            <p>
              Дата: <span className="font-medium text-gray-800">{closeDate}</span>
              {isTestActive && (
                <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">🧪 тест</span>
              )}
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-600">
                Выручка (₽) <span className="text-red-500">*</span>
              </span>
              <input
                type="number" min="0" value={form.revenue}
                onChange={e => setForm(f => ({ ...f, revenue: e.target.value }))}
                className="border rounded-xl px-4 py-3 text-lg"
                placeholder="0" autoFocus />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-600">
                Количество заказов <span className="text-red-500">*</span>
              </span>
              <input
                type="number" min="0" value={form.orders}
                onChange={e => setForm(f => ({ ...f, orders: e.target.value }))}
                className="border rounded-xl px-4 py-3 text-lg"
                placeholder="0" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-600">
                Выносы <span className="text-red-500">*</span>
                <span className="text-xs text-gray-400 ml-1">(только аналитика)</span>
              </span>
              <input
                type="number" min="0" value={form.takeaway}
                onChange={e => setForm(f => ({ ...f, takeaway: e.target.value }))}
                className="border rounded-xl px-4 py-3 text-lg"
                placeholder="0" />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-600">Комментарий</span>
              <textarea
                value={form.comment}
                onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
                className="border rounded-xl px-4 py-3 resize-none"
                rows={2} placeholder="Необязательно" />
            </label>
          </div>

          {isTestActive && (
            <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg p-2">
              🧪 Тест: перед закрытием старые данные за {testDate} будут сброшены автоматически.
              Бонус = orders × 7 (или ×5 в пт/сб), выносы в бонус не входят.
            </p>
          )}

          {formError && <p className="text-red-500 text-sm font-medium">{formError}</p>}

          <button
            onClick={handleCloseDay}
            disabled={submitting || !form.revenue || !form.orders || !form.takeaway}
            className="bg-brand text-white py-4 rounded-xl font-semibold text-lg hover:bg-red-700 disabled:opacity-50 transition-colors">
            {resetting ? 'Сброс...' : submitting ? 'Закрываем день...' : 'Закрыть день'}
          </button>

          <p className="text-xs text-gray-400 text-center">
            Все три поля обязательны. Уведомление будет записано в журнал.
          </p>

          <button
            onClick={() => setMode('status_card')}
            className="text-sm text-gray-400 hover:text-gray-600 text-center">
            Отмена
          </button>
        </div>
      )}

      {/* ШАГ 5: Успех */}
      {mode === 'success' && (
        <div className="flex flex-col items-center gap-5 text-center max-w-sm w-full">
          <span className="text-5xl">{hasWarning ? '⚠️' : '✅'}</span>
          <div className="w-full bg-white rounded-xl shadow p-5 text-left">
            <pre className="text-sm font-sans whitespace-pre-wrap leading-relaxed text-gray-800">
              {successMsg}
            </pre>
          </div>
          {isTestActive && (
            <p className="text-xs text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
              🧪 Тестовые данные за {testDate} сохранены. Можно открыть /fot для проверки.
            </p>
          )}
          <p className="text-xs text-gray-400">Уведомление записано в журнал</p>
          <button
            onClick={done}
            className="px-8 py-3 bg-brand text-white rounded-xl font-medium hover:bg-red-700 transition-colors">
            Готово
          </button>
        </div>
      )}
    </main>
  )
}
