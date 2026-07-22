# Деплой powderbox.wwder.ru

Стек: Docker Compose на сервере + HestiaCP как реверс-прокси (HTTP only, без SSL) +
GitHub Actions для CI/CD по SSH.

```
Internet  →  HestiaCP nginx (80, HTTP)  →  127.0.0.1:3000  (frontend, статика)
                                       →  127.0.0.1:8000  (api-gateway, /api/*)
                                       →  127.0.0.1:8004  (resort-service, /static/*)
                                       →  127.0.0.1:8003  (equipment-service, /equipment-static/*)

Локально (на сервере, не торчат наружу):
  127.0.0.1:8001..8010 — backend-сервисы
  127.0.0.1:9090       — Prometheus
  127.0.0.1:3001       — Grafana
  127.0.0.1:15672      — RabbitMQ management
```

## Файлы

| Файл | Назначение |
|------|------------|
| `docker-compose.yml` | Базовое описание сервисов (общее для dev и prod) |
| `docker-compose.override.yml` | Dev-only bind-mounts кода. Авто-подгружается на `docker compose up` |
| `docker-compose.prod.yml` | Prod-оверрайды: 127.0.0.1, restart, `command` без `--reload`, prod-сборка фронта |
| `frontend/Dockerfile.prod` | Multi-stage сборка SPA (Vite build → nginx alpine) |
| `frontend/nginx.conf` | Внутренний nginx фронт-контейнера: статика + SPA fallback |
| `deploy/hestia/powderbox.tpl` / `.stpl` | nginx-шаблоны HestiaCP. `.tpl` используется (HTTP), `.stpl` требуется для регистрации имени шаблона панелью, даже если SSL для домена выключен |
| `.github/workflows/deploy.yml` | GitHub Actions: matrix-тесты по всем сервисам → SSH-деплой (только на push в main) |

## Один раз: настройка сервера

### 1. Завести deploy-пользователя и SSH-ключ

На сервере:

```bash
# создать пользователя (можно использовать существующего)
sudo useradd -m -s /bin/bash powderbox
sudo usermod -aG docker powderbox

# подготовить .ssh
sudo -u powderbox mkdir -p /home/powderbox/.ssh
sudo -u powderbox chmod 700 /home/powderbox/.ssh
```

На локальной машине:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/powderbox_deploy -C "github-actions"
# скопировать публичный ключ на сервер
ssh-copy-id -i ~/.ssh/powderbox_deploy.pub powderbox@SERVER_IP
```

Приватный ключ `~/.ssh/powderbox_deploy` пойдёт в GitHub Secrets.

### 2. Клонировать репозиторий и положить .env

```bash
sudo -u powderbox bash <<'EOF'
mkdir -p /home/powderbox/apps
cd /home/powderbox/apps
git clone https://github.com/chiaker/powder_box.git powderbox
cd powderbox
cp .env.example .env
EOF

sudo -u powderbox nano /home/powderbox/apps/powderbox/.env
```

В `.env` обязательно поменять:

```env
JWT_SECRET=<какой-то длинный рандомный секрет>
ADMIN_EMAILS=твой_админский_email@example.com
GF_ADMIN_USER=admin
GF_ADMIN_PASSWORD=<свой пароль для Grafana>
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672/

# Почта (notification-service). Без реального SMTP письма никуда не уйдут:
# dev-дефолты указывают на mailpit, которого в проде нет.
PUBLIC_BASE_URL=http://powderbox.wwder.ru
SMTP_HOST=<smtp-хост>
SMTP_PORT=587
SMTP_USER=<логин>
SMTP_PASSWORD=<пароль>
SMTP_FROM=noreply@powderbox.wwder.ru
SMTP_TLS=starttls
```

Миграции auth-service (alembic upgrade head) выполняются автоматически при
старте контейнера. Новый контейнер notification-service поднимается вместе со
всеми через тот же compose.

### 3. Прогнать первый билд вручную (sanity check)

```bash
sudo -u powderbox bash -lc '
  cd /home/powderbox/apps/powderbox
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
  sleep 10
  curl -fsS http://127.0.0.1:8000/health && echo OK
  curl -fsS http://127.0.0.1:3000/ -o /dev/null && echo "frontend OK"
'
```

Если `health` отвечает — стек живой. Иначе:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs --tail=200
```

### 4. HestiaCP: добавить домен (без SSL)

В UI Хестии:

1. **Web → Add Web Domain** → `powderbox.wwder.ru`.
2. **SSL Support не включаем** (на сервере открыт только порт 80).

Проверить, что Хестия слушает домен:

```bash
curl -I http://powderbox.wwder.ru/        # должен вернуть 200/4xx от nginx
```

### 5. HestiaCP: подключить наш proxy-шаблон

Скопировать **оба** файла (HestiaCP не зарегистрирует имя шаблона, если нет
пары `.tpl + .stpl`, даже если SSL не нужен):

