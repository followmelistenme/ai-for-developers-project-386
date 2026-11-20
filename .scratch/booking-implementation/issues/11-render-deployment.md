# 11: Деплой на Render через MCP

Status: ready-for-agent
State: closed

**Source:** запрос пользователя от 2026-11-20 и подтверждение рабочего
пространства My Workspace, Free Docker Web Service, Frankfurt,
ветка codex/booking-draft-integration и автодеплой при push.

- [x] Сервис создан через Render MCP из корневого Dockerfile.
- [x] Первый деплой завершён успешно; сохранены URL и настройки сервиса.
- [x] Проверены публичные SPA/API/документация и сценарий бронирования.
- [x] Настройки и ограничения запуска документированы.

## Comments

Рабочее пространство подтверждено пользователем:
tea-dc05ld7f3r2c738obql0 (My Workspace). До создания сервисов список пуст.
Используется опубликованный корневой Dockerfile, frontend и Go API в одном
процессе. Данные остаются в памяти; БД и платные ресурсы не создаются.

## Answer

Через Render MCP создан Web Service `booking-calendar-386`:

- Service ID: `srv-dc05r9bm8hqs739jp6h0`.
- URL: https://booking-calendar-386-w289.onrender.com
- Dashboard: https://dashboard.render.com/web/srv-dc05r9bm8hqs739jp6h0
- Free, Frankfurt, один экземпляр, runtime docker.
- Репозиторий followmelistenme/ai-for-developers-project-386,
  ветка codex/booking-draft-integration, Dockerfile ./Dockerfile, контекст .
- Автодеплой включён: autoDeploy=yes, autoDeployTrigger=commit.
- PORT=10000, BACKEND_HOST=0.0.0.0, FRONTEND_DIR=/app/public, GIN_MODE=release.

Первый deploy `dep-dc05ra3m8hqs739jp8dg` коммита a6214f9 завершён
со статусом live 2026-11-20 в 14:49:39 UTC. Сервис подтвердил HTTPS URL
в логах; публичный API ответил HTTP 200.

Браузерная проверка опубликованного сервиса прошла: создание типа встречи,
публикация, перезагрузка прямой ссылки, запись на слот, подтверждение,
просмотр встречи владельцем. Межтиповое частичное наложение 60/30 минут
даёт 409, занятый слот отсутствует в доступных. Ошибок JavaScript нет.
Главная, /owner, /booking, /docs, /openapi.json и /openapi.yaml отвечают 200.
Использованы синтетические контакты домена example.com.

README содержит адрес, все настройки сервиса и ограничения Free:
сон после 15 минут простоя, задержка пробуждения и сброс памяти при остановке,
перезапуске и деплое. Следующий push документации запустит автодеплой
и очистит тестовые данные; ручной повторный deploy не требуется.

`mise run check`: PASS, включая 41 браузерный тест (27.8s), Go -race,
генерацию, линтеры и остальные gates. `git diff --check`: PASS.
Логи: /private/tmp/booking-render-smoke.log, /private/tmp/booking-render-quality.log.
Посторонний GLOSSARY.md сохранён вне изменений среза.
