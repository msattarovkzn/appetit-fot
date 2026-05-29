# Деплой STAGING — Аппетит ФОТ

> **STAGING** — тестовая среда для проверки бухгалтером и собственником.  
> Тестовый режим включён. Боты не подключены. Только филиал Челябинск.  
> НЕ использовать как production.

---

## Архитектура

```
Браузер → Vercel (Next.js) → Timeweb Cloud (FastAPI) → Timeweb Cloud (PostgreSQL)
```

---

## Шаг 1 — Загрузить проект в GitHub

```bash
# 1. Создать репозиторий на GitHub (например appetit-fot)
# 2. Инициализировать и залить:

git init
git add .
git commit -m "feat: initial staging setup"
git remote add origin https://github.com/<ВАШ_АККАУНТ>/appetit-fot.git
git push -u origin main
```

> Убедитесь что `.env` есть в `.gitignore` — он не должен попасть в репозиторий.

---

## Шаг 2 — PostgreSQL на Timeweb Cloud

1. Зайти в панель Timeweb Cloud → **Базы данных** → **Создать PostgreSQL**
2. Выбрать версию **15**
3. Записать данные подключения:

```
Хост:     <хост>.timeweb.cloud  (например db-12345.timeweb.cloud)
Порт:     5432
БД:       appetit
Пользователь: appetit_user
Пароль:   <сгенерировать>
```

4. В разделе **Сети** разрешить подключение с IP вашего Timeweb-сервера.

---

## Шаг 3 — Backend на Timeweb Cloud (Docker)

### 3.1 Создать облачный сервер

- Тип: **Docker** или **Ubuntu 22.04 + Docker**
- RAM: 1 ГБ минимум
- Открыть порт **8000** в firewall

### 3.2 Подключиться по SSH и склонировать репозиторий

```bash
ssh root@<IP_СЕРВЕРА>

git clone https://github.com/<ВАШ_АККАУНТ>/appetit-fot.git
cd appetit-fot
```

### 3.3 Создать файл `.env`

```bash
nano .env
```

Содержимое `.env` для staging:

```ini
# ── База данных ──────────────────────────────────────────────────────────────
POSTGRES_DB=appetit
POSTGRES_USER=appetit_user
POSTGRES_PASSWORD=<пароль_из_шага_2>

# Используем внешнюю БД Timeweb (не docker-сервис db)
DATABASE_URL=postgresql+asyncpg://appetit_user:<пароль>@<хост>.timeweb.cloud:5432/appetit

# ── Безопасность ─────────────────────────────────────────────────────────────
SECRET_KEY=<минимум_32_случайных_символа>
ACCESS_TOKEN_EXPIRE_MINUTES=480

# ── Окружение ─────────────────────────────────────────────────────────────────
ENVIRONMENT=staging

# ── Telegram (пока не подключать) ─────────────────────────────────────────────
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# ── Frontend (URL, который видят браузеры пользователей) ──────────────────────
# Заполнить ПОСЛЕ деплоя на Vercel (шаг 4)
NEXT_PUBLIC_API_URL=https://<ВАШ_ПОДДОМЕН>.vercel.app
```

> **SECRET_KEY** — сгенерировать командой:
> ```bash
> python3 -c "import secrets; print(secrets.token_hex(32))"
> ```

### 3.4 Запустить только backend (без сервиса db — используем внешний Timeweb PostgreSQL)

```bash
# Запустить только backend
docker compose up -d backend

# Проверить логи — миграции должны применяться автоматически
docker compose logs -f backend
```

Ожидаемый вывод в логах:
```
Running upgrade  -> 001, initial schema
Running upgrade 001 -> 002, add is_cashier
...
Running upgrade 005 -> 006, schedule_plans: add start_time, end_time, break_minutes
Application startup complete.
```

### 3.5 Проверить backend

```bash
curl http://localhost:8000/health
# → {"status":"ok"}

curl http://localhost:8000/docs
# → Swagger UI (через браузер: http://<IP>:8000/docs)
```

### 3.6 Создать пользователей

```bash
# Создать owner + accountant1 + manager1
docker compose exec backend python create_staging_users.py

# Создать тестовых сотрудников (Челябинск)
docker compose exec backend python seed_test_data.py
```

Пользователи после создания:

| Логин | Пароль | Роль |
|-------|--------|------|
| owner | owner123 | Владелец |
| accountant1 | accountant123 | Бухгалтер |
| manager1 | manager123 | Управляющий |

> ⚠️ Сменить пароли после первого входа для staging!

---

## Шаг 4 — Frontend на Vercel

### 4.1 Импортировать проект

