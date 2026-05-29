# План: Telegram-бот «Аппетит» (подписная база + BotHunter)

## Архитектура

Python-бот на aiogram 3.x. При /start:
1. Отправляет фото + приветственный текст с промокодом
2. Показывает Reply-клавиатуру (6 кнопок, фиксированы внизу)
3. Отправляет данные подписчика в BotHunter через API

Каждая кнопка → отдельный хендлер → текст + фото (где есть).

## Стек

- Python 3.11+
- aiogram 3.x (async Telegram bot)
- python-dotenv (токены из .env)
- aiohttp (HTTP-запросы к BotHunter API)
- SQLite через aiosqlite (локальная база подписчиков — резерв)

## Файлы

| Файл | Действие | Назначение |
|------|----------|------------|
| `sushi-bot/bot/main.py` | создать | Точка входа, запуск бота |
| `sushi-bot/bot/config.py` | создать | Загрузка .env, константы |
| `sushi-bot/bot/keyboards.py` | создать | Reply-клавиатуры |
| `sushi-bot/bot/handlers/start.py` | создать | /start хендлер |
| `sushi-bot/bot/handlers/aktsii.py` | создать | Хендлеры раздела Акции |
| `sushi-bot/bot/handlers/menu.py` | создать | Меню/Заказать |
| `sushi-bot/bot/handlers/o_nas.py` | создать | О Нас |
| `sushi-bot/bot/handlers/otzyvy.py` | создать | Отзывы |
| `sushi-bot/bot/handlers/kontakty.py` | создать | Контакты |
| `sushi-bot/bot/handlers/prilozhenie.py` | создать | Скачать приложение |
| `sushi-bot/bot/services/bothunter.py` | создать | API-клиент BotHunter |
| `sushi-bot/bot/services/database.py` | создать | SQLite резервная база |
| `sushi-bot/bot/.env` | уже есть | Токены (не трогать) |
| `sushi-bot/bot/requirements.txt` | создать | Зависимости |

---

## Задачи

### Задача 1: requirements.txt и config.py
Файлы: `sushi-bot/bot/requirements.txt`, `sushi-bot/bot/config.py`

- [ ] Создать `requirements.txt`:
  ```
  aiogram==3.7.0
  python-dotenv==1.0.1
  aiohttp==3.9.5
  aiosqlite==0.20.0
  ```
- [ ] Создать `config.py`:
  ```python
  import os
  from dotenv import load_dotenv

  load_dotenv()

  BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
  BOTHUNTER_TOKEN = os.getenv("BOTHUNTER_TOKEN")

  TG_CHANNEL = "https://t.me/appetit_dostavka"
  MAX_CHANNEL = "https://max.ru/appetit_dostavka"

  # Пути к контенту
  CONTENT_DIR = os.path.join(os.path.dirname(__file__), "..", "content")
  ```
- [ ] Коммит: `feat: add config and requirements`

---

### Задача 2: Клавиатуры
Файл: `sushi-bot/bot/keyboards.py`

- [ ] Создать главную Reply-клавиатуру (6 кнопок, 2 в ряд):
  ```python
  from aiogram.types import ReplyKeyboardMarkup, KeyboardButton, InlineKeyboardMarkup, InlineKeyboardButton

  def main_keyboard() -> ReplyKeyboardMarkup:
      return ReplyKeyboardMarkup(
          keyboard=[
              [KeyboardButton(text="🔥 Акции"), KeyboardButton(text="🍱 Меню/Заказать")],
              [KeyboardButton(text="ℹ️ О Нас"), KeyboardButton(text="⭐ Отзывы")],
              [KeyboardButton(text="📍 Контакты"), KeyboardButton(text="📱 Скачать приложение")],
          ],
          resize_keyboard=True,
          persistent=True,  # фиксирована внизу
      )

  def aktsii_keyboard() -> InlineKeyboardMarkup:
      return InlineKeyboardMarkup(inline_keyboard=[
          [InlineKeyboardButton(text="🔥 Скидка 30% на первый заказ", callback_data="aktsii_30")],
          [InlineKeyboardButton(text="🎁 300 бонусов за регистрацию", callback_data="aktsii_300")],
          [InlineKeyboardButton(text="🎂 Подарок на день рождения", callback_data="aktsii_dr")],
          [InlineKeyboardButton(text="🚶 Скидка за самовывоз", callback_data="aktsii_samovyvoz")],
          [InlineKeyboardButton(text="🍱 Сеты со скидкой", callback_data="aktsii_sety")],
          [InlineKeyboardButton(text="🍕 Пиццы со скидкой", callback_data="aktsii_pizza")],
          [InlineKeyboardButton(text="◀️ Назад", callback_data="back_main")],
      ])
  ```
- [ ] Коммит: `feat: add keyboards`

---

### Задача 3: BotHunter API-клиент
Файл: `sushi-bot/bot/services/bothunter.py`

