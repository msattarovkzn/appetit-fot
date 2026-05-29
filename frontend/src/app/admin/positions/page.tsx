'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'

// ─── Constants ───────────────────────────────────────────────────────────────

const CAT: Record<string, string> = {
  admin: 'Администрация', kitchen: 'Кухня',
  tech: 'Техперсонал', courier: 'Курьеры', reserve: 'Резерв',
}
const PAY: Record<string, string> = { hourly: 'Почасовая', fixed_daily: 'Фикс/день' }

const CAT_OPTIONS = [
  { value: 'admin', label: 'Администрация' },
  { value: 'kitchen', label: 'Кухня' },
  { value: 'tech', label: 'Техперсонал' },
  { value: 'courier', label: 'Курьеры' },
  { value: 'reserve', label: 'Резерв' },
]

const PAY_OPTIONS = [
  { value: 'hourly', label: 'Почасовая (₽/ч)' },
  { value: 'fixed_daily', label: 'Фиксированная (₽/день)' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

type Position = {
  id: number; name: string; category: string
  payment_type: string; is_active: boolean; employee_count: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputCls = 'border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand w-full'
const selectCls = inputCls + ' bg-white'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-gray-600">{label}</span>
      {children}
    </label>
  )
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mt-20">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  )
}

// ─── Position form modal ──────────────────────────────────────────────────────

function PositionFormModal({
  initial, onSave, onClose,
}: {
  initial?: Position
  onSave: () => void
  onClose: () => void
}) {
  const isEdit = !!initial

  const [name, setName] = useState(initial?.name ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'kitchen')
  const [paymentType, setPaymentType] = useState(initial?.payment_type ?? 'hourly')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    setError('')
    if (!name.trim()) return setError('Введите название должности')

    setSaving(true)
    try {
      if (isEdit) {
        await api.adminUpdatePosition(initial!.id, {
          name: name.trim(),
          category,
          payment_type: paymentType,
        })
      } else {
        await api.adminCreatePosition({
          name: name.trim(),
          category,
          payment_type: paymentType,
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
    <Modal title={isEdit ? `Редактировать: ${initial!.name}` : 'Новая должность'} onClose={onClose}>
      <div className="flex flex-col gap-4">

        <Field label="Название *">
          <input className={inputCls} value={name} onChange={e => setName(e.target.value)}
            placeholder="Повар, Администратор..." autoFocus />
        </Field>

        <Field label="Категория *">
          <select className={selectCls} value={category} onChange={e => setCategory(e.target.value)}>
            {CAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>

        <Field label="Тип оплаты *">
          <select className={selectCls} value={paymentType} onChange={e => setPaymentType(e.target.value)}>
            {PAY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>

        {isEdit && (
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3">
            Изменение типа оплаты влияет только на новые расчёты. Исторические данные не изменятся.
          </p>
        )}

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

// ─── Deactivate confirm modal ─────────────────────────────────────────────────

function DeactivateModal({
  position, onConfirm, onClose,
}: {
  position: Position; onConfirm: () => void; onClose: () => void
}) {
  return (
    <Modal title="Деактивировать должность" onClose={onClose}>
      <p className="text-gray-700 mb-4">
        Деактивировать <strong>{position.name}</strong>?<br />
        <span className="text-sm text-gray-400">
          Должность будет скрыта при создании новых сотрудников. Существующие записи сохранятся.
        </span>
      </p>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose}
          className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Отмена</button>
        <button onClick={onConfirm}
          className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">
          Деактивировать
        </button>
      </div>
    </Modal>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PositionsAdminPage() {
  const [token, setToken] = useState<string | null>(null)
  const [role, setRole] = useState('')

  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // Modals
  const [showCreate, setShowCreate] = useState(false)
  const [editPosition, setEditPosition] = useState<Position | null>(null)
  const [deactivateConfirm, setDeactivateConfirm] = useState<Position | null>(null)

  const canEdit = role === 'accountant' || role === 'owner'

  useEffect(() => {
    setToken(localStorage.getItem('token'))
    setRole(localStorage.getItem('role') || '')
  }, [])

  const load = useCallback(() => {
    if (!token) return
    setLoading(true)
    setError('')
    api.adminListPositions(showInactive)
      .then(setPositions)
      .catch(e => setError(e.message || 'Ошибка'))
      .finally(() => setLoading(false))
  }, [token, showInactive])

  useEffect(() => { load() }, [load])

  const handleDeactivate = async (pos: Position) => {
    try {
      await api.adminUpdatePosition(pos.id, { is_active: false })
      load()
    } catch (e: any) { alert(e.message) }
    setDeactivateConfirm(null)
  }

  const handleActivate = async (pos: Position) => {
    try {
      await api.adminUpdatePosition(pos.id, { is_active: true })
      load()
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

  // Group positions by category for display
  const grouped = CAT_OPTIONS.map(cat => ({
    catKey: cat.value,
    catLabel: cat.label,
    items: positions.filter(p => p.category === cat.value),
  })).filter(g => g.items.length > 0)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toolbar */}
      <div className="bg-white border-b shadow-sm px-4 py-3 sticky top-0 z-20">
        <div className="max-w-screen-xl mx-auto flex flex-wrap items-center gap-3">
          <a href="/admin" className="text-gray-400 hover:text-gray-600 text-sm">← Назад</a>
          <h1 className="text-lg font-bold text-brand">📋 Должности</h1>

          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer ml-2">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)}
              className="w-4 h-4 accent-brand" />
            Показать неактивные
          </label>

          <div className="ml-auto">
            <button onClick={() => setShowCreate(true)}
              className="px-4 py-1.5 bg-brand text-white rounded-lg text-sm font-semibold hover:bg-red-700">
              + Должность
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-screen-xl mx-auto p-4">
        {error && <p className="text-red-500 mb-3">{error}</p>}
        {loading && <p className="text-gray-400 py-8 text-center">Загрузка...</p>}

        {!loading && positions.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-medium">Должностей пока нет</p>
            <p className="text-sm mt-1">Нажмите «+ Должность» чтобы добавить первую</p>
          </div>
        )}

        {!loading && grouped.map(group => (
          <div key={group.catKey} className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
              {group.catLabel}
            </h2>
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b text-left">
                    <th className="px-4 py-3 font-semibold text-gray-600">Название</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Тип оплаты</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-center">Сотрудников</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-center">Статус</th>
                    <th className="px-4 py-3 font-semibold text-gray-600 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {group.items.map(pos => (
                    <tr key={pos.id} className={`border-b border-gray-100 hover:bg-gray-50 ${!pos.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-800">{pos.name}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {PAY[pos.payment_type] ?? pos.payment_type}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-semibold ${pos.employee_count > 0 ? 'text-blue-600' : 'text-gray-400'}`}>
                          {pos.employee_count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          pos.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {pos.is_active ? 'Активна' : 'Неактивна'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setEditPosition(pos)}
                            className="px-2 py-1 text-xs border rounded hover:bg-gray-50 text-gray-600">
                            Ред.
                          </button>
                          {pos.is_active ? (
                            <button
                              onClick={() => {
                                if (pos.employee_count > 0) {
                                  alert(`Нельзя деактивировать — есть ${pos.employee_count} активных сотрудников`)
                                  return
                                }
                                setDeactivateConfirm(pos)
                              }}
                              className="px-2 py-1 text-xs border rounded hover:bg-red-50 text-red-500 border-red-200 disabled:opacity-40">
                              Деактив.
                            </button>
                          ) : (
                            <button onClick={() => handleActivate(pos)}
                              className="px-2 py-1 text-xs border rounded hover:bg-green-50 text-green-600 border-green-200">
                              Активир.
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <p className="mt-2 text-xs text-gray-400">
          Итого: {positions.filter(p => p.is_active).length} активных,{' '}
          {positions.filter(p => !p.is_active).length} неактивных
        </p>
      </div>

      {/* Modals */}
      {showCreate && (
        <PositionFormModal
          onSave={() => { setShowCreate(false); load() }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {editPosition && (
        <PositionFormModal
          initial={editPosition}
          onSave={() => { setEditPosition(null); load() }}
          onClose={() => setEditPosition(null)}
        />
      )}

      {deactivateConfirm && (
        <DeactivateModal
          position={deactivateConfirm}
          onConfirm={() => handleDeactivate(deactivateConfirm)}
          onClose={() => setDeactivateConfirm(null)}
        />
      )}
    </div>
  )
}
