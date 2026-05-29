'use client'
import { useState } from 'react'

interface Props {
  onSubmit: (pin: string) => Promise<void>
  label: string
  loading?: boolean
}

export default function PinPad({ onSubmit, label, loading }: Props) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const handleDigit = (d: string) => {
    if (pin.length < 6) setPin(p => p + d)
  }

  const handleClear = () => { setPin(''); setError('') }

  const handleSubmit = async () => {
    if (pin.length < 4) { setError('PIN слишком короткий'); return }
    setError('')
    try {
      await onSubmit(pin)
    } catch (e: any) {
      setError(e.message || 'Ошибка')
    } finally {
      setPin('')
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-3 mb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 ${i < pin.length ? 'bg-brand border-brand' : 'border-gray-400'}`} />
        ))}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="grid grid-cols-3 gap-3">
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
          <button
            key={i}
            onClick={() => {
              if (d === '⌫') setPin(p => p.slice(0, -1))
              else if (d !== '') handleDigit(d)
            }}
            disabled={d === ''}
            className="w-16 h-16 rounded-full text-xl font-semibold bg-gray-100 hover:bg-gray-200 active:bg-gray-300 disabled:invisible transition-colors"
          >
            {d}
          </button>
        ))}
      </div>

      <div className="flex gap-3 mt-2">
        <button
          onClick={handleClear}
          className="px-6 py-3 rounded-xl bg-gray-200 hover:bg-gray-300 font-medium transition-colors"
        >
          Сброс
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading || pin.length < 4}
          className="px-6 py-3 rounded-xl bg-brand text-white font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Загрузка...' : label}
        </button>
      </div>
    </div>
  )
}
