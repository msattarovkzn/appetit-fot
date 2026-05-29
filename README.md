# Аппетит — Система учёта ФОТ и смен

Внутренняя система для сети доставки еды. Учёт смен по PIN, закрытие дня кассиром, расчёт ФОТ, дашборды, уведомления в Telegram.

## Стек

- **Frontend**: Next.js 14, Tailwind CSS, TypeScript → Vercel
- **Backend**: FastAPI, SQLAlchemy 2.0 async → Timeweb Cloud
- **Database**: PostgreSQL 15
- **Notifications**: Telegram Bot API

## Быстрый старт (локально)

### 1. Копируем конфиг

```bash
cp .env.example .env
```

Заполните `.env`:
- `POSTGRES_PASSWORD` — придумайте пароль
- `SECRET_KEY` — случайная строка 32+ символа
- `TELEGRAM_BOT_TOKEN` — токен от @BotFather
- `TELEGRAM_CHAT_ID` — ID группы/канала для уведомлений

### 2. Запуск через Docker Compose

```bash
docker compose up -d
```

Миграции запускаются автоматически при старте backend.

### 3. Создание первого пользователя (owner)

```bash
docker compose exec backend python create_owner.py
```

### 4. Открываем браузер

| URL | Назначение |
|-----|-----------|
| http://localhost:3000/shift | Экран сотрудников (PIN) |
| http://localhost:3000/cashier | Кассир — закрытие дня |
| http://localhost:3000/manager | Управляющий — дашборд |
| http://localhost:3000/admin | Бухгалтерия — ФОТ |
| http://localhost:8000/docs | Swagger API документация |

## Локальная разработка (без Docker)

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
# Создайте .env в папке backend
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
# Создайте .env.local с NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

## Структура проекта

```
appetit/
├── backend/
│   ├── app/
│   │   ├── models/          # SQLAlchemy модели
│   │   ├── schemas/         # Pydantic схемы
│   │   ├── routers/         # FastAPI роутеры
│   │   ├── services/        # Бизнес-логика (ФОТ, бот, аудит)
│   │   └── utils/           # Безопасность (bcrypt, JWT)
│   ├── alembic/             # Миграции БД
│   └── create_owner.py      # Скрипт создания владельца
├── frontend/
│   └── src/
│       ├── app/             # Next.js страницы
│       ├── components/      # PinPad и др.
│       └── lib/api.ts       # API клиент
├── docker-compose.yml
└── .env.example
```

## Роли и доступ

| Роль | Экран | Возможности |
|------|-------|-------------|
| employee | /shift | Открыть/закрыть смену по PIN |
| cashier | /cashier | Закрыть день (выручка/заказы/выносы) |
| manager | /manager | Дашборд, просмотр смен, утверждение часов |
| accountant | /admin | ФОТ, исправление прошлых дней, ставки |
| owner | /admin | Всё включая пользователей |

## Расчёт ФОТ

**Почасовой**: `approved_hours × rate`

**Фиксированный**: `fixed_daily_rate`

**Администратор**: `hours × rate + bonus`
- Бонус Пн–Чт, Вс: `orders × 7 ₽`
- Бонус Пт–Сб: `orders × 5 ₽`

**KPI цвета (общий ФОТ%)**:
- 🟢 < 27.5% — норма
- 🟡 27.5–29% — граница
- 🔴 > 29% — превышение

**KPI цвета (кухня)**:
- 🟢 < 14.5% — норма
- 🟡 14.5–15.5% — граница
- 🔴 > 15.5% — превышение

## Деплой

### Backend (Timeweb Cloud)

1. Создайте сервер Ubuntu 22.04
2. Установите Docker + Docker Compose
3. Скопируйте проект, заполните `.env`
4. `docker compose up -d`

### Frontend (Vercel)

1. Подключите GitHub репозиторий
2. Установите `NEXT_PUBLIC_API_URL=https://ваш-домен`
3. Деплой автоматический

## Telegram Bot

1. Создайте бота у @BotFather → скопируйте токен
2. Добавьте бота в группу/канал
3. Получите chat_id: отправьте любое сообщение боту, затем `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Заполните `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID` в `.env`
