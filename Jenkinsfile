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
                echo 'Checking out source code from Jenkins SCM...'
                checkout scm
            }
        }

        stage('Validate Production ENV') {
            steps {
                sh '''
                    ssh "$REMOTE_HOST" 'bash -s' -- "$APP_DIR" "$ENV_FILE" <<'REMOTE'
                    set -e

                    APP_DIR="$1"
                    ENV_FILE="$2"

                    echo "Checking production environment file..."

                    if [ ! -f "$ENV_FILE" ]; then
                        echo "ERROR: Production .env not found:"
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

                    cd "$APP_DIR"

                    echo "Switching to dev2 branch..."
                    git checkout dev2

                    echo "Fetching latest changes..."
                    git fetch origin

                    echo "Resetting production working tree..."
                    git reset --hard origin/dev2

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

                    echo "Backing up production .env..."

                    cp "$ENV_FILE" "$ENV_BACKUP"
                    chmod 600 "$ENV_BACKUP"

                    echo "Production .env backup created."
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

        stage('Build Docker Images') {
            steps {
                sh '''
                    ssh "$REMOTE_HOST" 'bash -s' -- "$APP_DIR" <<'REMOTE'
                    set -e

                    APP_DIR="$1"

                    cd "$APP_DIR"

                    echo "Building Docker images..."
                    echo "Existing containers will remain running during build."

                    docker compose build --no-cache

                    echo "Docker image build completed successfully."
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

                    cd "$APP_DIR"

                    echo "Stopping existing containers..."

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

                    echo "Cleaning unused Docker resources..."

                    docker image prune -f
                    docker container prune -f
                    docker network prune -f

                    echo "Docker cleanup completed."
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

                    cd "$APP_DIR"

                    echo "Starting application..."

                    docker compose up -d --force-recreate

                    echo "Application containers started."

                    docker compose ps
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

                    cd "$APP_DIR"

                    FRONTEND_PORT=$(grep -E '^FRONTEND_PORT=' .env | tail -n 1 | cut -d= -f2)
                    FRONTEND_PORT=${FRONTEND_PORT:-3000}

                    echo "=========================================="
                    echo "Starting application health check"
                    echo "Health URL: http://localhost:${FRONTEND_PORT}/api/health"
                    echo "=========================================="

                    for attempt in $(seq 1 30); do

                        if curl -fsS \
                            --connect-timeout 5 \
                            --max-time 10 \
                            "http://localhost:${FRONTEND_PORT}/api/health"; then

                            echo ""
                            echo "=========================================="
                            echo "API HEALTH CHECK PASSED"
                            echo "=========================================="

                            docker compose ps

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

                    cd "$APP_DIR"

                    echo "=========================================="
                    echo "FINAL DEPLOYMENT VERIFICATION"
                    echo "=========================================="

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

                    if [ -f "$ENV_BACKUP" ]; then
                        rm -f "$ENV_BACKUP"
                        echo "Temporary .env backup removed."
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
            DEPLOYMENT SUCCESSFUL
            ==========================================
            Application deployed successfully.
            Health check passed.
            '''
        }

        failure {
            echo '''
            ==========================================
            DEPLOYMENT FAILED
            ==========================================
            Collecting production diagnostics...
            '''

            sh '''
                ssh "$REMOTE_HOST" 'bash -s' -- "$APP_DIR" "$ENV_FILE" "$ENV_BACKUP" <<'REMOTE' || true
                APP_DIR="$1"
                ENV_FILE="$2"
                ENV_BACKUP="$3"

                echo "=========================================="
                echo "PRODUCTION DIAGNOSTICS"
                echo "=========================================="

                cd "$APP_DIR" || exit 0

                echo ""
                echo "Container status:"
                docker compose ps || true

                echo ""
                echo "Backend logs:"
                docker compose logs --tail=160 backend || true

                echo ""
                echo "Frontend logs:"
                docker compose logs --tail=100 frontend || true

                echo ""
                echo "Checking .env backup..."

                if [ -f "$ENV_BACKUP" ]; then
                    cp "$ENV_BACKUP" "$ENV_FILE"
                    chmod 600 "$ENV_FILE"
                    echo "Production .env restored from backup."
                    rm -f "$ENV_BACKUP"
                else
                    echo "No .env backup found."
                fi

                echo ""
                echo "Diagnostics completed."
                REMOTE
            '''
        }

        always {
            echo "Jenkins deployment pipeline completed."
        }
    }
}