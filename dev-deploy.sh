#!/bin/bash

# 실시간 개발 & 배포 스크립트
# 사용법: ./dev-deploy.sh "커밋 메시지"

set -e

echo "🔨 Building..."
npm run build

echo "🔄 Restarting service..."
pm2 restart webapp

echo "⏳ Waiting for service to start..."
sleep 2

echo "✅ Testing local service..."
curl -s http://localhost:3000/api/stats | head -20

echo ""
echo "🌐 Sandbox URL:"
echo "https://3000-iwhqnkbi44emm3qlpcntd-583b4d74.sandbox.novita.ai"

# Git push (선택사항)
if [ -n "$1" ]; then
    echo ""
    echo "📦 Committing to Git..."
    git add -A
    git commit -m "$1"
    
    echo "🚀 Pushing to GitHub..."
    git push origin main
    
    echo ""
    echo "✅ Deployed! Will be live on hanchae365.com in ~2 minutes"
    echo "🌐 Production: https://hanchae365.com"
else
    echo ""
    echo "💡 Tip: Add commit message to auto-deploy to production"
    echo "   Example: ./dev-deploy.sh 'Added new feature'"
fi
