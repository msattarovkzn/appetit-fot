# Деплой — Аппетит ФОТ

## Варианты деплоя

| Вариант | Бэкенд | Фронтенд |
|---------|--------|----------|
| **A — Docker Compose** (рекомендуется) | VPS / Timeweb (Docker) | Встроен в compose |
| **B — Раздельный** | VPS / Timeweb (Docker) | Vercel |

---

## Вариант A — Docker Compose (полностью на сервере)

### Требования к серверу

- Docker + Docker Compose v2
- 1 ГБ RAM, 10 ГБ диск
- Открытые порты: 3000 (frontend), 8000 (backend), 5432 (опционально, только для DBA)

### 1. Клонирование и настройка

```bash
git clone <repo-url> appetit-fot
cd appetit-fot

cp .env.example .env
nano .env   # заполните все переменные
```

### 2. Обязательные переменные .env

```ini
# БД
POSTGRES_DB=appetit
POSTGRES_USER=appetit_user
POSTGRES_PASSWORD=<сложный_пароль>

# Бэкенд
DATABASE_URL=postgresql+asyncpg://appetit_user:<пароль>@db:5432/appetit
SECRET_KEY=<минимум_32_символа_случайные>
ACCESS_TOKEN_EXPIRE_MINUTES=480

# Telegram (для уведомлений при закрытии дня)
TELEGRAM_BOT_TOKEN=<токен_от_BotFather>
TELEGRAM_CHAT_ID=<id_группы>

# Фронтенд — адрес API, доступный из браузера
NEXT_PUBLIC_API_URL=http://<IP_или_домен_сервера>:8000

# Режим окружения
ENVIRONMENT=production
NEXT_PUBLIC_TEST_MODE=false
```

> **Важно:** `NEXT_PUBLIC_API_URL` бакируется в сборку Next.js.
> Если меняете IP/домен — нужно пересобрать образ frontend.

### 3. Первый запуск

```bash
docker compose build
docker compose up -d

# Проверить логи
docker compose logs -f backend
docker compose logs -f frontend
```

Миграции запускаются **автоматически** при старте backend (команда в compose):
```
alembic upgrade head && uvicorn app.main:app ...
```

### 4. Проверка

```bash
# Бэкенд жив
curl http://localhost:8000/health
# → {"status":"ok"}

# Фронтенд
curl -I http://localhost:3000
# → HTTP/1.1 200 OK
```

Откройте в браузере: `http://<IP_сервера>:3000`

### 5. Обновление (новые версии)

```bash
git pull
docker compose build backend   # если изменился бэкенд
docker compose build frontend  # если изменился фронтенд или NEXT_PUBLIC_API_URL
docker compose up -d
```

---

## Вариант B — Бэкенд на Timeweb, Фронтенд на Vercel

### Бэкенд (Timeweb / любой VPS с Docker)

Шаги 1–4 из Варианта A, **но** в `docker-compose.yml` уберите сервис `frontend`:

```bash
docker compose up -d db backend
```

Убедитесь что порт 8000 доступен снаружи (firewall / группа безопасности).

### Фронтенд (Vercel)

1. Форкните / добавьте репозиторий в Vercel
2. **Root Directory:** `frontend`
3. **Build Command:** `npm run build`
4. **Environment Variables** в Vercel dashboard:

   | Переменная | Значение |
   |-----------|---------|
   | `NEXT_PUBLIC_API_URL` | `https://<ваш-домен-или-ip>:8000` |
   | `NEXT_PUBLIC_TEST_MODE` | `false` |

5. Deploy → Vercel автоматически пересобирает при пуше в main.

> **Примечание:** Vercel требует HTTPS на бэкенде (или отдельный nginx-прокси).

---

## Администрирование

### Создание первых пользователей

Пользователи (бухгалтер, собственник) создаются напрямую в БД:

```bash
docker compose exec db psql -U appetit_user -d appetit
```

```sql
-- Пример создания пользователя (пароль хешируется bcrypt отдельно)
INSERT INTO users (username, password_hash, role, full_name, branch_id)
VALUES ('accountant1', '<bcrypt_hash>', 'accountant', 'Иванова Анна', NULL);
```

Или через скрипт в контейнере бэкенда:

```bash
docker compose exec backend python -c "
from app.utils.security import hash_password
print(hash_password('ваш_пароль'))
"
```

### Резервное копирование БД

```bash
docker compose exec db pg_dump -U appetit_user appetit > backup_$(date +%Y%m%d).sql
```

Восстановление:

```bash
cat backup_20260101.sql | docker compose exec -T db psql -U appetit_user appetit
```

---

## Роли пользователей

| Роль | Доступ |
|------|--------|
| `employee` | Только смены |
| `cashier` | Смены + закрытие дня |
| `manager` | Дашборд + смены |
| `accountant` | Бухгалтерия + **управление сотрудниками/должностями** |
| `owner` | Всё + управление |

Страница управления сотрудниками: `/admin/employees`
Страница управления должностями: `/admin/positions`

---

## Структура миграций

| Файл | Что добавляет |
|------|--------------|
| 001 | Начальная схема |
| 002 | `employees.is_cashier` |
| 003 | `shifts.total_minutes` |
| 004 | `schedule_plans` |
| 005 | `employees.pin_check`, `employees.comment`, `positions.is_active`, `employee_rates.date_to` |

---

## Частые проблемы

### Фронтенд не может достучаться до API
- `NEXT_PUBLIC_API_URL` указывает на `localhost` — нужно поставить реальный IP/домен
- Пересоберите образ: `docker compose build frontend && docker compose up -d frontend`

### Ошибка 409 "PIN уже используется"
- В одном филиале два сотрудника не могут иметь одинаковый PIN
- Проверьте таблицу: `SELECT pin_check, branch_id FROM employees WHERE is_active=true`

### Миграции не применились
```bash
docker compose exec backend alembic current
docker compose exec backend alembic upgrade head
```

### Telegram уведомления не приходят
- Проверьте `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`
- Бот должен быть добавлен в группу и иметь права на отправку сообщений
