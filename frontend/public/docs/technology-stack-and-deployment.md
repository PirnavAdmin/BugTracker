# Technology Stack, Project Structure, Dependencies, and Deployment

This document summarizes the technology used in this project, how the frontend and backend are organized, how dependencies are managed, and how the application is deployed.

## Project Summary

This repository is a full-stack bug tracking and project management application named CureCode. It provides Jira-like workflows for projects, teams, issues, bugs, tasks, stories, sprints, reports, chat, notifications, Git webhook activity, and workspace settings.

The repository is organized as a monorepo:

```text
.
|-- backend/              Express API, MongoDB models, services, routes, tests
|-- frontend/             React/Vite web application, UI components, tests
|-- deploy/mongo/         Custom MongoDB image and first-run restore backup
|-- docs/                 Project documentation
|-- docker-compose.yml    Multi-container deployment definition
|-- Jenkinsfile           Remote deployment pipeline
|-- .env.example          Root Docker Compose environment template
`-- README.md             Setup and deployment quick reference
```

## Frontend Technology

The frontend is located in `frontend/`.

Main technologies:

| Area | Technology |
| --- | --- |
| UI framework | React 18 |
| Build tool | Vite |
| Language | JavaScript with JSX |
| Styling | Tailwind CSS |
| UI primitives | Radix UI |
| Icons | Lucide React |
| Data fetching/cache | TanStack React Query |
| HTTP client | Axios |
| Routing | React Router DOM |
| Drag and drop | DnD Kit |
| Charts | Recharts |
| Realtime client | Socket.IO Client |
| Animation | Framer Motion |
| Select controls | React Select |
| State utilities | Zustand |
| Testing | Node.js built-in test runner |

Important frontend files:

```text
frontend/src/App.jsx                 Main route tree
frontend/src/main.jsx                React entry point
frontend/src/lib/api.js              API client functions
frontend/src/lib/socket.js           Socket.IO client setup
frontend/src/context/AuthContext.jsx Authentication state
frontend/src/components/             Shared and domain UI components
frontend/src/pages/                  Main application pages
frontend/vite.config.js              Vite config and @ alias
frontend/tailwind.config.js          Tailwind theme/config
frontend/nginx.conf                  Production Nginx static/proxy config
frontend/Dockerfile                  Frontend Docker build
```

The Vite config uses the `@` alias for `frontend/src`, so imports like `@/lib/api` resolve to `frontend/src/lib/api.js`.

## Backend Technology

The backend is located in `backend/`.

Main technologies:

| Area | Technology |
| --- | --- |
| Runtime | Node.js |
| API framework | Express |
| Database ODM | Mongoose |
| Database | MongoDB |
| Authentication | JWT and bcrypt |
| Realtime | Socket.IO |
| Background/queue support | Redis |
| Email | Nodemailer |
| File uploads | Multer |
| S3 integration | AWS SDK for JavaScript |
| CSV import | csv-parser |
| Excel export/import support | ExcelJS |
| Environment config | dotenv |
| Testing | Node.js built-in test runner |

Important backend files:

```text
backend/server.js                  Express app and HTTP server entry point
backend/config/db.js               MongoDB connection
backend/config/env.js              Environment loading and app URL helpers
backend/routes/                    HTTP route definitions
backend/controllers/               Request handlers
backend/models/                    Mongoose schemas/models
backend/services/                  Business services and notification logic
backend/middleware/                Auth, admin, error, and access middleware
backend/utils/                     Shared backend utilities
backend/socket.js                  Socket.IO setup and user emits
backend/scripts/                   Seed, reset, and backup export scripts
backend/tests/                     Backend tests
backend/Dockerfile                 Backend Docker build
```

On startup, `backend/server.js`:

1. Loads environment variables.
2. Connects to MongoDB.
3. Connects to Redis.
4. Ensures the default admin user exists.
5. Runs data synchronization helpers for statuses, workspace scopes, epics, and issue display IDs.
6. Starts the sprint notification worker.
7. Starts Socket.IO.
8. Starts the Express HTTP server.

## Data and Storage

MongoDB is the primary database. The backend uses Mongoose models in `backend/models/` for users, projects, teams, issues, comments, notifications, sprints, chat, workspace settings, and related entities.

Redis is used by backend runtime services, including queue/background behavior.

Uploaded files are stored under:

```text
backend/uploads/
```

In Docker, this path is mounted as a volume:

```text
./backend/uploads:/app/uploads
```

Issue attachments are protected from direct static access and should be served through API-controlled endpoints. Other upload paths, such as chat attachments, are currently exposed as static files.

The repository also includes a MongoDB backup snapshot:

```text
deploy/mongo/backup/bugtracker/
```

The custom Mongo image restores this backup on the first boot of an empty Mongo volume.

## Realtime and Notifications

Realtime functionality is managed with Socket.IO:

| Side | Package |
| --- | --- |
| Backend | `socket.io` |
| Frontend | `socket.io-client` |

The backend emits user-level and workspace-level events for chat, notifications, activity, and Git webhook updates. The frontend listens for notification and chat events and refreshes cached data through TanStack React Query.

The frontend Nginx config proxies Socket.IO traffic through:

```text
/socket.io/
```

to the backend container.

## Git Webhooks

GitHub webhook handling lives in:

```text
backend/routes/webhookRoutes.js
```

The route:

1. Receives GitHub webhook payloads.
2. Matches the repository to a configured project.
3. Updates the project's latest Git activity and Git connection health.
4. Fetches commit stats from GitHub when a token is configured.
5. Emits a workspace realtime event.
6. Sends Git push notifications to related project stakeholders.

The webhook endpoint is:

```text
/api/webhooks/github
```

## Dependency Management

The frontend and backend manage dependencies separately.

Backend:

```bash
cd backend
npm ci
npm run dev
npm test
```

Frontend:

```bash
cd frontend
npm ci
npm run dev
npm test
npm run build
```

Dependency files:

```text
backend/package.json
backend/package-lock.json
frontend/package.json
frontend/package-lock.json
```

Rules used by this project:

- Use `npm ci` for clean installs, CI, and Docker builds.
- Use `npm install <package>` only when intentionally changing dependencies.
- Commit `package.json` and `package-lock.json` together after dependency changes.
- The frontend enforces Node/npm compatibility through `frontend/scripts/preflight.mjs`.
- The expected frontend toolchain is Node `20.19.0+` on Node 20, or Node `22.12.0+`, with npm `10+`.
- The repo includes `.nvmrc` and `.node-version` to standardize Node version selection.

## Local Development

Backend local development:

```bash
cd backend
npm ci
npm run dev
```

Frontend local development:

```bash
cd frontend
npm ci
npm run dev
```

The frontend uses `VITE_API_BASE_URL` to decide where API requests are sent. In Docker production-style runs, this is usually `/api`, and Nginx proxies `/api` to the backend.

## Environment Management

The root `.env.example` is used as the Docker Compose environment template.

Key root environment groups:

| Group | Variables |
| --- | --- |
| Ports | `FRONTEND_PORT`, `BACKEND_PORT`, `MONGO_PORT` |
| MongoDB | `MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD`, `MONGO_APP_DATABASE` |
| Auth | `JWT_SECRET`, `ADMIN_DEFAULT_PASSWORD`, `ENABLE_ADMIN_DEFAULT_LOGIN` |
| Email | `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_SECURE`, `EMAIL_FROM` |
| App URLs | `APP_URL`, `FRONTEND_URL`, `VITE_API_BASE_URL` |
| WebRTC | `VITE_STUN_URL`, `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`, `VITE_ICE_TRANSPORT_POLICY` |
| S3 | `AWS_REGION`, `AWS_S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| Microsoft Graph | `MICROSOFT_GRAPH_BASE_URL`, `MICROSOFT_GRAPH_ACCESS_TOKEN`, `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET` |