- [ ] Исследовать API BotHunter: `GET https://bot.targethunter.ru/api/v1/` с токеном
- [ ] Реализовать добавление подписчика:
  ```python
  import aiohttp
  from config import BOTHUNTER_TOKEN

  API_URL = "https://bot.targethunter.ru/api/v1"

  async def add_subscriber(user_id: int, username: str, first_name: str) -> bool:
      """Добавляет подписчика в базу BotHunter."""
      headers = {"Authorization": f"Bearer {BOTHUNTER_TOKEN}"}
      payload = {
          "telegram_id": user_id,
          "username": username or "",
          "first_name": first_name or "",
      }
      async with aiohttp.ClientSession() as session:
          try:
              async with session.post(
                  f"{API_URL}/subscribers/add",
                  json=payload,
                  headers=headers,
                  timeout=aiohttp.ClientTimeout(total=5)
              ) as resp:
                  return resp.status in (200, 201)
          except Exception:
              return False
  ```
- [ ] Коммит: `feat: add BotHunter API client`

> ⚠️ Примечание: точный endpoint BotHunter уточним после проверки документации по API-токену

---

### Задача 4: /start хендлер
Файл: `sushi-bot/bot/handlers/start.py`

- [ ] Реализовать:
  ```python
  import os
  from aiogram import Router
  from aiogram.filters import CommandStart
  from aiogram.types import Message, FSInputFile
  from keyboards import main_keyboard
  from services.bothunter import add_subscriber
  from config import CONTENT_DIR

  router = Router()

  START_TEXT_TG = """🎉 Добро пожаловать в Telegram «Аппетит»!

  Дарим сет роллов «Радость» 560 г 🎁
  Бесплатно при заказе от 1290 ₽

  ✅ Подпишись на канал
  ✅ Пройди бота
  ✅ Получи промокод на подарок

  Вкусные акции, новинки и подарки уже ждут 🍣🔥"""

  @router.message(CommandStart())
  async def cmd_start(message: Message):
      # 1. Добавить в BotHunter
      await add_subscriber(
          user_id=message.from_user.id,
          username=message.from_user.username,
          first_name=message.from_user.first_name,
      )

      # 2. Отправить фото + текст
      photo_path = os.path.join(CONTENT_DIR, "start", "ТГ", "a00477a5-c3ae-4b51-b609-b503a8c570e4.png")
      await message.answer_photo(
          photo=FSInputFile(photo_path),
          caption=START_TEXT_TG,
          reply_markup=main_keyboard(),
      )
  ```
- [ ] Коммит: `feat: add /start handler`

---

### Задача 5: Хендлер «Акции»
Файл: `sushi-bot/bot/handlers/aktsii.py`

- [ ] Главный хендлер (текст + inline-кнопки + общее фото акций):
  ```python
  @router.message(F.text == "🔥 Акции")
  async def show_aktsii(message: Message):
      photo_path = os.path.join(CONTENT_DIR, "aktsii", "ef2a0254-87d9-417c-af7f-05cb696bf4aa.png")
      await message.answer_photo(
          photo=FSInputFile(photo_path),
          caption="💥 Твои выгодные акции здесь!\nВыбирай и заказывай с максимальной выгодой.",
          reply_markup=aktsii_keyboard(),
      )
  ```
- [ ] 6 callback-хендлеров для каждой акции (текст + фото из content/aktsii/)
- [ ] Коммит: `feat: add aktsii handlers`

---

### Задача 6: Остальные хендлеры (О Нас, Отзывы, Контакты, Меню, Приложение)
Файлы: `handlers/o_nas.py`, `handlers/otzyvy.py`, `handlers/kontakty.py`, `handlers/menu.py`, `handlers/prilozhenie.py`

- [ ] `О Нас` — текст из `content/o-nas/text.txt` + фото `AIR_3646.jpg`
- [ ] `Отзывы` — текст + inline-кнопки с ссылками на Яндекс по каждому филиалу
- [ ] `Контакты` — адреса, телефон, часы
- [ ] `Меню/Заказать` — кнопка-ссылка на https://appetitfood.ru
- [ ] `Скачать приложение` — 3 ссылки (App Store, Google Play, RuStore)
- [ ] Коммит: `feat: add remaining handlers`

---

### Задача 7: main.py — сборка и запуск
Файл: `sushi-bot/bot/main.py`

- [ ] Собрать роутеры, запустить polling:
  ```python
  import asyncio
  import logging
  from aiogram import Bot, Dispatcher
  from config import BOT_TOKEN
  from handlers import start, aktsii, menu, o_nas, otzyvy, kontakty, prilozhenie

  async def main():
      logging.basicConfig(level=logging.INFO)
      bot = Bot(token=BOT_TOKEN)
      dp = Dispatcher()

      dp.include_routers(
          start.router,
          aktsii.router,
          menu.router,
          o_nas.router,
          otzyvy.router,
          kontakty.router,
          prilozhenie.router,
      )

      await dp.start_polling(bot)

  if __name__ == "__main__":
      asyncio.run(main())
  ```
- [ ] Запустить: `python main.py` → убедиться что бот отвечает на /start
- [ ] Коммит: `feat: wire up main entry point`

---

## Варианты выполнения

После готовности плана — два пути:

1. **Субагент на каждую задачу** (рекомендую) — изолированно, с проверкой
2. **Всё в одной сессии** — быстрее, но без изоляции

## Что нужно перед стартом

- [ ] Токен Telegram-бота в `.env` (`TELEGRAM_BOT_TOKEN=...`)
- [ ] Токен BotHunter в `.env` (`BOTHUNTER_TOKEN=...`)
- [ ] Python 3.11+ установлен
