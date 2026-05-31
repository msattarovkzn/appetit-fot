'use client'
import { useState, useEffect, useCallback } from 'react'

const TZ = 'Asia/Yekaterinburg'
const CAT_RU: Record<string, string> = {
  kitchen: 'Кухня', admin: 'Администрация', tech: 'Техперсонал',
  courier: 'Курьеры', reserve: 'Резерв',
}
const CAT_COLOR: Record<string, string> = {
  kitchen: 'bg-orange-100 text-orange-700',
  admin: 'bg-blue-100 text-blue-700',
  tech: 'bg-purple-100 text-purple-700',
  courier: 'bg-green-100 text-green-700',
  reserve: 'bg-gray-100 text-gray-600',
}

function fmtTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit', minute: '2-digit', timeZone: TZ,
  })
}

function fmtDuration(minutes: number | null) {
  if (minutes == null || minutes < 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} мин`
  if (m === 0) return `${h} ч`
  return `${h} ч ${m} мин`
}

type ShiftEntry = {
  id: number
  employee_name: string
  position: string
  category: string
  is_extra_shift: boolean
  opened_at: string | null
  minutes_on: number | null
}

type BranchEntry = {
  branch_id: number
  branch_name: string
  shifts: ShiftEntry[]
  active_count: number
}

type LiveData = {
  as_of: string
  branches: BranchEntry[]
  total_on_shift: number
}

const BASE = '/proxy'

export default function LivePage() {
  const [data, setData] = useState<LiveData | null>(null)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/shifts/live`)
      if (!res.ok) throw new Error('Ошибка загрузки')
      const json = await res.json()
      setData(json)
      setLastUpdate(new Date())
      setError('')
    } catch (e: any) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
    // Обновляем каждые 30 секунд
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [load])

  const totalOnShift = data?.total_on_shift ?? 0
  const branchesWithShifts = data?.branches.filter(b => b.active_count > 0).length ?? 0

  return (
    <main className="min-h-screen bg-gray-900 text-white p-4">
      {/* Шапка */}
      <div className="flex items-center justify-between mb-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
          <h1 className="text-2xl font-bold">Сотрудники на смене</h1>
        </div>
        <div className="text-right">
          {lastUpdate && (
            <p className="text-sm text-gray-400">
              Обновлено: {lastUpdate.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ })}
            </p>
          )}
          <p className="text-xs text-gray-500">Авто-обновление каждые 30 сек</p>
        </div>
      </div>

      {error && (
        <div className="max-w-6xl mx-auto mb-4 p-3 bg-red-900/50 border border-red-700 rounded-xl text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Сводка */}
      {data && (
        <div className="max-w-6xl mx-auto grid grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-800 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-green-400">{totalOnShift}</p>
            <p className="text-sm text-gray-400 mt-1">Сейчас на смене</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-blue-400">{branchesWithShifts}</p>
            <p className="text-sm text-gray-400 mt-1">Активных филиалов</p>
          </div>
          <div className="bg-gray-800 rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-gray-300">
              {new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}
            </p>
            <p className="text-sm text-gray-400 mt-1">Время (Екатеринбург)</p>
          </div>
        </div>
      )}

      {/* Филиалы */}
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data?.branches.map(branch => (
          <div key={branch.branch_id}
            className={`rounded-xl border overflow-hidden ${
              branch.active_count > 0
                ? 'bg-gray-800 border-gray-600'
                : 'bg-gray-850 border-gray-700 opacity-50'
            }`}>

            {/* Заголовок филиала */}
            <div className={`px-4 py-3 flex items-center justify-between ${
              branch.active_count > 0 ? 'bg-gray-700' : 'bg-gray-800'
            }`}>
              <h2 className="font-semibold text-base">{branch.branch_name}</h2>
              <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${
                branch.active_count > 0
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-600 text-gray-400'
              }`}>
                {branch.active_count > 0 ? `${branch.active_count} чел.` : 'нет смен'}
              </span>
            </div>

            {/* Список сотрудников */}
            {branch.shifts.length > 0 ? (
              <div className="divide-y divide-gray-700">
                {branch.shifts.map(s => (
                  <div key={s.id} className="px-4 py-3 flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm text-white">{s.employee_name}</p>
                        {s.is_extra_shift && (
                          <span className="text-xs bg-yellow-600/30 text-yellow-400 px-1.5 py-0.5 rounded">
                            доп.
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${CAT_COLOR[s.category] ?? 'bg-gray-700 text-gray-300'}`}>
                          {CAT_RU[s.category] ?? s.category}
                        </span>
                        <p className="text-xs text-gray-400">{s.position}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-green-400">
                        с {fmtTime(s.opened_at)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {fmtDuration(s.minutes_on)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-6 text-center text-gray-500 text-sm">
                Нет открытых смен
              </div>
            )}
          </div>
        ))}
      </div>

      {!data && !error && (
        <div className="flex items-center justify-center h-48 text-gray-500">
          Загрузка...
        </div>
      )}

      {/* Кнопка обновить */}
      <div className="max-w-6xl mx-auto mt-6 text-center">
        <button onClick={load}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-sm rounded-xl transition-colors">
          🔄 Обновить сейчас
        </button>
      </div>
    </main>
  )
}
