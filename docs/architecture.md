# Архитектура проекта «Аппетит — ФОТ»

Система учёта смен и расчёта ФОТ (фонда оплаты труда) для сети точек питания «Аппетит».

## Общая схема

```
Браузер
   │
   ▼
Vercel (Next.js фронтенд)
   │  запросы идут через /proxy → BACKEND_URL / NEXT_PUBLIC_API_URL
   ▼
Timeweb Cloud VPS (Docker: FastAPI бэкенд)
   │
   ▼
Timeweb Cloud VPS (Docker: PostgreSQL)
```

## Frontend

- **Стек:** Next.js 14.2.5, React 18, TypeScript, TailwindCSS
- **Расположение в репо:** `frontend/`
- **Хостинг:** Vercel, проект `appetit-fot` (аккаунт `msattarovkzn-2069s-projects`)
- **Публичный адрес:** https://appetit-fot.vercel.app
- **Деплой:** автоматический — подключён к GitHub-репозиторию, при пуше в ветку `main` Vercel сам собирает и выкатывает прод
- **Важная настройка Vercel:** Root Directory = `frontend` (без неё сборка падает с ошибкой «No Next.js / pages or app directory detected», т.к. репозиторий — монорепо с папками `frontend/` и `backend/`)
- **Прокси к бэкенду:** все запросы к API идут через `/proxy/*`, который подставляет `BACKEND_URL` (серверная переменная) или `NEXT_PUBLIC_API_URL` (клиентская)
- **Ключевые файлы:**
  - `frontend/src/lib/api.ts` — единая точка обращения к бэкенду
  - `frontend/src/components/ChangePasswordButton.tsx` — кнопка смены пароля в кабинетах
  - `frontend/src/app/*/page.tsx` — страницы по ролям (admin, manager, fot, schedule, cashier, employee, live, analytics, shift)

## Backend

- **Стек:** FastAPI + async SQLAlchemy + PostgreSQL, аутентификация JWT (+ PIN для сотрудников на точках)
- **Расположение в репо:** `backend/`
- **Хостинг:** Timeweb Cloud VPS, через Docker Compose
- **Путь на сервере:** `/root/appetit-fot/docker-compose.yml`
- **Контейнеры:** `appetit-fot-backend-1`, `appetit-fot-db-1`
- **Деплой:** ручной — изменения нужно закидывать на сервер по SFTP/SSH и пересобирать (`docker compose up -d --build backend`). Автодеплоя для бэкенда нет
- **Ключевые модули:**
  - `backend/app/routers/auth.py` — логин, проверка PIN, смена пароля (`PATCH /auth/me/password`)
  - `backend/app/utils/security.py` — хэширование паролей (bcrypt), JWT
  - `backend/app/dependencies.py` — `get_current_user` (проверка токена)
  - `backend/reset_password.py` — аварийный скрипт сброса пароля (запускается прямо в контейнере)

## База данных

- PostgreSQL в отдельном контейнере на том же сервере, что и бэкенд
- Подключение настраивается через `DATABASE_URL` в `.env` (не в репозитории)

## Роли пользователей

- **owner** (владелец) — полный доступ
- **accountant** (бухгалтер) — раздел ФОТ/бухгалтерия
- **manager** (управляющий филиалом)
- **employee / cashier** — вход по PIN на точке (без пароля)

## Репозиторий

- GitHub: https://github.com/msattarovkzn/appetit-fot — **публичный репозиторий**
- Ветка по умолчанию: `main`
- ⚠️ Никогда не коммитить: `.env`, `docker-compose.override.yml`, `docs/*-PRIVATE.md`, реальные пароли/токены — всё это должно оставаться в `.gitignore`

## Где искать чувствительную информацию

Пароли, IP-адреса серверов, доступы к панелям и т.п. хранятся **отдельно от кода**, см. `docs/infrastructure-PRIVATE.md` (этот файл не попадает в git — см. `.gitignore`).
