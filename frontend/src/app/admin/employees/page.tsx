'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'

// ─── Constants ───────────────────────────────────────────────────────────────

const CAT: Record<string, string> = {
  admin: 'Администрация', kitchen: 'Кухня',
  tech: 'Техперсонал', courier: 'Курьеры', reserve: 'Резерв',
}
const PAY: Record<string, string> = { hourly: 'Почасовая', fixed_daily: 'Фикс/день' }
const CAT_KEYS = ['admin', 'kitchen', 'tech', 'courier', 'reserve']

// ─── Types ────────────────────────────────────────────────────────────────────

type Employee = {
  id: number; full_name: string; branch_id: number
  is_cashier: boolean; is_active: boolean; comment: string | null
  position_id: number; position_name: string | null
  category: string | null; payment_type: string | null
  current_rate: number | null; current_fixed_daily_rate: number | null
}

type RateEntry = {
  id: number; rate: number; fixed_daily_rate: number | null
  effective_from: string; date_to: string | null
  created_by: number; created_by_name: string | null; created_at: string
}

type EmployeeDetail = Employee & { created_at: string; rates: RateEntry[] }

type Position = {
  id: number; name: string; category: string
  payment_type: string; is_active: boolean; employee_count: number
}

type Branch = { id: number; name: string; city: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString('ru-RU') }

function todayStr() { return new Date().toISOString().slice(0, 10) }

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mt-8 mb-8">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  )
}

// ─── Form field ───────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-600">{label}</span>
      {children}
    </label>
  )
}

const inputCls = 'border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand'
const selectCls = inputCls + ' bg-white'

// ─── Employee form modal ──────────────────────────────────────────────────────

