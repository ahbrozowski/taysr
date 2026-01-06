#!/bin/bash

# Deployment script for Discord bot on GCP e2-micro
# Run this script on your VM after initial setup

set -e

echo "🚀 Starting deployment..."

# Navigate to project directory
cd ~/taysr

# Pull latest changes
echo "📥 Pulling latest code from GitHub..."
git pull

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Restart bot with PM2
echo "🔄 Restarting bot..."
pm2 restart taysr

# Show logs
echo "✅ Deployment complete! Showing logs..."
pm2 logs taysr --lines 20