The backend loads environment values from both:

```text
backend/.env
.env
```

Production `.env` files should stay outside Git and should be created directly on the target server or injected by CI credentials.

## Docker Deployment

The root `docker-compose.yml` defines the production-style runtime stack:

| Service | Purpose |
| --- | --- |
| `mongo` | MongoDB database with first-run restore support |
| `redis` | Redis service for backend runtime queues/features |
| `backend` | Express API container |
| `frontend` | Nginx container serving the Vite build and proxying API/WebSocket traffic |
| `coturn` | TURN server for WebRTC/chat calling support |

Run the stack locally:

```bash
cp .env.example .env
docker compose up --build
```

Stop the stack:

```bash
docker compose down
```

Reset MongoDB data and force backup restore again:

```bash
docker compose down -v
docker compose up --build
```

## Docker Images

Backend image:

- Base image: `node:20-bookworm-slim`
- Installs production dependencies with `npm ci --omit=dev`
- Runs `npm start`
- Exposes port `5000`

Frontend image:

- Build stage: `node:20.19.0-bookworm-slim`
- Runtime stage: `nginx:1.27-alpine`
- Builds the Vite app with `npm run build`
- Serves the compiled app from `/usr/share/nginx/html`
- Proxies `/api/` and `/socket.io/` to the backend container
- Optionally serves `frontend/public/downloads/CureCode.apk`

