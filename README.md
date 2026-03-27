# WebRTC Signaling & Video Chat Platform

## Описание

Многоуровневое приложение для видеочата и обмена сообщениями с использованием WebRTC. Состоит из backend-сервера на Go и frontend-клиента на Vue.js, работает через защищённый прокси Nginx. Поддерживает регистрацию, аутентификацию, создание комнат, обмен сообщениями и видеозвонки.

## Архитектура

- **Backend**: Go-сервер (`goserver/`) — REST API и WebSocket signaling, хранение пользователей и комнат, JWT-аутентификация, SQLite.
- **Frontend**: Vue 3 + Vite (`vueclient/`) — SPA для взаимодействия с сервером, видеочат, управление комнатами.
- **Reverse Proxy**: Nginx — SSL-терминация, маршрутизация запросов, защита.
- **Docker**: Контейнеризация всех компонентов, запуск через `docker-compose`.

## Быстрый старт

### 1. Клонирование репозитория

```sh
git clone https://github.com/EremenkoVO/webrtc.git
cd webrtc
```

### 2. Генерация SSL-сертификата (dev)

```sh
./generate-ssl.sh
```

### 3. Запуск через Docker Compose

**Для localhost разработки:**
```sh
./generate-ssl-localhost.sh
docker-compose -f docker-compose.localhost.yml up --build
```

**Для стандартной конфигурации:**
```sh
docker-compose up --build
```

- Frontend: https://localhost:5001
- Backend API: https://localhost:5001/api/v1

> **Примечание**: Для localhost используйте `docker-compose.localhost.yml` (см. [README.localhost.md](README.localhost.md))

## Backend (Go)

- Точка входа: `goserver/cmd/api/main.go`
- Конфиг: `goserver/api/cfg.yaml`
- OpenAPI: `goserver/api/openapi.yaml`
- Миграции: `goserver/migrations/`
- Сборка вручную:
  ```sh
  cd goserver
  go build -o bin/api ./cmd/api
  ./bin/api
  ```
- Тесты: `make test`

## Frontend (Vue)

- Точка входа: `vueclient/src/main.ts`
- Запуск dev-сервера:
  ```sh
  cd vueclient
  npm install
  npm run dev
  ```
- Сборка:
  ```sh
  npm run build
  ```

## Основные зависимости

- Go: gorilla/websocket, JWT, SQLite, oapi-codegen
- Vue: vue, vue-router, pinia, tailwindcss, fontawesome

## Документация

- [DEPLOYMENT.md](DEPLOYMENT.md) — подробное руководство по деплою на сервер
- [vueclient/SIGNALING_GUIDE.md](vueclient/SIGNALING_GUIDE.md) — описание signaling-протокола
- OpenAPI спецификация: `goserver/api/openapi.yaml`

## Presence (online/offline)

- Глобальный presence WebSocket: `GET /api/v1/presence/ws?token=<JWT>`
- События:
  - `presence_snapshot`: `{ "type": "presence_snapshot", "online_users": ["1", "2"] }`
  - `user_online`: `{ "type": "user_online", "user_id": "1" }`
  - `user_offline`: `{ "type": "user_offline", "user_id": "1" }`
- Для списка участников `GET /api/v1/users` может возвращать `last_seen_at` у оффлайн-пользователей.

---

_Для production используйте docker-compose.prod.yml и настройте домен/сертификаты._
