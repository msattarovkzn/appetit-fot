'use client'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'

const STATUS_STYLE: Record<string, string> = {
  red:    'bg-red-50 border-red-200 text-red-800',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  green:  'bg-green-50 border-green-200 text-green-800',
}
const STATUS_EMOJI: Record<string, string> = { red: '🔴', yellow: '🟡', green: '🟢' }
const STATUS_LABEL: Record<string, string> = {
  red: 'Требует внимания', yellow: 'Ожидает проверки', green: 'Проверен',
}
const ANOMALY_STYLE: Record<string, string> = {
  warning:  'bg-yellow-100 text-yellow-800 border-yellow-300',
  critical: 'bg-red-100 text-red-800 border-red-300',
}

function fmtDT(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}
function yesterday() {
  return new Date(Date.now() - 86400000).toISOString().slice(0, 10)
}

type BranchSummary = {
  branch_id: number; branch_name: string; date: string
  status: string; emoji: string
  issues_count: number; issues: string[]; issues_labels: string[]
  reviewed_by: string | null; reviewed_at: string | null
}

type ReviewDetail = Awaited<ReturnType<typeof api.reviewDetail>>

export default function ReviewPage() {
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => { setToken(localStorage.getItem('token')) }, [])

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')

  const [reviewDate, setReviewDate] = useState(yesterday())
  const [branches, setBranches] = useState<BranchSummary[]>([])
  const [loading, setLoading] = useState(false)

  // Детальная панель
  const [selected, setSelected] = useState<BranchSummary | null>(null)
  const [detail, setDetail] = useState<ReviewDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  // Модалка разрешения аномалии
  const [resolveShift, setResolveShift] = useState<ReviewDetail['shifts'][0] | null>(null)
  const [resolveHours, setResolveHours] = useState('')
  const [resolveComment, setResolveComment] = useState('')
  const [resolveSaving, setResolveSaving] = useState(false)

  // Примечание для подтверждения
  const [verifyNotes, setVerifyNotes] = useState('')
  const [verifying, setVerifying] = useState(false)

  const handleLogin = async () => {
    setLoginError('')
    try {
      const res = await api.login(username, password)
      localStorage.setItem('token', res.access_token)
      setToken(res.access_token)
    } catch (e: any) { setLoginError(e.message) }
  }

  const loadBranches = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await api.reviewList(reviewDate)
      setBranches(data.branches)
    } catch {} finally { setLoading(false) }
  }, [token, reviewDate])

  useEffect(() => { loadBranches() }, [loadBranches])

  const openDetail = async (branch: BranchSummary) => {
    setSelected(branch)
    setDetail(null)
    setDetailLoading(true)
    try {
      const d = await api.reviewDetail(branch.branch_id, reviewDate)
      setDetail(d)
    } catch {} finally { setDetailLoading(false) }
  }

  const handleVerify = async () => {
    if (!selected) return
    setVerifying(true)
    try {
      await api.reviewVerify(selected.branch_id, reviewDate, verifyNotes || undefined)
      setVerifyNotes('')
      await loadBranches()
      if (detail) {
        const d = await api.reviewDetail(selected.branch_id, reviewDate)
        setDetail(d)
      }
    } catch (e: any) { alert(e.message) } finally { setVerifying(false) }
  }

  const handleReopen = async () => {
    if (!selected) return
    try {
      await api.reviewReopen(selected.branch_id, reviewDate)
      await loadBranches()
      const d = await api.reviewDetail(selected.branch_id, reviewDate)
      setDetail(d)
    } catch (e: any) { alert(e.message) }
  }

  const handleResolve = async () => {
    if (!resolveShift) return
    setResolveSaving(true)
    try {
      await api.reviewResolveAnomaly(
        resolveShift.id,
        resolveHours ? parseFloat(resolveHours) : undefined,
        resolveComment || undefined,
      )
      setResolveShift(null)
      if (selected) {
        const d = await api.reviewDetail(selected.branch_id, reviewDate)
        setDetail(d)
        await loadBranches()
      }
    } catch (e: any) { alert(e.message) } finally { setResolveSaving(false) }
  }

  const redCount = branches.filter(b => b.status === 'red').length
  const yellowCount = branches.filter(b => b.status === 'yellow').length
  const greenCount = branches.filter(b => b.status === 'green').length

  if (!token) return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-4 p-6">
      <h1 className="text-2xl font-bold text-brand">Проверка дней</h1>
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

  return (
    <main className="p-4 max-w-6xl mx-auto">
      {/* Шапка */}
      <div className="flex justify-between items-center mb-5 mt-4">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-gray-400 hover:text-gray-600 text-sm">← Назад</a>
          <h1 className="text-2xl font-bold text-brand">Проверка дней</h1>
        </div>
        <button onClick={() => { localStorage.removeItem('token'); setToken(null) }}
          className="text-sm text-gray-400 hover:text-gray-600">Выйти</button>
      </div>

      {/* Фильтр даты */}
      <div className="flex flex-wrap gap-3 items-end mb-5">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-500">Дата</span>
          <input type="date" value={reviewDate} onChange={e => setReviewDate(e.target.value)}
            className="border rounded-lg px-3 py-2" />
        </label>
        <button onClick={loadBranches} disabled={loading}
          className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50">
          {loading ? 'Загрузка...' : 'Обновить'}
        </button>

        {/* Сводка */}
        {branches.length > 0 && (
          <div className="ml-auto flex gap-3 text-sm">
            {redCount > 0 && <span className="flex items-center gap-1 text-red-600 font-semibold">🔴 {redCount}</span>}
            {yellowCount > 0 && <span className="flex items-center gap-1 text-yellow-600 font-semibold">🟡 {yellowCount}</span>}
            {greenCount > 0 && <span className="flex items-center gap-1 text-green-600 font-semibold">🟢 {greenCount}</span>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Список филиалов */}
        <div className="space-y-2">
          {branches.map(b => (
            <button key={b.branch_id}
              onClick={() => openDetail(b)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                STATUS_STYLE[b.status] ?? ''
              } ${selected?.branch_id === b.branch_id ? 'ring-2 ring-brand ring-offset-1' : 'hover:shadow-md'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-semibold text-base">
                    {STATUS_EMOJI[b.status]} {b.branch_name}
                    {b.issues_count > 0 && (
                      <span className="ml-2 text-sm font-bold">({b.issues_count})</span>
                    )}
                  </span>
                  <p className="text-xs mt-0.5 opacity-70">{STATUS_LABEL[b.status]}</p>
                </div>
                {b.reviewed_by && (
                  <span className="text-xs opacity-60 text-right">
                    ✓ {b.reviewed_by}<br />
                    {b.reviewed_at ? fmtDT(b.reviewed_at) : ''}
                  </span>
                )}
              </div>
              {b.issues_labels.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {b.issues_labels.map((label, i) => (
                    <li key={i} className="text-xs flex items-center gap-1">
                      <span>•</span> {label}
                    </li>
                  ))}
                </ul>
              )}
            </button>
          ))}
          {branches.length === 0 && !loading && (
            <p className="text-center text-gray-400 py-8">Нет данных</p>
          )}
        </div>

        {/* Детальная панель */}
        <div>
          {selected && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="font-bold text-lg">{selected.branch_name}</h2>
                  <p className="text-sm text-gray-500">{reviewDate}</p>
                </div>
                <div className="flex gap-2">
                  {detail?.status === 'green' ? (
                    <button onClick={handleReopen}
                      className="text-xs px-3 py-1.5 border rounded-lg text-yellow-700 border-yellow-300 hover:bg-yellow-50">
                      🔄 Переоткрыть
                    </button>
                  ) : (
                    <button onClick={handleVerify} disabled={verifying}
                      className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium">
                      {verifying ? '...' : '✅ Проверка завершена'}
                    </button>
                  )}
                </div>
              </div>

              {detailLoading && <p className="text-gray-400 text-sm py-4 text-center">Загрузка...</p>}

              {detail && (
                <>
                  {/* Проблемы */}
                  {detail.issues_labels.length > 0 && (
                    <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                      <p className="text-xs font-semibold text-red-700 mb-1">Замечания:</p>
                      <ul className="space-y-0.5">
                        {detail.issues_labels.map((l, i) => (
                          <li key={i} className="text-xs text-red-600">• {l}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {detail.status === 'green' && (
                    <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200 text-xs text-green-700">
                      ✅ Проверен
                      {detail.reviewed_at && ` · ${fmtDT(detail.reviewed_at)}`}
                    </div>
                  )}

                  {/* Примечание при подтверждении */}
                  {detail.status !== 'green' && (
                    <div className="mb-4">
                      <input
                        type="text"
                        placeholder="Примечание к проверке (необязательно)"
                        value={verifyNotes}
                        onChange={e => setVerifyNotes(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  )}

                  {/* Смены */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Смены</p>
                    {detail.shifts.map(s => (
                      <div key={s.id}
                        className={`p-3 rounded-lg border text-sm ${
                          s.status === 'open'
                            ? 'bg-red-50 border-red-200'
                            : s.anomaly_flag && !s.anomaly_resolved
                              ? ANOMALY_STYLE[s.anomaly_flag] + ' border'
                              : 'bg-gray-50 border-gray-200'
                        }`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-medium">{s.employee_name}</span>
                            {s.is_extra_shift && (
                              <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                +доп. смена
                              </span>
                            )}
                            {s.is_corrected && (
                              <span className="ml-1 text-xs text-yellow-600">✏️</span>
                            )}
                          </div>
                          <div className="text-xs text-right text-gray-500">
                            {fmtDT(s.opened_at)} – {fmtDT(s.closed_at)}
                            {s.hours != null && <span className="ml-1 font-medium">{s.hours} ч</span>}
                          </div>
                        </div>

                        {/* Аномалия */}
                        {s.anomaly_flag && !s.anomaly_resolved && (
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold">
                              {s.anomaly_flag === 'critical' ? '🚨 Критично (>16 ч)' : '⚠️ Предупреждение (>14 ч)'}
                            </span>
                            <button
                              onClick={() => {
                                setResolveShift(s)
                                setResolveHours(String(s.hours ?? ''))
                                setResolveComment('')
                              }}
                              className="text-xs px-2 py-1 bg-white border rounded hover:bg-gray-50">
                              Разрешить
                            </button>
                          </div>
                        )}
                        {s.anomaly_flag && s.anomaly_resolved && (
                          <p className="mt-1 text-xs opacity-60">✓ Аномалия разрешена</p>
                        )}

                        {s.extra_shift_reason && (
                          <p className="mt-1 text-xs opacity-70">Причина: {s.extra_shift_reason}</p>
                        )}
                        {s.note && (
                          <p className="mt-1 text-xs opacity-70">Заметка: {s.note}</p>
                        )}
                      </div>
                    ))}
                    {detail.shifts.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">Смен нет</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {!selected && (
            <div className="flex items-center justify-center h-48 text-gray-300 text-sm">
              ← Выберите филиал
            </div>
          )}
        </div>
      </div>

      {/* Модалка разрешения аномалии */}
      {resolveShift && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) setResolveShift(null) }}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold mb-1">
              {resolveShift.anomaly_flag === 'critical' ? '🚨 Критичная смена' : '⚠️ Аномальная смена'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {resolveShift.employee_name} · {resolveShift.hours} ч
            </p>

            <label className="flex flex-col gap-1 text-sm mb-3">
              <span className="text-gray-600 font-medium">Скорректировать часы (необязательно)</span>
              <input type="number" step="0.5" min="0" max="24"
                value={resolveHours}
                onChange={e => setResolveHours(e.target.value)}
                className="border rounded-lg px-3 py-2 font-semibold text-lg focus:border-brand outline-none"
                placeholder="Оставить как есть"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm mb-5">
              <span className="text-gray-600 font-medium">Комментарий</span>
              <input type="text"
                value={resolveComment}
                onChange={e => setResolveComment(e.target.value)}
                className="border rounded-lg px-3 py-2 focus:border-brand outline-none"
                placeholder="Причина/объяснение"
              />
            </label>

            <div className="flex gap-2">
              <button onClick={() => setResolveShift(null)}
                className="flex-1 py-2.5 border rounded-xl text-gray-600 hover:bg-gray-50">
                Отмена
              </button>
              <button onClick={handleResolve} disabled={resolveSaving}
                className="flex-1 py-2.5 bg-brand text-white rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50">
                {resolveSaving ? '...' : 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
