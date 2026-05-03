#!/bin/bash
# Sync perubahan dari Replit ke GitHub → Railway akan auto-deploy

set -e

GITHUB_TOKEN="${GITHUB_TOKEN}"
REPO_URL="https://rideindonesia:${GITHUB_TOKEN}@github.com/rideindonesia/Ride.git"
WORKSPACE="/home/runner/workspace"
TEMP_DIR="/tmp/github-sync-$$"
COMMIT_MSG="${1:-"chore: sync from Replit $(date '+%Y-%m-%d %H:%M')"}"

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ GITHUB_TOKEN tidak ditemukan. Pastikan sudah di-set di Replit Secrets."
  exit 1
fi

echo "🔄 Mulai sync ke GitHub..."

# Clone repo GitHub ke folder temp
echo "📥 Clone dari GitHub..."
git clone --depth=1 "$REPO_URL" "$TEMP_DIR" 2>/dev/null
cd "$TEMP_DIR"

# Copy semua file dari workspace ke temp (exclude hal-hal yang tidak perlu)
echo "📋 Copy file dari workspace..."
rsync -a --delete \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='.replit-artifact' \
  --exclude='dist' \
  --exclude='attached_assets' \
  --exclude='*.tar.gz' \
  --exclude='*.sql' \
  --exclude='cookies.txt' \
  --exclude='ride_secrets_backup.txt' \
  --exclude='/tmp' \
  "$WORKSPACE/" "$TEMP_DIR/" 2>/dev/null || {
    # rsync tidak tersedia, gunakan cp
    echo "📋 Menggunakan cp..."
    for dir in artifacts lib scripts; do
      if [ -d "$WORKSPACE/$dir" ]; then
        cp -r "$WORKSPACE/$dir"/* "$TEMP_DIR/$dir/" 2>/dev/null || true
      fi
    done
    cp "$WORKSPACE/pnpm-workspace.yaml" "$TEMP_DIR/" 2>/dev/null || true
    cp "$WORKSPACE/tsconfig"*.json "$TEMP_DIR/" 2>/dev/null || true
    cp "$WORKSPACE/package.json" "$TEMP_DIR/" 2>/dev/null || true
    cp "$WORKSPACE/pnpm-lock.yaml" "$TEMP_DIR/" 2>/dev/null || true
    cp "$WORKSPACE/replit.md" "$TEMP_DIR/" 2>/dev/null || true
  }

# Git config
git config user.name "rideindonesia"
git config user.email "rideinovasidigital@gmail.com"

# Check apakah ada perubahan
if git diff --quiet && git diff --staged --quiet; then
  # Check untracked files
  UNTRACKED=$(git ls-files --others --exclude-standard | wc -l)
  if [ "$UNTRACKED" -eq "0" ]; then
    echo "✅ Tidak ada perubahan baru. Sudah sinkron dengan GitHub."
    rm -rf "$TEMP_DIR"
    exit 0
  fi
fi

# Add semua perubahan
git add -A

# Tampilkan summary perubahan
echo ""
echo "📝 File yang berubah:"
git diff --staged --stat
echo ""

# Commit
git commit -m "$COMMIT_MSG"

# Push ke GitHub
echo "🚀 Push ke GitHub..."
git push origin main

echo ""
echo "✅ Berhasil! Perubahan sudah di-push ke GitHub."
echo "🚂 Railway akan otomatis deploy dalam beberapa menit."
echo ""

# Cleanup
rm -rf "$TEMP_DIR"
