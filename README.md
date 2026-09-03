# Bug Tracking SaaS

Full-stack Jira-like bug tracking and project management app with:

- `frontend/`: React + Vite + Tailwind
- `backend/`: Express + Mongoose API
- `deploy/mongo/`: MongoDB image and repo-local backup restore assets
- `docs/`: project documentation and API/flow guide
- `docker-compose.yml`: production-style local deployment

## Deployment Structure

```text
.
|-- backend/
|   |-- Dockerfile
|   |-- .dockerignore
|   |-- .env.example
|   |-- config/
|   |-- controllers/
|   |-- middleware/
|   |-- models/
|   |-- routes/
|   |-- scripts/
|   |   `-- exportMongoBackup.js
|   |-- services/
|   |-- utils/
|   `-- server.js
|-- frontend/
|   |-- Dockerfile
|   |-- .dockerignore
|   |-- .env.example
|   |-- nginx.conf
|   |-- public/
|   |   `-- downloads/
|   |       |-- .gitkeep
|   |       `-- CureCode.apk
|   `-- src/
|-- deploy/
|   `-- mongo/
|       |-- Dockerfile
|       |-- restore.js
|       `-- backup/
|           `-- bugtracker/
|               |-- manifest.json
|               |-- users.json
|               |-- projects.json
|               |-- issues.json
|               `-- ...
|-- docs/
|   `-- PROJECT_API_AND_FLOW.md
|-- docker-compose.yml
|-- .env.example
`-- README.md
```

## What Is Included

- Docker image for the backend API
- Docker image for the frontend with Nginx
- Docker image for MongoDB with first-run restore support
- Exported Mongo backup snapshot from the current local `bugtracker` database
- Compose-based local deployment flow

## Documentation

- [README.md](README.md): setup and deployment
- [docs/PROJECT_API_AND_FLOW.md](docs/PROJECT_API_AND_FLOW.md): API usage, technologies, and end-to-end application flow
- [docs/JENKINS_PIPELINE.md](docs/JENKINS_PIPELINE.md): Jenkins, SonarQube, Docker, and deployment pipeline setup

## Environment Files

Root compose env:

```env
FRONTEND_PORT=3000
BACKEND_PORT=5000
MONGO_PORT=27017
MONGO_ROOT_USERNAME=bugtracker
MONGO_ROOT_PASSWORD=bugtracker
MONGO_APP_DATABASE=bugtracker
JWT_SECRET=change-me
ALLOW_ADMIN_CREDENTIALS=false
EMAIL_HOST=smtp.hostinger.com
EMAIL_PORT=465
EMAIL_USER=your-email@example.com
EMAIL_PASS=your-smtp-password
EMAIL_SECURE=true
EMAIL_FROM=Pirnav Support <your-email@example.com>
APP_URL=http://16.112.106.188
VITE_API_BASE_URL=/api
```

Backend env example:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/bugtracker
JWT_SECRET=change-me
```

Frontend env example:

```env
VITE_API_BASE_URL=/api
```

## Platform Admin Bootstrap

Phase 0 platform authentication is separate from normal CureCode user login.
To create the first SaaS Owner, set these environment variables before startin
the backend or running `npm run seed` in `backend/`:

```env
```

The password must be at least 8 characters and include at least one letter and
one number. The startup bootstrap creates the account only if that platform
admin email does not already exist. To refresh an existing platform admin from
the current `.env` values, run:

```bash
cd backend
npm run reset:platform-admin
```

Platform login is available at `/platform/login`.

## Docker Usage

1. Copy the compose env file:

```bash
cp .env.example .env
```

2. Build and start everything:

```bash
docker compose up --build
```

3. Open the app:

- Frontend: local frontend origin on port `3000`
- Backend API: local backend origin on port `5000`
- Test email route: local backend `/test-email`
- Optional override recipient: local backend `/test-email?to=someone@example.com`
- MongoDB: local MongoDB on port `27017`

## APK Deployment

Place the Android build here before running a frontend Docker build:

```text
frontend/public/downloads/CureCode.apk
```

How it works:

- The frontend Docker build always creates `frontend/public/downloads/` if it is missing.
- If `frontend/public/downloads/CureCode.apk` exists, the image copies it to `/usr/share/nginx/html/downloads/CureCode.apk`.
- If the APK is missing, the Docker build continues and logs:

