pipeline {
    agent any

    environment {
        REMOTE_HOST = 'bugtracker'
        APP_DIR     = '/home/ubuntu/bug-tracking'
        ENV_FILE    = '/home/ubuntu/bug-tracking/.env'
        ENV_BACKUP  = '/home/ubuntu/bug-tracking/.env.deploy-backup'
    }

    stages {

        stage('Checkout SCM') {
            steps {
                echo '=========================================='
                echo 'CHECKING OUT SOURCE CODE'
                echo '=========================================='

                checkout scm

                echo 'Source code checkout completed.'
            }
        }

        stage('Validate Production ENV') {
            steps {
                sh '''
ssh "$REMOTE_HOST" 'bash -s' -- "$APP_DIR" "$ENV_FILE" <<'REMOTE'
set -e

APP_DIR="$1"
ENV_FILE="$2"

echo "=========================================="
echo "VALIDATING PRODUCTION ENVIRONMENT"
echo "=========================================="

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: Production .env is missing:"
    echo "$ENV_FILE"
    exit 1
fi

chmod 600 "$ENV_FILE"

echo "Production .env found."
echo "Environment validation passed."

REMOTE
'''
            }
        }

        stage('Sync Production Code') {
            steps {
                sh '''
ssh "$REMOTE_HOST" 'bash -s' -- "$APP_DIR" <<'REMOTE'
set -e

APP_DIR="$1"

echo "=========================================="
echo "SYNCING PRODUCTION CODE"
echo "=========================================="

cd "$APP_DIR"

echo "Current branch:"
git branch --show-current

echo ""
echo "Switching to dev2..."
git checkout dev2

echo ""
echo "Fetching latest changes..."
git fetch origin

echo ""
echo "Resetting to origin/dev2..."
git reset --hard origin/dev2

echo ""
echo "Latest commit:"
git log -1 --oneline

echo ""
echo "Production code synchronized."

REMOTE
'''
            }
        }

        stage('Backup Production ENV') {
            steps {
                sh '''
ssh "$REMOTE_HOST" 'bash -s' -- "$ENV_FILE" "$ENV_BACKUP" <<'REMOTE'
set -e

ENV_FILE="$1"
ENV_BACKUP="$2"

echo "=========================================="
echo "BACKING UP PRODUCTION ENV"
echo "=========================================="

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: .env file not found."
    exit 1
fi

cp "$ENV_FILE" "$ENV_BACKUP"
chmod 600 "$ENV_BACKUP"

echo "Production .env backup created."

REMOTE
'''
            }
        }

        stage('Build Docker Images') {
            steps {
                sh '''
ssh "$REMOTE_HOST" 'bash -s' -- "$APP_DIR" <<'REMOTE'
set -e

APP_DIR="$1"

echo "=========================================="
echo "BUILDING DOCKER IMAGES"
echo "=========================================="

cd "$APP_DIR"

docker compose build --no-cache

echo ""
echo "Docker images built successfully."

REMOTE
'''
            }
        }

        stage('Stop Existing Containers') {
            steps {
                sh '''
ssh "$REMOTE_HOST" 'bash -s' -- "$APP_DIR" <<'REMOTE'
set -e

APP_DIR="$1"

echo "=========================================="
echo "STOPPING EXISTING CONTAINERS"
echo "=========================================="

cd "$APP_DIR"

docker compose down

echo "Existing containers stopped."

REMOTE
'''
            }
        }

        stage('Clean Docker Resources') {
            steps {
                sh '''
ssh "$REMOTE_HOST" 'bash -s' <<'REMOTE'
set -e

echo "=========================================="
echo "CLEANING DOCKER RESOURCES"
echo "=========================================="

echo "Removing unused Docker images..."
docker image prune -f

echo "Removing stopped Docker containers..."
docker container prune -f

echo "Removing unused Docker networks..."
docker network prune -f

echo ""
echo "Docker cleanup completed."

REMOTE
'''
            }
        }

        stage('Restore Production ENV') {
            steps {
                sh '''
ssh "$REMOTE_HOST" 'bash -s' -- "$ENV_FILE" "$ENV_BACKUP" <<'REMOTE'
set -e

ENV_FILE="$1"
ENV_BACKUP="$2"

echo "=========================================="
echo "RESTORING PRODUCTION ENV"
echo "=========================================="

if [ ! -f "$ENV_BACKUP" ]; then
    echo "ERROR: .env backup does not exist."
    exit 1
fi

cp "$ENV_BACKUP" "$ENV_FILE"
chmod 600 "$ENV_FILE"

echo "Production .env restored."

REMOTE
'''
            }
        }

        stage('Start Application') {
            steps {
                sh '''
ssh "$REMOTE_HOST" 'bash -s' -- "$APP_DIR" <<'REMOTE'
set -e

APP_DIR="$1"

echo "=========================================="
echo "STARTING APPLICATION"
echo "=========================================="

cd "$APP_DIR"

docker compose up -d --force-recreate

echo ""
echo "Container status:"
docker compose ps

echo ""
echo "Application containers started."

REMOTE
'''
            }
        }

        stage('Health Check') {
            steps {
                sh '''
ssh "$REMOTE_HOST" 'bash -s' -- "$APP_DIR" <<'REMOTE'
set -e

APP_DIR="$1"

echo "=========================================="
echo "APPLICATION HEALTH CHECK"
echo "=========================================="

cd "$APP_DIR"

FRONTEND_PORT=$(grep -E '^FRONTEND_PORT=' .env | tail -n 1 | cut -d= -f2)

if [ -z "$FRONTEND_PORT" ]; then
    FRONTEND_PORT=3000
fi

HEALTH_URL="http://localhost:${FRONTEND_PORT}/api/health"

echo "Health URL: $HEALTH_URL"
echo ""

for attempt in $(seq 1 30); do

    if curl -fsS \
        --connect-timeout 5 \
        --max-time 10 \
        "$HEALTH_URL"; then

        echo ""
        echo "=========================================="
        echo "API HEALTH CHECK PASSED"
        echo "=========================================="

        exit 0
    fi

    echo "Health check attempt ${attempt}/30 failed."
    echo "Waiting 5 seconds..."

    sleep 5
done

echo ""
echo "=========================================="
echo "API HEALTH CHECK FAILED"
echo "=========================================="

echo ""
echo "Container status:"
docker compose ps

echo ""
echo "Backend logs:"
docker compose logs --tail=150 backend

exit 1

REMOTE
'''
            }
        }

        stage('Deployment Verification') {
            steps {
                sh '''
ssh "$REMOTE_HOST" 'bash -s' -- "$APP_DIR" <<'REMOTE'
set -e

APP_DIR="$1"

echo "=========================================="
echo "FINAL DEPLOYMENT VERIFICATION"
echo "=========================================="

cd "$APP_DIR"

echo ""
echo "Docker Compose status:"
docker compose ps

echo ""
echo "Running containers:"
docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"

echo ""
echo "Deployment verification completed."

REMOTE
'''
            }
        }

        stage('Cleanup ENV Backup') {
            steps {
                sh '''
ssh "$REMOTE_HOST" 'bash -s' -- "$ENV_BACKUP" <<'REMOTE'
set -e

ENV_BACKUP="$1"

echo "=========================================="
echo "CLEANING TEMPORARY ENV BACKUP"
echo "=========================================="

if [ -f "$ENV_BACKUP" ]; then
    rm -f "$ENV_BACKUP"
    echo "Temporary .env backup removed."
else
    echo "No temporary .env backup found."
fi

REMOTE
'''
            }
        }
    }

    post {

        success {
            echo '''
==========================================
CURECODE DEPLOYMENT SUCCESSFUL
==========================================

Production ENV validated.
Production code synchronized.
Docker images built.
Application deployed.
Health check passed.
Deployment verification completed.

==========================================
'''
        }

        failure {
            echo '''
==========================================
CURECODE DEPLOYMENT FAILED
==========================================

Collecting production diagnostics...

==========================================
'''

            sh '''
ssh "$REMOTE_HOST" 'bash -s' -- "$APP_DIR" "$ENV_FILE" "$ENV_BACKUP" <<'REMOTE' || true

APP_DIR="$1"
ENV_FILE="$2"
ENV_BACKUP="$3"

echo "=========================================="
echo "PRODUCTION DIAGNOSTICS"
echo "=========================================="

cd "$APP_DIR" 2>/dev/null || exit 0

echo ""
echo "Docker Compose status:"
docker compose ps || true

echo ""
echo "Backend logs:"
docker compose logs --tail=160 backend || true

echo ""
echo "Frontend logs:"
docker compose logs --tail=100 frontend || true

echo ""
echo "=========================================="
echo "ENV BACKUP CHECK"
echo "=========================================="

if [ -f "$ENV_BACKUP" ]; then

    echo "Backup found."
    echo "Restoring production .env..."

    cp "$ENV_BACKUP" "$ENV_FILE"
    chmod 600 "$ENV_FILE"

    rm -f "$ENV_BACKUP"

    echo "Production .env restored."

else

    echo "No .env backup found."

fi

echo ""
echo "Diagnostics completed."

REMOTE
'''
        }

        always {
            echo 'Jenkins pipeline execution completed.'
        }
    }
}