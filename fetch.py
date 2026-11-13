"""Забирает блок «Полезное от SolutionCRM» из открытой Google Таблицы и сохраняет data.json.

Как работает:
1. Скачивает таблицу в формате CSV по ссылке SHEET_CSV_URL.
2. Берёт строки, где в колонке «показывать» стоит «да».
3. Пишет data.json: дата обновления + список карточек.
Если таблица не ответила или пришло что-то не то — data.json НЕ трогаем,
приложение продолжает показывать прошлые данные.

Запуск руками: python3 fetch.py
Нужен только Python, сторонние библиотеки не нужны.
"""
import csv
import io
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

# Ссылка на опубликованную таблицу «amo-audit_полезное_v1» (Файл → Поделиться → Опубликовать в интернете → CSV).
# Таблица открыта всем, поэтому личного и секретного в ней быть не должно.
SHEET_CSV_URL = os.environ.get("SHEET_CSV_URL") or "https://docs.google.com/spreadsheets/d/e/2PACX-1vS8F29lC1iCIsHvXNVysI7UbXXwGiRbmsxQpNM7yJPuFIaQjyLrJspb1CoaRdH1gKkNbYZnvUlNc1k5/pub?gid=1958149344&single=true&output=csv"

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.json")
MAX_ITEMS = 12
COLUMNS = ["показывать", "тип", "заголовок", "текст", "ссылка"]


def fail(msg):
    print("ОШИБКА: " + msg + "\ndata.json не изменён, в приложении остаются прошлые данные.")
    sys.exit(1)


def download(url):
    req = urllib.request.Request(url, headers={"User-Agent": "amo-audit-updater"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        ctype = resp.headers.get("Content-Type", "")
        body = resp.read().decode("utf-8-sig")
    if "html" in ctype.lower() or body.lstrip().startswith("<"):
        raise ValueError("пришла веб-страница вместо CSV — таблица не опубликована или ссылка неверная")
    return body


def clean(s, limit):
    return " ".join(str(s or "").split())[:limit]


def parse(text):
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows and not text.strip():
        raise ValueError("таблица пустая")
    header = [h.strip().lower() for h in (rows[0].keys() if rows else [])]
    missing = [c for c in COLUMNS if c not in header]
    if rows and missing:
        raise ValueError("в первой строке таблицы нет колонок: " + ", ".join(missing))
    items = []
    for r in rows:
        r = {k.strip().lower(): v for k, v in r.items() if k}
        if clean(r.get("показывать"), 10).lower() not in ("да", "yes", "1", "+"):
            continue
        title = clean(r.get("заголовок"), 120)
        text = clean(r.get("текст"), 600)
        if not title and not text:
            continue
        url = clean(r.get("ссылка"), 300)
        if not url.startswith(("https://", "http://")):
            url = ""
        items.append({"type": clean(r.get("тип"), 40), "title": title, "text": text, "url": url})
    return items[:MAX_ITEMS]


def main():
    if not SHEET_CSV_URL.startswith("https://"):
        fail("не задана ссылка на таблицу (SHEET_CSV_URL в fetch.py)")
    try:
        items = parse(download(SHEET_CSV_URL))
    except Exception as e:  # сеть, формат, что угодно — старый файл не трогаем
        fail(str(e))
    data = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "Google Таблица «amo-audit_полезное_v1»",
        "items": items,
    }
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    os.replace(tmp, OUT)
    print("Готово: карточек " + str(len(items)) + ", обновлено " + data["updated"])


if __name__ == "__main__":
    main()
