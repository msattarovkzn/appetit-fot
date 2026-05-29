import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-8">
      <h1 className="text-4xl font-bold text-brand">Аппетит</h1>
      <p className="text-gray-500 text-lg">Система учёта смен и ФОТ</p>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <Link href="/shift" className="flex flex-col items-center gap-2 p-6 bg-white rounded-2xl shadow hover:shadow-md transition-shadow">
          <span className="text-3xl">👤</span>
          <span className="font-semibold">Смены</span>
          <span className="text-sm text-gray-400">Открыть / закрыть</span>
        </Link>
        <Link href="/cashier" className="flex flex-col items-center gap-2 p-6 bg-white rounded-2xl shadow hover:shadow-md transition-shadow">
          <span className="text-3xl">💰</span>
          <span className="font-semibold">Кассир</span>
          <span className="text-sm text-gray-400">Закрытие дня</span>
        </Link>
        <Link href="/manager" className="flex flex-col items-center gap-2 p-6 bg-white rounded-2xl shadow hover:shadow-md transition-shadow">
          <span className="text-3xl">📊</span>
          <span className="font-semibold">Управляющий</span>
          <span className="text-sm text-gray-400">Дашборд / смены</span>
        </Link>
        <Link href="/admin" className="flex flex-col items-center gap-2 p-6 bg-white rounded-2xl shadow hover:shadow-md transition-shadow">
          <span className="text-3xl">🗂</span>
          <span className="font-semibold">Бухгалтерия</span>
          <span className="text-sm text-gray-400">ФОТ / сотрудники</span>
        </Link>
        <Link href="/schedule" className="flex flex-col items-center gap-2 p-6 bg-white rounded-2xl shadow hover:shadow-md transition-shadow col-span-2">
          <span className="text-3xl">📅</span>
          <span className="font-semibold">График смен</span>
          <span className="text-sm text-gray-400">Планирование по неделям</span>
        </Link>
      </div>
      <a href="/test"
        className="mt-4 flex items-center gap-2 px-5 py-3 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-800 hover:bg-yellow-100 transition-colors">
        <span className="text-xl">🧪</span>
        <div className="text-left">
          <p className="font-semibold text-sm">Тестовый сценарий</p>
          <p className="text-xs text-yellow-600">PIN-коды, логины, инструкция проверки</p>
        </div>
      </a>
    </main>
  )
}
