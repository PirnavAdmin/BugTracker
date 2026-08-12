pipeline {
    agent any

    stages {
        stage('Deploy Bug Tracker') {
            steps {
                sh '''
                ssh bugtracker 'bash -s' <<'REMOTE_DEPLOY'
                    set -e

                    cd /home/ubuntu/bug-tracking

                    ENV_FILE=/home/ubuntu/bug-tracking/.env
                    ENV_BACKUP=$(mktemp)

                    if [ ! -f "$ENV_FILE" ]; then
                        echo "Production .env is missing at $ENV_FILE"
                        echo "Create it on the server before deploying; do not commit production .env to Git."
                        exit 1
                    fi

                    cp "$ENV_FILE" "$ENV_BACKUP"

                    dump_diagnostics() {
                        status=$?
                        echo "Deploy failed with exit code ${status}"
                        docker compose ps || true
                        docker compose logs --tail=160 backend || true
                        rm -f "$ENV_BACKUP" || true
                        exit "$status"
                    }

                    trap dump_diagnostics ERR

                    git checkout dev2
                    git fetch origin
                    git reset --hard origin/dev2

                    cp "$ENV_BACKUP" "$ENV_FILE"
                    chmod 600 "$ENV_FILE"
                    rm -f "$ENV_BACKUP"

                    echo "Stopping existing containers..."
                    docker compose down

                    echo "Cleaning unused Docker resources..."
                    docker system prune -a -f

                    echo "Building Docker images without cache..."
                    docker compose build --no-cache

                    echo "Starting containers..."
                    docker compose up -d --force-recreate

                    FRONTEND_PORT=$(grep -E '^FRONTEND_PORT=' .env | tail -n 1 | cut -d= -f2)
                    FRONTEND_PORT=${FRONTEND_PORT:-3000}

                    echo "Checking API health on port ${FRONTEND_PORT}..."

                    for attempt in $(seq 1 30); do
                        if curl -fsS "http://localhost:${FRONTEND_PORT}/api/health"; then
                            echo "API health check passed."
                            exit 0
                        fi

                        echo "Waiting for API health check... ${attempt}/30"
                        sleep 5
                    done

                    docker compose ps
                    docker compose logs --tail=120 backend
                    exit 1

                REMOTE_DEPLOY
                '''
            }
        }
    }
}