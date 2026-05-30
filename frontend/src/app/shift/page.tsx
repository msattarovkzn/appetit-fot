'use client'
import { useState, useEffect } from 'react'
import PinPad from '@/components/PinPad'
import { api } from '@/lib/api'

// Тестовый режим: только development + только Челябинск (branch_id=1)
const IS_TEST_MODE = process.env.NEXT_PUBLIC_TEST_MODE === 'true'
const TEST_BRANCH_ID = 1

type Mode = 'select_branch' | 'enter_pin' | 'confirm_action' | 'success'

interface Branch { id: number; name: string }

interface ShiftStatus {
  employee_id: number
  employee_name: string
  has_open_shift: boolean
  shift_id: number | null
  opened_at: string | null
  hours_so_far: number | null
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

export default function ShiftPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [branch, setBranch] = useState<Branch | null>(null)
  const [mode, setMode] = useState<Mode>('select_branch')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [shiftStatus, setShiftStatus] = useState<ShiftStatus | null>(null)
  const [currentPin, setCurrentPin] = useState('')

  // Тестовый режим
  const [testDate, setTestDate] = useState(todayStr)
  const [testHours, setTestHours] = useState('8')

  const isTestActive = IS_TEST_MODE && branch?.id === TEST_BRANCH_ID

  useEffect(() => {
    api.getBranches().then(setBranches).catch(() => {})
  }, [])

  // Called by PinPad — throws on error so PinPad shows it inline
  const handlePinSubmit = async (pin: string) => {
    if (isTestActive) {
      const status = await api.testShiftStatus(pin, branch!.id, testDate)
      setShiftStatus({ ...status, hours_so_far: null })
    } else {
      const status = await api.checkShiftStatus(pin, branch!.id)
      setShiftStatus(status)
    }
    setCurrentPin(pin)
    setActionError('')
    setMode('confirm_action')
  }