```bash
sudo cp /home/powderbox/apps/powderbox/deploy/hestia/powderbox.tpl  \
        /usr/local/hestia/data/templates/web/nginx/powderbox.tpl
sudo cp /home/powderbox/apps/powderbox/deploy/hestia/powderbox.stpl \
        /usr/local/hestia/data/templates/web/nginx/powderbox.stpl
sudo chmod 644 /usr/local/hestia/data/templates/web/nginx/powderbox.*tpl
```

В UI: домен → **Edit** → раздел *Advanced Options*:
- **Proxy Template** = `powderbox`
- Apache/PHP не нужны — если стоит PHP-FPM, можно выставить `Proxy Extensions = пусто`.

Сохранить → Хестия перегенерирует конфиг nginx и сделает `nginx -s reload`.

Проверка:

```bash
curl -I http://powderbox.wwder.ru/
curl -fsS http://powderbox.wwder.ru/api/health   # должен вернуть {"status":"ok","service":"api-gateway"}
```

### 6. GitHub Secrets

В репо: **Settings → Secrets and variables → Actions → New repository secret**.

Добавить:

| Секрет | Значение |
|--------|----------|
| `SSH_HOST` | IP или домен сервера |
| `SSH_USER` | `powderbox` |
| `SSH_PORT` | `22` (или нестандартный) |
| `SSH_KEY` | содержимое приватного ключа `~/.ssh/powderbox_deploy` |
| `APP_DIR` | `/home/powderbox/apps/powderbox` |

## Текущий deploy-цикл

```
push в main (или ручной workflow_dispatch)
   │
   ▼
test (matrix x11 сервисов — pytest в параллель)
   │  все зелёные?
   ▼
deploy
   │  ssh powderbox@SERVER_IP
   ▼
cd $APP_DIR
git fetch && git reset --hard origin/main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans
curl /health (retry до 30x)
docker image prune -f
```

На `pull_request → main` отрабатывает только этап `test` — деплой не идёт,
но красные тесты сразу видно в чек-листе PR-а.

Если health-check не прошёл за минуту — GA-шаг падает и тянет в лог последние
200 строк api-gateway. Прошлые контейнеры остаются работать (если `up --build`
упал на одном из сервисов, остальные могут уже быть рестартнуты — стоит проверить).

### Ручной запуск деплоя

В UI GitHub Actions: **Deploy to production → Run workflow**. Или с локальной
машины:

```bash
gh workflow run deploy.yml
```

### Откат

Самое простое — вернуть `main` на предыдущий коммит и снова push:

```bash
git revert <bad-sha>
git push
```

Это запустит обычный деплой с откаченным состоянием.

## Локальный dev — что меняется

**Ничего.** Базовый поток остался:

```bash
docker compose up --build
```

`docker-compose.override.yml` авто-подгружается (bind-mounts кода, hot-reload).
В dev порты по-прежнему смотрят на `0.0.0.0`.

Если хочешь локально проверить prod-сборку:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
```

## Что не торчит наружу (доступ только по SSH-туннелю)

| Что | Локальный порт | Как открыть |
|-----|---------------|-------------|
| Grafana | `127.0.0.1:3001` | `ssh -L 3001:127.0.0.1:3001 powderbox@SERVER_IP` → http://localhost:3001 |
| Prometheus | `127.0.0.1:9090` | `ssh -L 9090:127.0.0.1:9090 ...` |
| RabbitMQ UI | `127.0.0.1:15672` | `ssh -L 15672:127.0.0.1:15672 ...` |

Если хочешь Grafana по поддомену с авторизацией — добавим отдельный nginx-template позже.

## Бэкапы

Все данные лежат в named volumes Docker'а:
`auth_data`, `profile_data`, `equipment_data`, `resort_data`, `weather_data`, `hotel_data`,
`skipass_data`, `lesson_data`, `activity_data`, `stats_data`, `prometheus_data`, `grafana_data`.

Бэкап одной командой (на сервере):

```bash
BACKUP_DIR=/home/powderbox/backups/$(date +%F)
mkdir -p "$BACKUP_DIR"
for vol in $(docker volume ls -q | grep ^powderbox_); do
  docker run --rm -v "$vol":/data -v "$BACKUP_DIR":/backup alpine \
    tar czf /backup/"$vol".tar.gz -C /data .
done
```

Можно повесить cron'ом + ротация старше 14 дней.

## Траблшутинг

| Симптом | Что проверить |
|---------|--------------|
| GA-деплой упал на «Permission denied (publickey)» | Ключ в `SSH_KEY` без `\n` в конце, public-часть в `~powderbox/.ssh/authorized_keys` |
| `docker compose: command not found` на сервере | Docker есть, а compose plugin нет — `apt install docker-compose-plugin` |
| `unknown tag "!override"` | Compose плагин старше v2.24 — `apt update && apt install --only-upgrade docker-compose-plugin` |
| 502 Bad Gateway от HestiaCP | Контейнер frontend/api-gateway не слушает 127.0.0.1, проверь `ss -ltnp \| grep -E "3000\|8000"` |
| 504 на `/api/*` | Какой-то downstream-сервис тормозит — глянь Grafana → Latency p95 по сервисам |
| Grafana и Prometheus не видят новые сервисы | `docker compose restart prometheus` после правки `observability/prometheus/prometheus.yml` |
