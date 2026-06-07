'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

export default function ChangePasswordButton() {
  const [open, setOpen] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  const close = () => {
    setOpen(false)
    setOldPassword('')
    setNewPassword('')
    setError('')
    setSuccess(false)
  }

  const submit = async () => {
    setError('')
    setSuccess(false)
    setSaving(true)
    try {
      await api.changePassword(oldPassword, newPassword)
      setSuccess(true)
      setOldPassword('')
      setNewPassword('')
    } catch (e: any) {
      setError(e.message || 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-sm text-gray-400 hover:text-gray-600">Сменить пароль</button>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={close}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-xs flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <h2 className="font-semibold text-gray-800">Сменить пароль</h2>
        <input type="password" placeholder="Текущий пароль" value={oldPassword}
          onChange={e => setOldPassword(e.target.value)}
          className="border rounded-xl px-4 py-2.5 text-sm" />
        <input type="password" placeholder="Новый пароль (мин. 6 символов)" value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          className="border rounded-xl px-4 py-2.5 text-sm" />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {success && <p className="text-green-600 text-sm">Пароль изменён</p>}
        <div className="flex gap-2">
          <button onClick={close} className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-gray-50">Закрыть</button>
          <button onClick={submit} disabled={saving || !oldPassword || !newPassword}
            className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
