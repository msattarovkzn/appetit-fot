export default function TestScenarioPage() {
  const steps = [
    {
      num: 1,
      title: 'Открытие смен сотрудников',
      url: 'http://localhost:3000/shift',
      color: 'bg-green-50 border-green-200',
      items: [
        { label: 'Филиал', value: 'Челябинск' },
        { label: 'Действие', value: 'Открыть смену' },
        { label: 'PIN Повар 1 (Петров Алексей)', value: '2222' },
        { label: 'PIN Повар 2 (Сидорова Анна)', value: '3333' },
        { label: 'PIN Техперсонал (Козлов Дмитрий)', value: '4444' },
        { label: 'Ожидаем', value: 'Для каждого: «[ФИО], ваша смена открыта»' },
      ],
    },
    {
      num: 2,
      title: 'Кассир открывает смену',
      url: 'http://localhost:3000/cashier',
      color: 'bg-blue-50 border-blue-200',
      items: [
        { label: 'Филиал', value: 'Челябинск' },
        { label: 'Действие', value: 'Открыть смену' },
        { label: 'PIN кассира (Иванова Мария)', value: '1111' },
        { label: 'Ожидаем', value: '«Иванова Мария, ваша смена открыта. Хорошей работы!»' },
      ],
    },
    {
      num: 3,
      title: 'Проверяем открытые смены',
      url: 'http://localhost:3000/admin',
      color: 'bg-purple-50 border-purple-200',
      items: [
        { label: 'Логин / Пароль', value: 'owner / owner123' },
        { label: 'Вкладка', value: '🕐 Смены' },
        { label: 'Филиал', value: 'Челябинск' },
        { label: 'Дата', value: 'Сегодня' },
        { label: 'Ожидаем', value: '4 открытые смены со временем начала' },
      ],
    },
    {
      num: 4,
      title: 'Кассир закрывает смену + день',
      url: 'http://localhost:3000/cashier',
      color: 'bg-orange-50 border-orange-200',
      items: [
        { label: 'Филиал', value: 'Челябинск' },
        { label: 'Действие', value: 'Закрыть смену' },
        { label: 'PIN кассира', value: '1111' },
        { label: 'Выручка', value: '85 000' },
        { label: 'Заказы', value: '180' },
        { label: 'Выносы', value: '25' },
        { label: 'Ожидаем', value: '«Иванова Мария, ваша смена закрыта. День передан бухгалтеру.»' },
        { label: 'Бот', value: 'Уведомление с ⚠️ (3 сотрудника не закрыли смену)' },
      ],
    },
    {
      num: 5,
      title: 'Сотрудники закрывают смены',
      url: 'http://localhost:3000/shift',
      color: 'bg-gray-50 border-gray-200',
      items: [
        { label: 'Филиал', value: 'Челябинск' },
        { label: 'Действие', value: 'Закрыть смену' },
        { label: 'PIN', value: '2222, 3333, 4444 — каждый по очереди' },
        { label: 'Ожидаем', value: 'Для каждого: «[ФИО], ваша смена закрыта. Спасибо за смену!»' },
      ],
    },
    {
      num: 6,
      title: 'Смотрим расчёт ФОТ',
      url: 'http://localhost:3000/admin',
      color: 'bg-yellow-50 border-yellow-200',
      items: [
        { label: 'Логин', value: 'owner / owner123' },
        { label: 'Вкладка', value: '💰 ФОТ' },
        { label: 'Филиал / Период', value: 'Челябинск · Сегодня' },
        { label: 'Ожидаем строку', value: 'Дата | Выручка 85 000 ₽ | ФОТ общ. | % | Статус цветом' },
        { label: 'Пример расчёта', value: 'Выручка 85 000 · ФОТ план 29% = 24 650 ₽' },
      ],
    },
    {
      num: 7,
      title: 'Дашборд управляющего',
      url: 'http://localhost:3000/manager',
      color: 'bg-indigo-50 border-indigo-200',
      items: [
        { label: 'Логин', value: 'manager1 / manager123' },
        { label: 'Ожидаем', value: 'Строка по Челябинску с % ФОТ и цветовым статусом' },
        { label: 'Зелёный если', value: 'ФОТ < 27.5% · Кухня < 14.5%' },
        { label: 'Жёлтый если', value: 'ФОТ 27.5–29% · Кухня 14.5–15.5%' },
        { label: 'Красный если', value: 'ФОТ > 29% · Кухня > 15.5%' },
      ],
    },
  ]

  const pins = [
    { pin: '1111', name: 'Иванова Мария',  role: 'КАССИР', category: 'Администрация', rate: '200 р/ч' },
    { pin: '2222', name: 'Петров Алексей', role: 'Сотрудник', category: 'Кухня',          rate: '180 р/ч' },
    { pin: '3333', name: 'Сидорова Анна',  role: 'Сотрудник', category: 'Кухня',          rate: '160 р/ч' },
    { pin: '4444', name: 'Козлов Дмитрий', role: 'Сотрудник', category: 'Техперсонал',    rate: '150 р/ч' },
    { pin: '5555', name: 'Новиков Сергей', role: 'Сотрудник', category: 'Администрация',  rate: '190 р/ч' },
  ]

  const users = [
    { login: 'owner',       pass: 'owner123',      role: 'Владелец',    page: '/admin' },
    { login: 'manager1',    pass: 'manager123',    role: 'Управляющий', page: '/manager' },
    { login: 'accountant1', pass: 'accountant123', role: 'Бухгалтер',   page: '/admin' },
  ]

  return (
    <main className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mt-6 mb-2">
        <a href="/" className="text-sm text-gray-400 hover:text-gray-600">← Главная</a>
      </div>
      <h1 className="text-2xl font-bold text-brand mb-1">Тестовый сценарий MVP</h1>
      <p className="text-gray-500 mb-6">Пройдите шаги по порядку. Все данные — для филиала <strong>Челябинск</strong>.</p>

      {/* PIN-коды */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">📌 PIN-коды сотрудников</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left">PIN</th>
                <th className="px-4 py-3 text-left">ФИО</th>
                <th className="px-4 py-3 text-left">Роль</th>
                <th className="px-4 py-3 text-left">Категория</th>
                <th className="px-4 py-3 text-right">Ставка</th>
              </tr>
            </thead>
            <tbody>
              {pins.map(p => (
                <tr key={p.pin} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <code className="bg-gray-100 px-3 py-1 rounded-lg font-mono text-lg font-bold text-gray-800">{p.pin}</code>
                  </td>
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3">
                    {p.role === 'КАССИР'
                      ? <span className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-semibold">КАССИР</span>
                      : <span className="text-gray-500 text-xs">Сотрудник</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.category}</td>
                  <td className="px-4 py-3 text-right font-medium">{p.rate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Системные пользователи */}
      <section className="mb-8">
        <h2 className="text-lg font-semibold mb-3">🔑 Системные пользователи (логин/пароль)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {users.map(u => (
            <div key={u.login} className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="font-mono text-sm font-bold">{u.login} / {u.pass}</p>
              <p className="text-gray-500 text-xs mt-1">{u.role}</p>
              <a href={u.page} className="text-brand text-xs hover:underline">{u.page}</a>
            </div>
          ))}
        </div>
      </section>

      {/* Шаги */}
      <section>
        <h2 className="text-lg font-semibold mb-4">🚀 Сценарий проверки (7 шагов)</h2>
        <div className="flex flex-col gap-4">
          {steps.map(step => (
            <div key={step.num} className={`border rounded-xl p-5 ${step.color}`}>
              <div className="flex items-start gap-3 mb-3">
                <span className="flex-shrink-0 w-8 h-8 rounded-full bg-white border-2 border-gray-300 flex items-center justify-center font-bold text-gray-700">
                  {step.num}
                </span>
                <div>
                  <h3 className="font-semibold text-gray-800">{step.title}</h3>
                  <a href={step.url} target="_blank" className="text-xs text-brand hover:underline">{step.url}</a>
                </div>
              </div>
              <div className="ml-11 flex flex-col gap-1.5">
                {step.items.map((item, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="text-gray-500 min-w-[180px] flex-shrink-0">{item.label}:</span>
                    <span className="font-medium text-gray-800">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Расчёт ФОТ вручную */}
      <section className="mt-8 p-5 bg-gray-50 border border-gray-200 rounded-xl">
        <h2 className="text-lg font-semibold mb-3">🧮 Ожидаемый расчёт ФОТ (при выручке 85 000 ₽, 180 заказов)</h2>
        <div className="text-sm text-gray-700 flex flex-col gap-2">
          <p><strong>Иванова Мария</strong> (Адм. 200 р/ч): часы × 200 + бонус. Вт → 180 заказов × 7 = 1 260 ₽ бонус</p>
          <p><strong>Петров Алексей</strong> (Кухня 180 р/ч): часы × 180</p>
          <p><strong>Сидорова Анна</strong> (Кухня 160 р/ч): часы × 160</p>
          <p><strong>Козлов Дмитрий</strong> (Техн. 150 р/ч): часы × 150</p>
          <hr className="my-2" />
          <p><strong>ФОТ план = 85 000 × 29% = 24 650 ₽</strong></p>
          <p><strong>Кухня план = 85 000 × 15.5% = 13 175 ₽</strong></p>
        </div>
      </section>
    </main>
  )
}
