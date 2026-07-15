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

### Администраторы

Роль администратора зашивается в access-токен (claim `role`) при логине:
auth-service сверяет email пользователя со списком `ADMIN_EMAILS` из `.env`.
Gateway пускает к операциям записи (`POST/PATCH/PUT/DELETE`) в `/resorts`,
`/lessons`, `/equipment`, `/hotels`, `/skipasses`, `/weather` только токены
с `role=admin`; фронтенд по этому же claim показывает раздел `/admin`.

Пример в `.env`:
```bash
ADMIN_EMAILS=admin@example.com,owner@example.com
```

После изменения переменной перезапустите auth-service и gateway (фронт пересобирать не нужно):
```bash
docker compose up -d --build auth-service api-gateway
```
Админам нужно перелогиниться, чтобы получить токен с новой ролью.

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

## Наблюдаемость (Observability)

Каждый сервис экспортирует Prometheus-метрики на `/metrics`, пишет
структурированные JSON-логи в stdout и поддерживает Correlation ID.

| Адрес | Что это |
|-------|---------|
| http://localhost:9090 | Prometheus — сырое хранилище метрик и интерфейс PromQL |
| http://localhost:3001 | Grafana — приборная панель (логин/пароль `admin` / `admin`) |
| http://localhost:8000/metrics, …, http://localhost:8010/metrics | Сырые метрики каждого сервиса |

После `docker compose up -d --build` дашборд **PowderBox → Overview**
поднимается автоматически и показывает:

- **RPS** — частота запросов по сервисам;
- **Error rate** — доля 5xx-ответов;
- **Latency p50 / p95 / p99** — распределение времени ответа;
- **In-flight** — сколько запросов обрабатывается прямо сейчас;
- **Топ endpoints** — таблица самых нагруженных маршрутов.

### Correlation ID

Через API Gateway каждому входящему запросу присваивается `X-Request-ID`
(или используется значение, переданное клиентом). Этот идентификатор:

1. возвращается клиенту в заголовке ответа;
2. пробрасывается во все downstream-сервисы при проксировании;
3. попадает во все JSON-логи как поле `correlation_id`.

Так одну логическую цепочку можно отследить по всем сервисам:

```bash
docker compose logs api-gateway auth-service user-profile-service \
  | grep '"correlation_id": "<id>"'
```

### Полезные PromQL-запросы

```promql
# RPS по сервису
sum by (service) (rate(http_requests_total[1m]))

# Error rate 5xx
sum by (service) (rate(http_requests_total{status_code=~"5.."}[5m]))
  / sum by (service) (rate(http_requests_total[5m]))

# p95 latency
histogram_quantile(0.95,
  sum by (service, le) (rate(http_request_duration_seconds_bucket[5m])))
```

### Конфигурация

- `observability/observability.py` — общий код (исходник, копируется в каждый сервис при правках);
- `*/app/observability.py` — копия модуля в каждом сервисе;
- `observability/prometheus/prometheus.yml` — список целей для скрейпинга;
- `observability/grafana/provisioning/` — автогенерация datasource'а и провайдера дашбордов;
- `observability/grafana/dashboards/powderbox-overview.json` — главный дашборд.