  const handleAction = async () => {
    if (!shiftStatus || !branch) return
    setLoading(true)
    setActionError('')
    try {
      if (shiftStatus.has_open_shift) {
        // Закрыть смену
        if (isTestActive) {
          const hours = parseFloat(testHours)
          if (!hours || hours <= 0) {
            setActionError('Введите количество часов')
            setLoading(false)
            return
          }
          const res = await api.testCloseShift(currentPin, branch.id, testDate, hours)
          setMessage(
            `${res.employee_name}, тестовая смена за ${testDate} закрыта.\nОтработано: ${res.approved_hours} ч.`
          )
        } else {
          const res = await api.closeShift(currentPin, branch.id)
          const hours = res.approved_hours ?? shiftStatus.hours_so_far ?? '?'
          setMessage(`${res.employee_name}, твоя смена закрыта. Спасибо за смену! Отработано: ${hours} ч.`)
        }
      } else {
        // Открыть смену
        if (isTestActive) {
          const res = await api.testOpenShift(currentPin, branch.id, testDate)
          setMessage(
            res.already_existed
              ? `${res.employee_name}, смена за ${testDate} уже была открыта.`
              : `${res.employee_name}, тестовая смена за ${testDate} открыта. Хорошей работы!`
          )
        } else {
          const res = await api.openShift(currentPin, branch.id)
          setMessage(`${res.employee_name}, твоя смена открыта. Хорошей работы!`)
        }
      }
      setMode('success')
    } catch (e: any) {
      const msg = e.message || 'Ошибка'
      if (msg === 'already_had_shift') {
        setActionError(
          'У вас уже была смена сегодня.\nДополнительную смену может открыть только кассир.'
        )
      } else {
        setActionError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const backToPin = () => {
    setMode('enter_pin')
    setShiftStatus(null)
    setCurrentPin('')
    setActionError('')
  }

  // «Готово» → back to same branch PIN entry
  const done = () => {
    setMode('enter_pin')
    setShiftStatus(null)
    setCurrentPin('')
    setMessage('')
    setActionError('')
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-6">
      <h1 className="text-2xl font-bold text-brand">Аппетит — Смены</h1>

      {/* STEP 1 — Choose branch */}
      {mode === 'select_branch' && (
        <div className="w-full max-w-sm">
          <h2 className="text-lg font-semibold text-center mb-4">Выберите филиал</h2>
          <div className="flex flex-col gap-3">
            {branches.map(b => (
              <button
                key={b.id}
                onClick={() => { setBranch(b); setMode('enter_pin'); setActionError('') }}
                className="py-4 px-6 bg-white rounded-xl shadow text-left font-medium hover:bg-orange-50 transition-colors"
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2 — Enter PIN */}
      {mode === 'enter_pin' && branch && (
        <div className="flex flex-col items-center gap-4 w-full">
          <div className="text-center">
            <h2 className="text-lg font-semibold">{branch.name}</h2>
            <p className="text-gray-500 text-sm mt-1">Введите PIN для отметки смены</p>
          </div>

          {/* Тестовый режим: выбор даты */}
          {isTestActive && (
            <div className="w-full max-w-xs bg-yellow-50 border border-yellow-300 rounded-xl p-4">
              <p className="text-xs font-semibold text-yellow-700 uppercase tracking-wide mb-2">
                🧪 Тестовый режим
              </p>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-yellow-800 font-medium">Дата смены</span>
                <input
                  type="date"
                  value={testDate}
                  onChange={e => setTestDate(e.target.value)}
                  className="border border-yellow-300 rounded-lg px-3 py-2 bg-white text-gray-800"
                />
              </label>
            </div>
          )}

          <PinPad onSubmit={handlePinSubmit} label="Продолжить" loading={loading} />
          <button
            onClick={() => { setBranch(null); setMode('select_branch') }}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Сменить филиал
          </button>
        </div>
      )}

      {/* STEP 3 — Confirm action based on shift status */}
      {mode === 'confirm_action' && shiftStatus && branch && (
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
            <p className="text-2xl font-bold mb-2">{shiftStatus.employee_name}</p>

            {shiftStatus.has_open_shift ? (
              <div className="text-gray-600 text-sm mb-5 space-y-1">
                <p>🕐 Смена открыта с <span className="font-semibold">{formatTime(shiftStatus.opened_at)}</span></p>
                {!isTestActive && shiftStatus.hours_so_far != null && (
                  <p>Уже отработано: <span className="font-semibold">{shiftStatus.hours_so_far} ч.</span></p>
                )}
              </div>
            ) : (
              <p className="text-gray-400 text-sm mb-5">Смена ещё не открыта</p>
            )}

            {/* Тестовый режим: поле часов при закрытии */}
            {isTestActive && shiftStatus.has_open_shift && (
              <div className="mb-4">
                <label className="flex flex-col gap-1 text-sm text-left">
                  <span className="text-yellow-700 font-medium">🧪 Кол-во часов смены</span>
                  <input
                    type="number"
                    min="0.5" max="24" step="0.5"
                    value={testHours}
                    onChange={e => setTestHours(e.target.value)}
                    className="border border-yellow-300 rounded-lg px-3 py-2 text-lg text-center"
                    placeholder="8"
                  />
                </label>
              </div>
            )}

            {actionError && (
              <p className="text-red-500 text-sm mb-3">{actionError}</p>
            )}

            {shiftStatus.has_open_shift ? (
              <button
                onClick={handleAction}
                disabled={loading}
                className="w-full py-4 bg-gray-700 text-white rounded-xl font-semibold text-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Закрываю...' : '🔒 Закрыть смену'}
              </button>
            ) : (
              <button
                onClick={handleAction}
                disabled={loading}
                className="w-full py-4 bg-green-500 text-white rounded-xl font-semibold text-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Открываю...' : '🟢 Открыть смену'}
              </button>
            )}
          </div>

          <button onClick={backToPin} className="text-sm text-gray-400 hover:text-gray-600">
            ← Ввести PIN снова
          </button>
        </div>
      )}

      {/* STEP 4 — Success */}
      {mode === 'success' && (
        <div className="flex flex-col items-center gap-6 text-center max-w-sm">
          <span className="text-6xl">✅</span>
          <p className="text-xl font-semibold leading-snug whitespace-pre-line">{message}</p>
          <button
            onClick={done}
            className="px-8 py-3 bg-brand text-white rounded-xl font-medium hover:bg-red-700 transition-colors"
          >
            Готово
          </button>
        </div>
      )}
    </main>
  )
}