Mongo image:

- Base image: `mongo:7`
- Copies `deploy/mongo/restore.js`
- Copies backup JSON files into Mongo's first-run init directory

## Nginx Runtime Behavior

The frontend Nginx config:

- Serves React static assets.
- Sends `/api/` requests to `bug-tracking-backend:5000`.
- Sends `/socket.io/` traffic to the backend with WebSocket upgrade headers.
- Serves `/downloads/CureCode.apk` with Android APK MIME type when the file exists.
- Returns `404` for missing files under `/downloads/`.
- Uses long cache headers for `/assets/`.
- Uses no-cache headers for `index.html` and SPA routes.

## Jenkins Deployment

The root `Jenkinsfile` currently performs remote deployment over SSH to the `bugtracker` host.

Current Jenkins deployment flow:

1. SSH into the target host.
2. Change directory to `/home/ubuntu/bug-tracking`.
3. Verify production `.env` exists on the server.
4. Preserve the server `.env` while updating code.
5. Checkout `dev2`.
6. Fetch from origin.
7. Reset server code to `origin/dev2`.
8. Restore `.env` permissions.
9. Stop existing containers with `docker compose down`.
10. Prune unused Docker resources.
11. Build images with `docker compose build --no-cache`.
12. Start containers with `docker compose up -d --force-recreate`.
13. Health check the app through `http://localhost:${FRONTEND_PORT}/api/health`.
14. Print Docker status and backend logs if deployment fails.

The production `.env` is intentionally not committed. Jenkins expects it to already exist on the remote server.

## Health Checks

Backend health endpoint:

```text
GET /api/health
```

Docker Compose uses this endpoint to check backend health. The frontend service waits for the backend to become healthy before starting.

MongoDB health is checked with `mongosh` and `db.adminCommand('ping')`.

Redis health is checked with `redis-cli ping`.

## Testing and Build Verification

Backend:

```bash
cd backend
npm test
```

Frontend:

```bash
cd frontend
npm test
npm run build
```

The frontend production build is the main validation that React, Vite, Tailwind, imports, and bundled dependencies work together.

## Backup Management

The repo contains a backend script to export the local MongoDB data into the deployment backup folder:

```bash
cd backend
npm run backup:export
```

This exports collection data and indexes into:

```text
deploy/mongo/backup/bugtracker/
```

The restore runs only during the first initialization of an empty Mongo volume.

## Operational Notes

- The frontend container is the public entry point in Docker.
- The backend API is available directly on `BACKEND_PORT` and through the frontend proxy at `/api`.
- Keep secrets in `.env`, Jenkins credentials, or server environment only.
- Do not commit production credentials, SMTP passwords, JWT secrets, TURN credentials, S3 keys, or Microsoft Graph secrets.
- Keep both lockfiles committed so Docker and CI install reproducible dependency versions.
- Use `docker compose logs backend` when API startup or health checks fail.
- Use `docker compose ps` to inspect service state.

