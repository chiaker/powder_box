# HestiaCP nginx proxy template для powderbox.wwder.ru (HTTP).
#
# Положить в /usr/local/hestia/data/templates/web/nginx/powderbox.tpl на сервере.
# Соответствующий SSL-вариант — powderbox.stpl.
#
# После копирования: в UI Хестии открыть домен -> Web Template = "powderbox",
# Proxy Template = "powderbox", применить.
#
# Hestia подставит placeholders %domain%, %ip% и т.д.

server {
    listen      %ip%:%proxy_port%;
    server_name %domain_idn% %alias_idn%;

    access_log  /var/log/nginx/domains/%domain%.log combined;
    access_log  /var/log/nginx/domains/%domain%.bytes bytes;
    error_log   /var/log/nginx/domains/%domain%.error.log error;

    client_max_body_size 32m;

    # -----------------------------------------------------------------------
    # API: /api/* -> api-gateway (127.0.0.1:8000), префикс /api отрезается.
    # -----------------------------------------------------------------------
    location /api/ {
        proxy_pass http://127.0.0.1:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header X-Request-ID      $request_id;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }

    # -----------------------------------------------------------------------
    # Статика курортов (картинки и т.д.): /static/* -> resort-service.
    # -----------------------------------------------------------------------
    location /static/ {
        proxy_pass http://127.0.0.1:8004;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_valid 200 1h;
    }

    location /equipment-static/ {
        proxy_pass http://127.0.0.1:8003;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # -----------------------------------------------------------------------
    # Всё остальное -> frontend (статика SPA внутри nginx-контейнера, :3000).
    # -----------------------------------------------------------------------
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Логи Hestia
    include /etc/nginx/conf.d/phpmyadmin.inc*;
}