1. Открыть [vercel.com](https://vercel.com) → **Add New Project**
2. Подключить GitHub-репозиторий `appetit-fot`
3. Настройки проекта:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: *(оставить пустым)*

### 4.2 Добавить переменные окружения

В Vercel: **Settings → Environment Variables**:

| Переменная | Значение |
|-----------|---------|
| `NEXT_PUBLIC_API_URL` | `http://<IP_СЕРВЕРА>:8000` |
| `NEXT_PUBLIC_TEST_MODE` | `true` |

> `NEXT_PUBLIC_API_URL` — это адрес backend на Timeweb, доступный из интернета.  
> Пример: `http://123.45.67.89:8000` или `https://api.appetit.example.com`

### 4.3 Деплой

Нажать **Deploy**. Vercel соберёт Next.js и выдаст URL вида:
```
https://appetit-fot-xxxx.vercel.app
```

### 4.4 Обновить CORS backend (если нужно)

Текущий CORS в `backend/app/main.py` разрешает все origins (`"*"`).  
Для staging это допустимо. Менять не нужно.

---

## Шаг 5 — Проверить staging

### 5.1 Health check

```bash
curl http://<IP_СЕРВЕРА>:8000/health
# → {"status":"ok"}

curl http://<IP_СЕРВЕРА>:8000/test/ping
# → {"test_mode":true,"test_branch_id":1}
```

### 5.2 Проверить страницы фронтенда

Открыть в браузере:

| Страница | URL | Логин |
|---------|-----|-------|
| Главная | `https://appetit-fot-xxxx.vercel.app/` | — |
| Смены | `/shift` | PIN сотрудника |
| Кассир | `/cashier` | PIN кассира |
| График | `/schedule` | manager1 / manager123 |
| ФОТ | `/fot` | owner / owner123 |
| Бухгалтерия | `/admin` | accountant1 / accountant123 |
| Сотрудники | `/admin/employees` | accountant1 / accountant123 |
| Должности | `/admin/positions` | accountant1 / accountant123 |
| Тест | `/test` | — |

### 5.3 Проверить тестовый режим

1. Открыть `/test` → должна быть жёлтая панель тестового сценария
2. Открыть смену с произвольной датой через `/shift`
3. Проверить что смена открылась
4. Закрыть смену с заданными часами
5. Открыть `/schedule` → убедиться что факт отображается

---

## Env-переменные — итоговая таблица

### Timeweb backend (`.env`)

| Переменная | Пример | Обязательно |
|-----------|--------|------------|
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@host:5432/appetit` | ✅ |
| `SECRET_KEY` | `abc123...` (32+ символа) | ✅ |
| `ENVIRONMENT` | `staging` | ✅ |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | ✅ |
| `TELEGRAM_BOT_TOKEN` | *(пусто)* | — |
| `TELEGRAM_CHAT_ID` | *(пусто)* | — |

### Vercel frontend

| Переменная | Значение | Обязательно |
|-----------|---------|------------|
| `NEXT_PUBLIC_API_URL` | `http://<IP>:8000` | ✅ |
| `NEXT_PUBLIC_TEST_MODE` | `true` | ✅ |

---

## Структура docker-compose для staging

На Timeweb запускается только `backend` (PostgreSQL — внешний):

```bash
# Только backend:
docker compose up -d backend

# Проверить статус:
docker compose ps

# Логи backend:
docker compose logs -f backend --tail=50
```

---

## Миграции

Миграции применяются **автоматически** при каждом старте backend.  
Если нужно применить вручную:

```bash
docker compose exec backend alembic upgrade head

# Проверить текущую версию:
docker compose exec backend alembic current
# → должно быть: 006 (head)
```

---

## Откат при ошибке

### Откатить до предыдущей миграции

```bash
docker compose exec backend alembic downgrade -1
```

### Полный откат и пересоздание

```bash
# Удалить все таблицы (ОПАСНО — только на staging!)
docker compose exec backend alembic downgrade base

# Пересоздать с нуля
docker compose exec backend alembic upgrade head
docker compose exec backend python create_staging_users.py
docker compose exec backend python seed_test_data.py
```

### Пересобрать backend после изменений кода

```bash
git pull
docker compose build backend
docker compose up -d backend
```

### Пересобрать frontend после изменений

Vercel автоматически пересобирает при push в main.  
Или вручную через кнопку **Redeploy** в Vercel dashboard.

---

## Безопасность staging

- `ENVIRONMENT=staging` — тестовые роуты `/test/*` доступны
- `ENVIRONMENT=production` — тестовые роуты блокируются (403)
- Пароли bcrypt — не хранятся открытым текстом
- PIN bcrypt — не хранится открытым текстом
- `pin_check` — SHA256, только для проверки уникальности
- CORS разрешает все origins (`"*"`) — допустимо для staging
- Telegram-уведомления отключены (`TELEGRAM_BOT_TOKEN=` пусто)

---

## Что нельзя делать до production

1. Не использовать staging-базу как production
2. Не отключать `NEXT_PUBLIC_TEST_MODE` без тестирования
3. Не убирать тестовые данные если они нужны для проверки
4. Не деплоить без прохождения чеклиста /shift + /cashier + /schedule + /admin
5. Не подключать telegram-бота пока не проверен полный цикл
6. Не добавлять реальных сотрудников и PIN пока staging не утверждён

---

## Быстрый чеклист перед сдачей staging

- [ ] `GET /health` → `{"status":"ok"}`
- [ ] `GET /test/ping` → `{"test_mode":true}`
- [ ] Логин owner / accountant1 / manager1 работает
- [ ] `/admin/employees` — список сотрудников загружается
- [ ] `/admin/positions` — список должностей загружается
- [ ] `/shift` — можно ввести PIN и открыть смену
- [ ] `/test` — тестовая панель доступна (жёлтый блок)
- [ ] `/schedule` — график загружается, можно ставить время
- [ ] `/cashier` — закрытие дня открывается
- [ ] `/fot` — ФОТ загружается (после закрытия дня)
- [ ] CSV/XLSX экспорт скачивается
