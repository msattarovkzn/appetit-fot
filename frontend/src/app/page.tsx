import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-6 p-8 bg-gray-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-brand">Аппетит</h1>
        <p className="text-gray-400 text-sm mt-1">Система учёта смен и ФОТ</p>
      </div>

      {/* Основные разделы */}
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        <Link href="/shift"
          className="flex flex-col items-center gap-2 p-5 bg-white rounded-2xl shadow hover:shadow-md transition-shadow">
          <span className="text-3xl">👤</span>
          <span className="font-semibold text-sm">Смены</span>
          <span className="text-xs text-gray-400">Открыть / закрыть</span>
        </Link>
        <Link href="/cashier"
          className="flex flex-col items-center gap-2 p-5 bg-white rounded-2xl shadow hover:shadow-md transition-shadow">
          <span className="text-3xl">💰</span>
          <span className="font-semibold text-sm">Кассир</span>
          <span className="text-xs text-gray-400">Закрытие дня</span>
        </Link>
        <Link href="/manager"
          className="flex flex-col items-center gap-2 p-5 bg-white rounded-2xl shadow hover:shadow-md transition-shadow">
          <span className="text-3xl">📊</span>
          <span className="font-semibold text-sm">Управляющий</span>
          <span className="text-xs text-gray-400">Дашборд / ФОТ</span>
        </Link>
        <Link href="/admin"
          className="flex flex-col items-center gap-2 p-5 bg-white rounded-2xl shadow hover:shadow-md transition-shadow">
          <span className="text-3xl">🗂</span>
          <span className="font-semibold text-sm">Бухгалтерия</span>
          <span className="text-xs text-gray-400">ФОТ / сотрудники</span>
        </Link>
      </div>

      {/* Live мониторинг */}
      <Link href="/live"
        className="flex items-center gap-3 px-5 py-3.5 bg-gray-900 text-white rounded-2xl hover:bg-gray-800 transition-colors w-full max-w-sm">
        <span className="w-2.5 h-2.5 bg-green-400 rounded-full animate-pulse shrink-0" />
        <div>
          <p className="font-semibold text-sm">Кто сейчас на смене</p>
          <p className="text-xs text-gray-400">Все филиалы в реальном времени</p>
        </div>
      </Link>

      {/* Дополнительные разделы */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
        <Link href="/schedule"
          className="flex flex-col items-center gap-1.5 p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <span className="text-2xl">📅</span>
          <span className="font-semibold text-xs text-center">График</span>
        </Link>
        <Link href="/analytics"
          className="flex flex-col items-center gap-1.5 p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <span className="text-2xl">📈</span>
          <span className="font-semibold text-xs text-center">Аналитика</span>
        </Link>
        <Link href="/employee"
          className="flex flex-col items-center gap-1.5 p-4 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow">
          <span className="text-2xl">👤</span>
          <span className="font-semibold text-xs text-center">Кабинет</span>
        </Link>
      </div>
    </main>
  )
}
