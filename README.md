# PowderBox

Микросервисный веб-проект для горнолыжников и сноубордистов.

## Архитектура

- **Backend**: Python + FastAPI
- **База данных**: SQLite (для разработки)
- **Аутентификация**: JWT (access + refresh)
- **Контейнеризация**: Docker + docker-compose

## Микросервисы

| Сервис | Порт | Описание |
|--------|------|----------|
| api-gateway | 8000 | Единая точка входа, проксирование, проверка JWT |
| auth-service | 8001 | Регистрация, логин, обновление токена |
| user-profile-service | 8002 | Профиль пользователя |
| equipment-service | 8003 | Каталог снаряжения |
| resort-service | 8004 | Курорты и категории |
| weather-service | 8005 | Погода на курортах |
| hotel-service | 8006 | Отели |
| skipass-service | 8007 | Цены на скипассы |
| lesson-service | 8008 | Уроки и инструкторы |
| activity-service | 8009 | Лента активностей |
| stats-service | 8010 | Статистика (заготовка) |

## Запуск

```bash
# Копировать конфигурацию
cp .env.example .env

# Собрать и запустить (первый раз)
docker compose up --build

# Или в фоне
docker compose up -d --build
```

**Фронтенд:** http://localhost:3000  
**API Gateway:** http://localhost:8000  
**Swagger UI:** http://localhost:8000/docs

### Ограничение доступа к админке (быстрый способ)

Для операций записи (`POST/PATCH/PUT/DELETE`) в `/resorts`, `/lessons`, `/equipment`, `/hotels`, `/skipasses`
gateway проверяет email из JWT по переменной `ADMIN_EMAILS`.

Пример в `.env`:
```bash
ADMIN_EMAILS=admin@example.com,owner@example.com
```

После изменения переменной перезапустите gateway:
```bash
docker compose up -d --build api-gateway
```

Чтобы скрыть раздел `/admin` в UI для не-админов, перезапустите и frontend (он читает `VITE_ADMIN_EMAILS`):
```bash
docker compose up -d --build frontend api-gateway
```

### Локальные картинки курортов

Картинки лежат в `resort-service/static/resorts/`:
- `1.jpg` — Роза Хутор
- `2.jpg` — Красная Поляна
- `3.jpg` — Шерегеш
- `4.jpg` — Эльбрус

Папка примонтирована в контейнер — добавьте/замените файлы, перезапуск не нужен.

Обновить путь в БД:
```bash
docker compose exec resort-service python -c "
import sqlite3
conn = sqlite3.connect('/app/data/resorts.db')
conn.execute(\"UPDATE resorts SET image_url = '/static/resorts/1.jpg' WHERE id = 1\")
conn.commit()
conn.close()
"
```

### Режим разработки (hot-reload)

Исходный код примонтирован в контейнеры — **пересборка не нужна** после изменений:

- **Backend (Python):** uvicorn с `--reload` — изменения в `*/app/` подхватываются автоматически
- **Frontend (Vite):** HMR — изменения в `frontend/src/` обновляются в браузере

Перезапуск контейнеров нужен только при изменении `requirements.txt`, `package.json` или `Dockerfile`.

## Примеры запросов

### Регистрация
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secret123"}'
```

### Логин
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "secret123"}'
```

### Получить профиль (с токеном)
```bash
curl http://localhost:8000/users/me \
  -H "Authorization: Bearer <access_token>"
```

### Список курортов
```bash
curl http://localhost:8000/resorts
```
