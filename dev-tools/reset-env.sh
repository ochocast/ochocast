#!/bin/bash

# Navigate to the directory containing this script
cd "$(dirname "$0")"

echo "🛑 Stopping containers and removing Docker volumes..."
docker compose down -v

echo "🧹 Cleaning Minio (S3) folders..."
rm -rf localMinio/run_env
mkdir -p localMinio/run_env/{media,miniature,picture,branding,video}

echo "🚀 Restarting Docker containers..."
docker compose up -d

echo "✨ Dev environment (DB & S3) reset completed successfully!"
