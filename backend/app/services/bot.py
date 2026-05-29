import httpx
from datetime import date
from app.config import settings


async def send_telegram(message: str) -> bool:
    if not settings.telegram_bot_token or not settings.telegram_chat_id:
        return False
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json={
                "chat_id": settings.telegram_chat_id,
                "text": message,
                "parse_mode": "HTML",
            })
            return resp.status_code == 200
    except Exception:
        return False


def build_close_message(
    branch_name: str,
    report_date: date,
    revenue: float,
    orders: int,
    takeaways: int,
    unclosed_names: list[str],
    total_fot_pct: float | None,
) -> str:
    date_str = report_date.strftime("%d.%m.%Y")
    fot_line = f"ФОТ: {total_fot_pct:.1f}%" if total_fot_pct is not None else ""

    if unclosed_names:
        names_list = "\n".join(f"- {n}" for n in unclosed_names)
        return (
            f"⚠️ Филиал закрыт с ошибками: {branch_name}\n"
            f"Дата: {date_str}\n"
            f"Выручка: {revenue:,.0f} ₽\n"
            f"Заказы: {orders}\n"
            f"Выносы: {takeaways}\n"
            f"{fot_line}\n"
            f"Не закрыли смену:\n{names_list}"
        ).strip()
    else:
        return (
            f"✅ Филиал закрыт: {branch_name}\n"
            f"Дата: {date_str}\n"
            f"Выручка: {revenue:,.0f} ₽\n"
            f"Заказы: {orders}\n"
            f"Выносы: {takeaways}\n"
            f"{fot_line}\n"
            f"Все сотрудники закрыли смены."
        ).strip()