function EmployeeFormModal({
  positions, branches, initial, onSave, onClose,
}: {
  positions: Position[]
  branches: Branch[]
  initial?: Employee
  onSave: () => void
  onClose: () => void
}) {
  const isEdit = !!initial

  const [fullName, setFullName] = useState(initial?.full_name ?? '')
  const [pin, setPin] = useState('')
  const [branchId, setBranchId] = useState(initial?.branch_id ?? (branches[0]?.id ?? 1))
  const [positionId, setPositionId] = useState<number>(initial?.position_id ?? (positions[0]?.id ?? 0))
  const [isCashier, setIsCashier] = useState(initial?.is_cashier ?? false)
  const [comment, setComment] = useState(initial?.comment ?? '')
  const [employeeLogin, setEmployeeLogin] = useState((initial as any)?.employee_login ?? '')
  const [rate, setRate] = useState('')
  const [fixedDaily, setFixedDaily] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(todayStr())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedPos = positions.find(p => p.id === positionId)

  const handleSubmit = async () => {
    setError('')
    if (!fullName.trim()) return setError('Введите ФИО')
    if (!isEdit && !pin) return setError('Введите PIN')
    if (!isEdit && (!pin.match(/^\d{4,}$/))) return setError('PIN — минимум 4 цифры')
    if (!positionId) return setError('Выберите должность')
    if (!isEdit && !rate) return setError('Введите ставку')

    setSaving(true)
    try {
      if (isEdit) {
        const data: Record<string, unknown> = { full_name: fullName, position_id: positionId, is_cashier: isCashier, comment, employee_login: employeeLogin || null }
        if (pin) data.pin = pin
        await api.adminUpdateEmployee(initial!.id, data)
      } else {
        await api.adminCreateEmployee({
          full_name: fullName, pin, branch_id: branchId,
          position_id: positionId, is_cashier: isCashier,
          comment: comment || undefined,
          rate: parseFloat(rate), effective_from: effectiveFrom,
          fixed_daily_rate: fixedDaily ? parseFloat(fixedDaily) : undefined,
        })
      }
      onSave()
    } catch (e: any) {
      setError(e.message || 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={isEdit ? `Редактировать: ${initial!.full_name}` : 'Новый сотрудник'} onClose={onClose}>
      <div className="flex flex-col gap-4">

        <Field label="ФИО *">
          <input className={inputCls} value={fullName} onChange={e => setFullName(e.target.value)}
            placeholder="Иванова Мария Петровна" />
        </Field>

        <Field label={isEdit ? 'Новый PIN (оставьте пустым чтобы не менять)' : 'PIN *'}>
          <input className={inputCls} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="1234" maxLength={8} inputMode="numeric" />
        </Field>

        {!isEdit && (
          <Field label="Филиал *">
            <select className={selectCls} value={branchId} onChange={e => setBranchId(Number(e.target.value))}>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name} ({b.city})</option>)}
            </select>
          </Field>
        )}

        <Field label="Должность *">
          <select className={selectCls} value={positionId} onChange={e => setPositionId(Number(e.target.value))}>
            <option value={0}>— выберите —</option>
            {positions.filter(p => p.is_active).map(p => (
              <option key={p.id} value={p.id}>
                {p.name} ({CAT[p.category] ?? p.category} · {PAY[p.payment_type] ?? p.payment_type})
              </option>
            ))}
          </select>
        </Field>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="cashier" checked={isCashier}
            onChange={e => setIsCashier(e.target.checked)}
            className="w-4 h-4 accent-brand" />
          <label htmlFor="cashier" className="text-sm text-gray-700">Доступ кассира (закрытие дня)</label>
        </div>

        {!isEdit && (
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Начальная ставка</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label={selectedPos?.payment_type === 'fixed_daily' ? 'Фикс/день, ₽ *' : 'Ставка ₽/ч *'}>
                <input className={inputCls} type="number" min="1" value={rate}
                  onChange={e => setRate(e.target.value)} placeholder="200" />
              </Field>
              {selectedPos?.payment_type === 'fixed_daily' && (
                <Field label="Доп. ставка ₽/ч">
                  <input className={inputCls} type="number" min="0" value={fixedDaily}
                    onChange={e => setFixedDaily(e.target.value)} placeholder="0" />
                </Field>
              )}
              <Field label="Дата начала *">
                <input className={inputCls} type="date" value={effectiveFrom}
                  onChange={e => setEffectiveFrom(e.target.value)} />
              </Field>
            </div>
          </div>
        )}

        <Field label="Логин для кабинета сотрудника">
          <input className={inputCls} type="text" value={employeeLogin}
            onChange={e => setEmployeeLogin(e.target.value)}
            placeholder="Например: ivanov (латиница/кириллица)" />
          <p className="text-xs text-gray-400 mt-1">Сотрудник входит на appetit-fot.vercel.app/employee по этому логину + PIN</p>
        </Field>

        <Field label="Комментарий">
          <textarea className={inputCls + ' resize-none'} rows={2} value={comment}
            onChange={e => setComment(e.target.value)} placeholder="Необязательно" />
        </Field>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Отмена</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 text-sm bg-brand text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
            {saving ? 'Сохраняю...' : isEdit ? 'Сохранить' : 'Создать'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Rate modal ───────────────────────────────────────────────────────────────

function RateModal({
  employee, onSave, onClose,
}: {
  employee: EmployeeDetail; onSave: () => void; onClose: () => void
}) {
  const [rate, setRate] = useState('')
  const [fixedDaily, setFixedDaily] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(todayStr())
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    setError('')
    if (!rate || parseFloat(rate) <= 0) return setError('Введите ставку больше 0')
    setSaving(true)
    try {
      await api.adminAddRate(employee.id, {
        rate: parseFloat(rate),
        fixed_daily_rate: fixedDaily ? parseFloat(fixedDaily) : undefined,
        effective_from: effectiveFrom,
      })
      onSave()
    } catch (e: any) {
      setError(e.message || 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Изменить ставку: ${employee.full_name}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        {/* Current rate */}
        <div className="bg-gray-50 rounded-xl p-3 text-sm">
          <p className="text-gray-500 mb-1">Текущая ставка</p>
          <p className="font-semibold text-gray-800">
            {employee.current_rate != null
              ? (employee.payment_type === 'fixed_daily'
                ? `${fmt(employee.current_rate)} ₽/день`
                : `${fmt(employee.current_rate)} ₽/ч`)
              : '—'}
          </p>
        </div>

        <Field label="Новая ставка, ₽ *">
          <input className={inputCls} type="number" min="1" value={rate}
            onChange={e => setRate(e.target.value)} placeholder="250" />
        </Field>

        {employee.payment_type === 'fixed_daily' && (
          <Field label="Доп. ставка ₽/ч (если есть)">
            <input className={inputCls} type="number" min="0" value={fixedDaily}
              onChange={e => setFixedDaily(e.target.value)} placeholder="0" />
          </Field>
        )}

        <Field label="Действует с *">
          <input className={inputCls} type="date" value={effectiveFrom}
            onChange={e => setEffectiveFrom(e.target.value)} />
        </Field>

        <p className="text-xs text-gray-400">
          Старая ставка будет закрыта датой {effectiveFrom} − 1 день. Расчёты за прошлые периоды не изменятся.
        </p>

        {/* Rate history */}
        {employee.rates.length > 0 && (
          <div className="border-t pt-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">История ставок</p>
            <div className="flex flex-col gap-1">
              {employee.rates.map(r => (
                <div key={r.id} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5">
                  <span className="font-semibold text-gray-800">{fmt(r.rate)} ₽</span>
                  <span>
                    {r.effective_from}
                    {r.date_to ? ` — ${r.date_to}` : ' — сейчас'}
                  </span>
                  <span className="text-gray-400">{r.created_by_name ?? '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Отмена</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 text-sm bg-brand text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium">
            {saving ? 'Сохраняю...' : 'Сохранить ставку'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EmployeesAdminPage() {
  const [token, setToken] = useState<string | null>(null)
  const [role, setRole] = useState('')

  const [employees, setEmployees] = useState<Employee[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Filters
  const [branchFilter, setBranchFilter] = useState<number | ''>('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [catFilter, setCatFilter] = useState('')
  const [search, setSearch] = useState('')

  // Modals
  const [showCreate, setShowCreate] = useState(false)
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null)
  const [rateEmployee, setRateEmployee] = useState<EmployeeDetail | null>(null)
  const [dismissConfirm, setDismissConfirm] = useState<Employee | null>(null)

  const canEdit = role === 'accountant' || role === 'owner'

  useEffect(() => {
    setToken(localStorage.getItem('token'))
    setRole(localStorage.getItem('role') || '')
  }, [])

  useEffect(() => {
    if (!token) return
    api.getBranches().then(setBranches).catch(() => {})
    api.adminListPositions(true).then(setPositions).catch(() => {})
  }, [token])

  const load = useCallback(() => {
    if (!token) return
    setLoading(true)
    setError('')
    api.adminListEmployees({
      branch_id: branchFilter || undefined,
      status: statusFilter,
      category: catFilter || undefined,
      search: search || undefined,
    })
      .then(setEmployees)
      .catch(e => setError(e.message || 'Ошибка'))
      .finally(() => setLoading(false))
  }, [token, branchFilter, statusFilter, catFilter, search])

  useEffect(() => { load() }, [load])

  const handleDismiss = async (emp: Employee) => {
    try {
      await api.adminDismissEmployee(emp.id)
      load()
    } catch (e: any) { alert(e.message) }
    setDismissConfirm(null)
  }

  const handleActivate = async (emp: Employee) => {
    try {
      await api.adminActivateEmployee(emp.id)
      load()
    } catch (e: any) { alert(e.message) }
  }

  const openRateModal = async (emp: Employee) => {
    try {
      const detail = await api.adminGetEmployee(emp.id)
      setRateEmployee(detail as EmployeeDetail)
    } catch (e: any) { alert(e.message) }
  }

  if (!token || (!canEdit && token)) {
    if (!token) return (
      <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-6">
        <p className="text-gray-500">Войдите через <a href="/admin" className="text-brand underline">/admin</a></p>
      </main>
    )
    return (
      <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-6">
        <p className="text-red-500">Доступ запрещён. Нужна роль бухгалтера или собственника.</p>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toolbar */}
      <div className="bg-white border-b shadow-sm px-4 py-3 sticky top-0 z-20">
        <div className="max-w-screen-xl mx-auto flex flex-wrap items-center gap-3">
          <a href="/admin" className="text-gray-400 hover:text-gray-600 text-sm">← Назад</a>
          <h1 className="text-lg font-bold text-brand">👥 Сотрудники</h1>

          {/* Filters */}
          <select value={branchFilter} onChange={e => setBranchFilter(e.target.value ? Number(e.target.value) : '')}
            className="border rounded-lg px-2 py-1.5 text-sm bg-white">
            <option value="">Все филиалы</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm bg-white">
            <option value="active">Работает</option>
            <option value="dismissed">Уволен</option>
            <option value="all">Все</option>
          </select>

          <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
            className="border rounded-lg px-2 py-1.5 text-sm bg-white">
            <option value="">Все категории</option>
            {CAT_KEYS.map(k => <option key={k} value={k}>{CAT[k]}</option>)}
          </select>

          <input
            className="border rounded-lg px-3 py-1.5 text-sm w-44"
            placeholder="Поиск по ФИО..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          <div className="ml-auto flex gap-2">
            <a href="/admin/positions"
              className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 text-gray-600">
              📋 Должности
            </a>
            <button onClick={() => setShowCreate(true)}
              className="px-4 py-1.5 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-red-700">
              + Сотрудник
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-screen-xl mx-auto p-4">
        {error && <p className="text-red-500 mb-3">{error}</p>}
        {loading && <p className="text-gray-400 py-8 text-center">Загрузка...</p>}

        {!loading && (
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="px-4 py-3 font-semibold text-gray-600">ФИО</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Должность</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Категория</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-right">Ставка</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-center">Кассир</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-center">Статус</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-right">Действия</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{emp.full_name}</div>
                      {emp.comment && (
                        <div className="text-xs text-gray-400 mt-0.5 truncate max-w-[180px]">{emp.comment}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{emp.position_name ?? '—'}</td>
                    <td className="px-4 py-3">
                      {emp.category && (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                          {CAT[emp.category] ?? emp.category}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {emp.current_rate != null ? (
                        <span className="font-semibold text-gray-800">
                          {fmt(emp.current_rate)}
                          <span className="text-gray-400 font-normal text-xs ml-1">
                            {emp.payment_type === 'fixed_daily' ? '₽/д' : '₽/ч'}
                          </span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {emp.is_cashier ? <span className="text-green-600">✓</span> : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        emp.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {emp.is_active ? 'Работает' : 'Уволен'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => setEditEmployee(emp)}
                          className="px-2 py-1 text-xs border rounded hover:bg-gray-50 text-gray-600">
                          Ред.
                        </button>
                        <button onClick={() => openRateModal(emp)}
                          className="px-2 py-1 text-xs border rounded hover:bg-blue-50 text-blue-600 border-blue-200">
                          Ставка
                        </button>
                        {emp.is_active ? (
                          <button onClick={() => setDismissConfirm(emp)}
                            className="px-2 py-1 text-xs border rounded hover:bg-red-50 text-red-600 border-red-200">
                            Уволить
                          </button>
                        ) : (
                          <button onClick={() => handleActivate(emp)}
                            className="px-2 py-1 text-xs border rounded hover:bg-green-50 text-green-600 border-green-200">
                            Вернуть
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {employees.length === 0 && (
              <p className="text-center text-gray-400 py-10">Сотрудников не найдено</p>
            )}
          </div>
        )}

        <p className="mt-3 text-xs text-gray-400">
          Итого: {employees.length} сотр.
        </p>
      </div>

      {/* Modals */}
      {showCreate && (
        <EmployeeFormModal
          positions={positions} branches={branches}
          onSave={() => { setShowCreate(false); load() }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {editEmployee && (
        <EmployeeFormModal
          positions={positions} branches={branches}
          initial={editEmployee}
          onSave={() => { setEditEmployee(null); load() }}
          onClose={() => setEditEmployee(null)}
        />
      )}

      {rateEmployee && (
        <RateModal
          employee={rateEmployee}
          onSave={() => { setRateEmployee(null); load() }}
          onClose={() => setRateEmployee(null)}
        />
      )}

      {dismissConfirm && (
        <Modal title="Подтвердите увольнение" onClose={() => setDismissConfirm(null)}>
          <p className="text-gray-700 mb-4">
            Уволить <strong>{dismissConfirm.full_name}</strong>?<br />
            <span className="text-sm text-gray-400">Сотрудник станет неактивным. Данные сохранятся.</span>
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setDismissConfirm(null)}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Отмена</button>
            <button onClick={() => handleDismiss(dismissConfirm)}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
              Уволить
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
