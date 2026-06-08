# CHANGELOG — «Аппетит — ФОТ»

> Журнал последних изменений проекта (от новых к старым). Цель — быстро ввести нового участника/чат в курс недавней истории.

---

## 2026-06-08

### `4342040` — Mask employee names in public live shifts endpoint
Публичный эндпоинт `GET /shifts/live` (экран мониторинга смен без авторизации) перестал отдавать полные ФИО сотрудников. Добавлен helper `_short_name()` в `shifts.py`, преобразующий `"Фамилия Имя Отчество"` / `"Фамилия Имя"` → `"Имя Ф."`, однословные имена остаются как есть. Остальные поля (`position`, `category`, `branch_name`, `opened_at`, `minutes_on`) не изменились — фронт (`live/page.tsx`) продолжает работать без правок. Снижает риск утечки ПДн через незащищённый публичный эндпоинт.

### `1f7b778` — Extract business rules for FOT thresholds and cashier bonus
Создан `backend/app/business_rules.py` — единый источник для:
- порогов статусов ФОТ (`27.5/29%` total, `14.5/15.5%` kitchen)
- формулы бонуса кассира (`7₽/заказ` Пн-Чт+Вс, `5₽/заказ` Пт-Сб)

Устранено **тройное дублирование** функций статуса ФОТ (`payroll.py`, `admin.py`, `dashboard.py`) и **двойное дублирование** формулы бонуса (`payroll.py::_admin_bonus` vs `cashier.py::_cashier_bonus`, которые имели разные сигнатуры при идентичной логике). Поведение подтверждено побитово идентичным — снят и сравнен "baseline" до и после рефакторинга на реальных пороговых значениях (in-container проверка, без деплоя).

### `fcbd8a6` — Disable legacy employee write endpoints
Legacy-роутер `backend/app/routers/employees.py` обезврежен: `POST /employees`, `PATCH /employees/{id}`, `POST/GET /employees/{id}/rates` заменены на `HTTP 410 Gone` с сообщением `"Legacy endpoint disabled. Use /admin/employees instead."`. `GET /employees/` оставлен рабочим (используется фронтендом в `cashier`/`admin/employees`). Причина: legacy-эндпоинты дублировали `/admin/employees`, но не проверяли уникальность PIN, не синхронизировали `pin_hash`/`pin_check`, не закрывали предыдущие активные ставки и использовали несовместимый со схемой `log_action` — представляли реальный риск порчи данных при случайном вызове.

### `fa0ccfb` — Fix audit log schema mismatch
`app/services/audit.py::log_action` передавал в конструктор `AuditLog` несуществующее поле `ip_address` (отсутствует в реальной таблице `audit_log`, созданной миграцией 007) — вызовы вероятно падали с ошибкой. Поле удалено из сигнатуры функции и из конструктора ORM-модели; совместимость всех 5 реальных вызовов с новой сигнатурой проверена через `inspect.signature(...).bind()`.

### `3ae590b` — fix: branch-aware timezone display (Kazan=MSK, Chelyabinsk=Yekaterinburg)
Исправлен баг отображения времени: Казань теперь показывается по московскому времени, Челябинск — по екатеринбургскому (UTC+2 относительно МСК). Добавлен helper `tzForBranch()` в `live/page.tsx`, `cashier/page.tsx`, `shift/page.tsx`.

---

## Более ранняя история (до 2026-06-08, выборочно значимое)

- `c74d9eb` — docs: add architecture overview
- `49b54d3` — fix: restore `frontend/package.json`/`package-lock.json` (были ошибочно в `.gitignore`, ломало git-based сборки на Vercel)
- `6573844` — chore: trigger Vercel redeploy after Git connection
- `fa7b0af` — security: скрыты подсказки паролей на экранах входа, добавлен эндпоинт+кнопка смены пароля, удалена страница `/test`
- `6e6e50f` — ui: на главной странице добавлены ссылки на разделы live/analytics/employee
- `4c6d910` — fix: `cashier close-day-by-pin` — отсутствовал запрос `existing_session` (`NameError`)
- `02d5423` — feat: монитор живых смен (`/shifts/live`) + фикс невалидного токена в расписании
- `96f5e56` — fix: `cashier already_had_shift` — читаемое сообщение + кнопка закрытия дня
- `ec79e1a` — merge: live test mode + audit docs
- `398ae72` — docs: КАРТА_СИСТЕМЫ, АУДИТ_РАСХОЖДЕНИЙ, Инструкция_реальный_тест

---

## Сопутствующие артефакты (не код, untracked)

- `PROJECT_DOCUMENTATION.md` — полный READ-ONLY аудит проекта (2026-06-08, 11 разделов: возможности, проблемы, рекомендации)
- `docs/plans/2026-06-08-business-rules-extraction-plan.md` — план рефакторинга `business_rules.py` (использован для коммита `1f7b778`)
- `PROJECT_SPEC.md`, `PROJECT_STATUS.md`, `CHANGELOG.md` (этот файл) — комплект рабочей документации, созданы 2026-06-08

---

## Незавершённые/фоновые треки

- `task_6dc56a98` — фоновая задача: заменить magic numbers (`29.0`, `15.5`) в `review.py::day_verdict()` на ссылки на `business_rules.py` с учётом конфликта типов `Decimal`/`float`
- Расследование PIN-проблемы для Ямашева (Казань, branch_id=2) — заблокировано, ждёт нового подхода к диагностике (см. `PROJECT_STATUS.md`, открытые задачи)
