#!/bin/bash

# Deployment script for Discord bot on GCP e2-micro
# Run this script on your VM after initial setup

set -euo pipefail

echo "🚀 Starting deployment..."

# Navigate to project directory
cd ~/taysr

# Force-sync to remote so local mutations (e.g., npm install rewriting
# package-lock.json) never block the deploy.
echo "📥 Syncing to origin/main..."
git fetch origin
git reset --hard origin/main
git clean -fd -e .env -e node_modules

# Deterministic install based on the committed lockfile.
echo "📦 Installing dependencies..."
npm ci

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Restart bot with PM2
echo "🔄 Restarting bot..."
pm2 restart taysr

# Show logs
echo "✅ Deployment complete! Showing logs..."
pm2 logs taysr --lines 20