```text
WARNING: CureCode.apk not found. APK download will be unavailable.
```

Public download URL:

```text
https://<domain>/downloads/CureCode.apk
```

The Nginx config serves `/downloads/` as static files only, so a missing APK returns HTTP `404` instead of the React app shell.

## Frontend Setup (Ubuntu/macOS)

Use the repo-pinned Node version before installing frontend dependencies. The repo now includes both `.nvmrc` and `.node-version`, and the frontend install preflight enforces the same Node/npm range as `frontend/package.json`.

```bash
nvm install 20.19.0
nvm use 20.19.0
node -v
npm -v

cd frontend
npm run preflight
npm ci
npm run dev
```

Expected toolchain:

- Node `20.19.0` or newer on the `20.x` line, or `22.12.0+`
- npm `10+`

For Dockerized runs from a fresh clone:

```bash
cp .env.example .env
docker compose up --build
```

For a frontend-only image build that includes the APK when present:

```bash
cd frontend
docker build -t curecode-frontend .
```

The frontend Docker build intentionally uses `npm ci`, so `frontend/package-lock.json` must stay committed and in sync with `frontend/package.json`.

## Mongo Restore Behavior

- The Mongo image restores the backup from `deploy/mongo/backup/bugtracker/` only on the first boot of an empty Mongo volume.
- If you want to re-run the restore from scratch:

```bash
docker compose down -v
docker compose up --build
```

## Refresh The Mongo Backup

The repo now includes a reusable export script that snapshots the current local database into `deploy/mongo/backup/bugtracker/`.

```bash
cd backend
npm run backup:export
```

This exports:

- collection data as Mongo Extended JSON
- collection indexes in `manifest.json`

## Local Non-Docker Development

Backend:

```bash
cd backend
npm ci
npm run dev
```

Frontend:

```bash
cd frontend
npm ci
npm run dev
```

## Frontend Dependency Workflow

- Use `npm ci` for fresh clones, local verification, and Docker builds.
- Only use `npm install` or `npm uninstall` inside `frontend/` when you are intentionally changing dependencies.
- Always commit both `frontend/package.json` and `frontend/package-lock.json` after dependency changes.
- Before pushing dependency updates, verify them with `cd frontend && npm ci && npm run build`.

## Deployment Notes

- The frontend container serves static files through Nginx and proxies `/api` to the backend container.
- APK deployment is file-based: drop `CureCode.apk` into `frontend/public/downloads/`, rebuild the frontend image, and redeploy the container.
- The deployed APK is served directly from `/usr/share/nginx/html/downloads/CureCode.apk`.
- The frontend Nginx config also proxies `/test-email` to the backend for quick mail verification in Dockerized runs.
- The backend container connects to Mongo using compose network DNS (`mongo`).
- Mail notifications in Docker require `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_SECURE`, `EMAIL_FROM`, and `APP_URL` in the root compose `.env`.
- `APP_URL` should be the public frontend origin, such as an EC2 IP origin or an HTTPS custom domain.
- The backend still seeds the default admin user on startup.
- Workspace isolation remains intact because the existing app logic and Mongo data are unchanged.

## Default Login

```text
email: admin@example.com
password: admin123
```

## Useful Commands

```bash
docker compose up --build
docker compose down
docker compose down -v

cd frontend && docker build -t curecode-frontend .
cd frontend && mkdir -p public/downloads
cd backend && npm run backup:export
cd backend && npm run start
cd frontend && npm run build
```

## APK Verification

After placing `frontend/public/downloads/CureCode.apk` and redeploying the frontend container:

1. Verify the file exists in the container:

```bash
docker exec -it <frontend-container> ls -l /usr/share/nginx/html/downloads/
```

2. Verify the URL returns the APK MIME type:

```bash
curl -I https://<domain>/downloads/CureCode.apk
```

Expected header:

```text
Content-Type: application/vnd.android.package-archive
```

3. Verify the browser downloads `CureCode.apk` and not `CureCode.apk.html`.

4. Verify the missing-file behavior:

```bash
curl -I https://<domain>/downloads/CureCode.apk
```

If the APK was not deployed, the response must be:

- HTTP `404`
- not `200`
- not the React `index.html` page
